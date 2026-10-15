/**
 * Per-player views (Technical Architecture spec §10). Clients and bots only
 * ever receive a PlayerView: everything that player may know and nothing else.
 */
import { sortedEntries } from '../collections.js';
import type { MatchContext } from './context.js';
import { postureBand, posturePoints } from './derived.js';
import { isPariah } from './tension.js';
import type {
  Chain,
  CovertRecord,
  GameState,
  Installation,
  MatchMeta,
  PendingDecision,
  PlayerId,
  PlayerState,
  TerritoryState,
  UnitStack,
} from './state.js';

export interface PublicPlayer {
  id: PlayerId;
  viable: boolean;
  blame: number;
  infamy: number;
  pariah: boolean;
  peaceBrokerTokens: number;
  reactionPoints: number;
  postureBand: string;
  /** Exact public posture (shown on hover). */
  posturePoints: number;
}

export type ViewInstallation = Omit<
  Installation,
  'loaded' | 'magazine' | 'mode' | 'pendingMode' | 'hidden'
> & {
  /** Only for your own installations, or industry (whose mode is visible). */
  mode: string | null;
  loaded: Record<string, number> | null;
  magazine: number | null;
  hidden: boolean;
};

export type ViewUnit = Omit<UnitStack, 'count' | 'unsupplied' | 'hidden'> & {
  /** Exact size: yours, a partner's, or revealed; otherwise null. */
  count: number | null;
  unsupplied: number | null;
  hidden: boolean;
};

export interface PlayerView {
  you: PlayerId;
  meta: Omit<MatchMeta, 'seed'>;
  round: number;
  phase: GameState['phase'];
  playerIds: PlayerId[];
  initiative: number;
  me: PlayerState;
  players: Record<PlayerId, PublicPlayer>;
  territories: Record<string, TerritoryState>;
  installations: Record<string, ViewInstallation>;
  units: Record<string, ViewUnit>;
  tension: GameState['tension'];
  relations: GameState['relations'];
  hostility: GameState['hostility'];
  treaties: GameState['treaties'];
  cooldowns: GameState['cooldowns'];
  modifiers: GameState['modifiers'];
  reveals: GameState['reveals'];
  deck: { drawPile: number; discard: string[] };
  devastation: number;
  lastCombat: GameState['lastCombat'];
  disruptedLanes: GameState['disruptedLanes'];
  /** Your pending decisions only. */
  decisions: PendingDecision[];
  /** Who still has a main action waiting, without revealing what it is (yours in full). */
  actionQueue: { player: PlayerId; action: GameState['actionQueue'][number]['action'] | null }[];
  chain: (Omit<Chain, 'answers'> & { answers: Record<PlayerId, string> }) | null;
  operations: GameState['operations'];
  myNuclearPlans: GameState['nuclearPlans'][string];
  honorCalls: GameState['honorCalls'];
  crisisStage: GameState['crisisStage'];
  myCrisisVote: GameState['crisisVotes'][string] | null;
  covert: {
    myOperations: GameState['covert']['operations'];
    myCountermeasures: GameState['covert']['countermeasures'];
    /** Resolved operations as you know them: the actor only if it was yours or exposed. */
    history: (Omit<CovertRecord, 'owner'> & { owner: PlayerId | null })[];
  };
  lastSeq: number;
  result: GameState['result'];
}

function partners(state: GameState, player: PlayerId): Set<PlayerId> {
  const set = new Set<PlayerId>();
  for (const t of state.treaties) {
    if (t.kind === 'defensive' && t.parties.includes(player)) for (const p of t.parties) set.add(p);
  }
  set.add(player);
  return set;
}

function revealedTo(state: GameState, player: PlayerId, of: PlayerId, subject: string): boolean {
  return state.reveals.some(
    (r) => r.to === player && r.of === of && r.subject === subject && r.untilRound >= state.round,
  );
}

/** Sea zones a player can see into: those holding or next to their (or a partner's) patrols. */
function seaVision(
  ctx: MatchContext,
  state: GameState,
  allies: ReadonlySet<PlayerId>,
): Set<string> {
  const zones = new Set<string>();
  for (const [, u] of sortedEntries(state.units)) {
    if (u.kind !== 'patrol' || !allies.has(u.owner)) continue;
    zones.add(u.location);
    for (const z of ctx.seaZones.get(u.location)?.adjacentSea ?? []) zones.add(z);
  }
  return zones;
}

