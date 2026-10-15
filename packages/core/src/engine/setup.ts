import { compactRecord, sortedEntries } from '../collections.js';
import { expandDeck } from '../data/cards.js';
import { rulesetHash } from '../data/ruleset.js';
import { createContext, installationRules, type MatchContext } from './context.js';
import type { DeckDef } from '../data/cards.js';
import type { MapDef } from '../data/map.js';
import type { Ruleset } from '../data/ruleset.js';
import type { ScenarioDef } from '../data/scenario.js';
import type { CombatResolver } from './combat-interface.js';
import { shuffleWith } from './random.js';
import { settleTension } from './tension.js';
import { pairKey, type GameState, type Installation, type PlayerId } from './state.js';

export const FORMAT_VERSION = 1;

export interface MatchConfig {
  readonly matchId: string;
  readonly seed: number;
  readonly players: number;
  readonly ruleset: Ruleset;
  readonly map: MapDef;
  readonly deck: DeckDef;
  readonly scenario: ScenarioDef;
  readonly combat?: CombatResolver;
}

/** Builds the opening state: round 1, at planning (Technical Architecture spec §7). */
export function createMatch(config: MatchConfig): { ctx: MatchContext; state: GameState } {
  const { ruleset, map, deck, scenario } = config;
  const ctx = createContext(ruleset, map, deck, scenario, config.combat ?? null);
  const setup = map.playerCounts[String(config.players)];
  if (!setup) throw new Error(`map ${map.id} has no setup for ${config.players} players`);
  const { min, max } = ruleset.match.players;
  if (config.players < min || config.players > max)
    throw new Error(`ruleset allows ${min}–${max} players`);
  const playerIds: PlayerId[] = [...setup.homes].sort();
  const active = new Set(playerIds);

  const state: GameState = {
    meta: {
      matchId: config.matchId,
      rulesetId: `${ruleset.manifest.id}-${ruleset.manifest.version}`,
      rulesetHash: rulesetHash(ruleset),
      mapId: map.id,
      deckId: `${deck.id}-${deck.version}`,
      scenarioId: scenario.id,
      seed: config.seed >>> 0,
      formatVersion: FORMAT_VERSION,
    },
    round: 1,
    phase: 'planning',
    playerIds,
    initiative: 0,
    players: {},
    territories: {},
    installations: {},
    units: {},
    nextId: 1,
    tension: { value: ruleset.tension.start, floor: 0, release: 'locked', log: [] },
    relations: {},
    hostility: {},
    deck: { draw: [], discard: [], covertDiscard: [] },
    devastation: 0,
    lastCombat: 'none',
    disruptedLanes: [],
    rng: {},
    decisions: [],
    planningOrders: {},
    crisisVotes: {},
    modifiers: [],
    treaties: [],
    cooldowns: [],
    reveals: [],
    actionQueue: [],
    chain: null,
    operations: [],
    nuclearPlans: {},
    defensePolicies: {},
    crisisStage: 'vote',
    honorCalls: [],
    covert: { operations: [], countermeasures: [], history: [] },
    lastSeq: {},
    result: null,
  };

  for (const id of playerIds) {
    state.players[id] = {
      id,
      home: id,
      reserves: { ...ruleset.economy.startingReserves },
      hand: [],
      stock: compactRecord(scenario.stock),
      hiddenStock: {},
      reactionPoints: ruleset.match.reactionPointsPerRound,
      blame: 0,
      infamy: 0,
      blameGainedThisRound: false,
      peaceBrokerTokens: 0,
      viable: true,
      counterIntel: 0,
    };
  }
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      state.relations[pairKey(playerIds[i]!, playerIds[j]!)] = 'peace';
    }
  }

  for (const def of map.territories) {
    const owner = def.homeOf !== null && active.has(def.homeOf) ? def.homeOf : null;
    state.territories[def.id] = {
      owner,
      startingOwner: owner,
      population: def.population,
      hungry: 0,
      militia: owner === null ? ruleset.match.neutral.militiaPerTerritory : 0,
      contestedRounds: 0,
      contaminationRounds: 0,
    };
    if (owner === null) continue;
    let site = 0;
    for (const entry of def.start) {
      const [kind = '', upgrade] = entry.split(':');
      addInstallation(ctx, state, {
        kind,
        owner,
        territory: def.id,
        site: site++,
        upgraded: upgrade !== undefined,
      });
    }
    const slot = scenario.homes[def.role];
    for (const placed of slot?.installations ?? []) {
      addInstallation(ctx, state, {
        kind: placed.kind,
        owner,
        territory: def.id,
        site: site++,
        upgraded: placed.upgraded ?? false,
        loaded: compactRecord(placed.loaded ?? {}),
      });
    }
    for (const [kind, count] of sortedEntries(slot?.units ?? {})) {
      if (count > 0) addUnits(state, owner, kind, def.id, count);
    }
  }

  state.deck.draw = shuffleWith(state, 'deck', expandDeck(deck));
  for (const id of playerIds) drawCards(state, id, ruleset.match.hand.start);

  settleTension(ctx, state);
  return { ctx, state };
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

export function addInstallation(
  ctx: MatchContext,
  state: GameState,
  spec: {
    kind: string;
    owner: PlayerId;
    territory: string;
    site: number;
    upgraded?: boolean;
    loaded?: Record<string, number>;
    mode?: string;
    hidden?: boolean;
  },
): Installation {
  const rules = installationRules(ctx, spec.kind);
  const modes = rules.economy?.modes;
  const inst: Installation = {
    id: newId(state, 'i'),
    kind: spec.kind,
    owner: spec.owner,
    territory: spec.territory,
    site: spec.site,
    condition: 'operational',
    upgraded: spec.upgraded ?? false,
    mode: modes ? (spec.mode ?? rules.economy?.defaultMode ?? null) : null,
    pendingMode: null,
    loaded: spec.loaded ?? {},
    magazine: rules.magazine,
    repairCompletesRound: null,
    hardHits: 0,
    hidden: spec.hidden ?? false,
  };
  state.installations[inst.id] = inst;
  return inst;
}

export function addUnits(
  state: GameState,
  owner: PlayerId,
  kind: string,
  location: string,
  count: number,
  hidden = false,
): void {
  for (const [, stack] of sortedEntries(state.units)) {
    if (
      stack.owner === owner &&
      stack.kind === kind &&
      stack.location === location &&
      stack.hidden === hidden
    ) {
      stack.count += count;
      return;
    }
  }
  const id = newId(state, 'u');
  state.units[id] = { id, owner, kind, location, count, unsupplied: 0, hidden };
}

/** Draws cards into a hand, reshuffling the discard pile into a new draw pile when empty. */
export function drawCards(state: GameState, player: PlayerId, count: number): number {
  const p = state.players[player];
  if (!p) return 0;
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (state.deck.draw.length === 0) {
      if (state.deck.discard.length === 0) break;
      state.deck.draw = shuffleWith(state, 'deck', state.deck.discard);
      state.deck.discard = [];
    }
    const card = state.deck.draw.shift();
    if (card === undefined) break;
    p.hand.push(card);
    drawn++;
  }
  return drawn;
}