export function viewFor(ctx: MatchContext, state: GameState, player: PlayerId): PlayerView {
  const me = state.players[player];
  if (!me) throw new Error(`unknown player "${player}"`);
  const allies = partners(state, player);
  const vision = seaVision(ctx, state, allies);

  const players: Record<PlayerId, PublicPlayer> = {};
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    const pp = posturePoints(ctx, state, id);
    players[id] = {
      id,
      viable: p.viable,
      blame: p.blame,
      infamy: p.infamy,
      pariah: isPariah(ctx, state, id),
      peaceBrokerTokens: p.peaceBrokerTokens,
      reactionPoints: p.reactionPoints,
      postureBand: postureBand(ctx, pp),
      posturePoints: pp,
    };
  }

  const installations: Record<string, ViewInstallation> = {};
  for (const [id, inst] of sortedEntries(state.installations)) {
    const mine = inst.owner === player;
    if (inst.hidden && !mine) continue;
    const breakdown = mine || revealedTo(state, player, inst.owner, 'nuclearBreakdown');
    installations[id] = {
      ...inst,
      mode: mine || inst.kind === 'industry' ? inst.mode : null,
      pendingMode: mine ? inst.pendingMode : null,
      loaded: breakdown ? { ...inst.loaded } : null,
      magazine: mine ? inst.magazine : null,
      hidden: mine ? inst.hidden : false,
    } as ViewInstallation;
  }

  const units: Record<string, ViewUnit> = {};
  for (const [id, u] of sortedEntries(state.units)) {
    const mine = u.owner === player;
    if (u.hidden && !mine) continue;
    const atSea = ctx.seaZones.has(u.location);
    const known =
      allies.has(u.owner) ||
      revealedTo(state, player, u.owner, u.kind === 'submarine' ? 'submarines' : 'patrols');
    if (atSea && !known && !vision.has(u.location)) continue;
    units[id] = {
      ...u,
      count: known ? u.count : null,
      unsupplied: mine ? u.unsupplied : null,
      hidden: mine ? u.hidden : false,
    };
  }

  const chain = state.chain
    ? {
        ...structuredClone(state.chain),
        answers: Object.fromEntries(
          sortedEntries(state.chain.answers).filter(([id]) => id === player),
        ),
      }
    : null;

  const meta: Omit<MatchMeta, 'seed'> = {
    matchId: state.meta.matchId,
    rulesetId: state.meta.rulesetId,
    rulesetHash: state.meta.rulesetHash,
    mapId: state.meta.mapId,
    deckId: state.meta.deckId,
    scenarioId: state.meta.scenarioId,
    formatVersion: state.meta.formatVersion,
  };
  return {
    you: player,
    meta,
    round: state.round,
    phase: state.phase,
    playerIds: [...state.playerIds],
    initiative: state.initiative,
    me: structuredClone(me),
    players,
    territories: structuredClone(state.territories),
    installations,
    units,
    tension: structuredClone(state.tension),
    relations: { ...state.relations },
    hostility: { ...state.hostility },
    treaties: structuredClone(state.treaties),
    cooldowns: structuredClone(state.cooldowns),
    modifiers: structuredClone(state.modifiers),
    reveals: state.reveals.filter((r) => r.to === player).map((r) => ({ ...r })),
    deck: { drawPile: state.deck.draw.length, discard: [...state.deck.discard] },
    devastation: state.devastation,
    lastCombat: state.lastCombat,
    disruptedLanes: structuredClone(state.disruptedLanes),
    decisions: state.decisions.filter((d) => d.player === player).map((d) => structuredClone(d)),
    actionQueue: state.actionQueue.map((q) => ({
      player: q.player,
      action: q.player === player ? structuredClone(q.action) : null,
    })),
    chain,
    operations: structuredClone(state.operations),
    myNuclearPlans: structuredClone(state.nuclearPlans[player] ?? []),
    honorCalls: structuredClone(state.honorCalls),
    crisisStage: state.crisisStage,
    myCrisisVote: state.crisisVotes[player] ?? null,
    covert: {
      myOperations: structuredClone(state.covert.operations.filter((o) => o.owner === player)),
      myCountermeasures: structuredClone(
        state.covert.countermeasures.filter((c) => c.owner === player),
      ),
      history: state.covert.history
        .filter((h) => h.outcome !== 'fizzled' || h.owner === player)
        .map((h) => ({
          ...h,
          victims: [...h.victims],
          owner: h.owner === player || h.outcome === 'exposed' ? h.owner : null,
        })),
    },
    lastSeq: state.lastSeq[player] ?? 0,
    result: structuredClone(state.result),
  };
}
