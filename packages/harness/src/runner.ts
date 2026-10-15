/**
 * Plays bot matches headlessly and records the metrics from main design §16
 * (Technical Architecture spec §14).
 */
import { createBot, type Bot, type Personality } from '@nukka/ai';
import { autopilotResolver } from '@nukka/combat';
import {
  checkpoint,
  createMatch,
  defaultCommand,
  logHeader,
  scoreFor,
  startMatch,
  stateHash,
  submit,
  viewFor,
  type DeckDef,
  type MatchLog,
  type GameEvent,
  type GameState,
  type MapDef,
  type Ruleset,
  type ScenarioDef,
} from '@nukka/core';

export interface MatchSetup {
  readonly ruleset: Ruleset;
  readonly map: MapDef;
  readonly deck: DeckDef;
  readonly scenario: ScenarioDef;
  /** One personality per seat, in seat order (A, B, C, D). */
  readonly seats: readonly Personality[];
  readonly seed: number;
  readonly matchId?: string;
}

export interface MatchRecord {
  matchId: string;
  seed: number;
  seats: Record<string, string>;
  reason: string;
  rounds: number;
  scores: Record<string, number>;
  winners: string[];
  winnerPersonalities: string[];
  /** Leader by score after round 6, to test snowballing. */
  midLeader: string | null;
  tensionByRound: number[];
  maxTension: number;
  releaseOpenRounds: number;
  firstNuclearRound: number | null;
  firstNuclearPlayer: string | null;
  detonations: number;
  lastRoundDetonations: number;
  captures: number;
  wars: number;
  treaties: number;
  cardsPlayed: number;
  covert: { success: number; foiled: number; exposed: number };
  eliminations: string[];
  /** Bot commands the engine rejected before one was accepted. */
  rejected: number;
  /** Decisions where every bot candidate was rejected and the safe default was used. */
  defaulted: number;
  decisions: number;
  hash: string;
  ms: number;
  /** Full command log, for replays (omitted from saved summaries). */
  log?: MatchLog;
}

const MAX_DECISIONS = 20_000;

export function runMatch(setup: MatchSetup): MatchRecord {
  const started = performance.now();
  const players = setup.seats.length;
  const { ctx, state: created } = createMatch({
    matchId: setup.matchId ?? `m${setup.seed}`,
    seed: setup.seed,
    players,
    ruleset: setup.ruleset,
    map: setup.map,
    deck: setup.deck,
    scenario: setup.scenario,
    combat: autopilotResolver,
  });
  let state: GameState = startMatch(created);
  const log: MatchLog = { header: logHeader(state), commands: [], hashes: [] };
  const lastHashed = { value: 0 };
  checkpoint(log.hashes, state, lastHashed);
  const bots = new Map<string, Bot>();
  const seats: Record<string, string> = {};
  state.playerIds.forEach((id, i) => {
    const personality = setup.seats[i]!;
    bots.set(id, createBot(ctx, id, personality, setup.seed));
    seats[id] = personality.id;
  });

  const record: MatchRecord = {
    matchId: state.meta.matchId,
    seed: setup.seed,
    seats,
    reason: '',
    rounds: 0,
    scores: {},
    winners: [],
    winnerPersonalities: [],
    midLeader: null,
    tensionByRound: [],
    maxTension: state.tension.value,
    releaseOpenRounds: 0,
    firstNuclearRound: null,
    firstNuclearPlayer: null,
    detonations: 0,
    lastRoundDetonations: 0,
    captures: 0,
    wars: 0,
    treaties: 0,
    cardsPlayed: 0,
    covert: { success: 0, foiled: 0, exposed: 0 },
    eliminations: [],
    rejected: 0,
    defaulted: 0,
    decisions: 0,
    hash: '',
    ms: 0,
  };

  const observe = (events: readonly GameEvent[], round: number) => {
    for (const e of events) {
      switch (e.type) {
        case 'ReleaseDecided':
          if (e['release'] === 'open') record.releaseOpenRounds++;
          break;
        case 'FirstNuclearUse':
          record.firstNuclearRound = round;
          record.firstNuclearPlayer = e['player'] as string;
          break;
        case 'NuclearDetonation':
          record.detonations++;
          if (round === setup.ruleset.match.rounds) record.lastRoundDetonations++;
          break;
        case 'TerritoryCaptured':
          record.captures++;
          break;
        case 'WarDeclared':
          record.wars++;
          break;
        case 'TreatySigned':
          record.treaties++;
          break;
        case 'CardPlayed':
          record.cardsPlayed++;
          break;
        case 'CovertEffect': {
          const outcome = e['outcome'] as 'success' | 'foiled' | 'exposed';
          record.covert[outcome]++;
          break;
        }
        case 'PlayerEliminated':
          record.eliminations.push(e['player'] as string);
          break;
      }
    }
  };

  let lastRound = 0;
  while (state.phase !== 'ended') {
    if (++record.decisions > MAX_DECISIONS)
      throw new Error(`match ${record.matchId} did not finish`);
    const decision = state.decisions[0];
    if (!decision) throw new Error(`match ${record.matchId} is stuck in ${state.phase}`);
    if (state.round !== lastRound && state.phase === 'planning') {
      lastRound = state.round;
      record.tensionByRound.push(state.tension.value);
      if (state.round === 7) {
        const ranked = state.playerIds
          .filter((id) => state.players[id]?.viable)
          .map((id) => [id, scoreFor(ctx, state, id).total] as const)
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
        record.midLeader = ranked[0]?.[0] ?? null;
      }
    }
    const bot = bots.get(decision.player)!;
    const candidates = bot.decide(viewFor(ctx, state, decision.player), decision);
    const round = state.round;
    let accepted = false;
    for (const cmd of [...candidates, defaultCommand(decision)]) {
      const isDefault = !candidates.includes(cmd);
      const envelope = {
        matchId: state.meta.matchId,
        playerId: decision.player,
        seq: (state.lastSeq[decision.player] ?? 0) + 1,
        cmd,
      };
      const result = submit(ctx, state, envelope);
      if (result.ok) {
        state = result.state;
        log.commands.push(envelope);
        checkpoint(log.hashes, state, lastHashed);
        observe(result.events, round);
        if (isDefault) record.defaulted++;
        accepted = true;
        break;
      }
      record.rejected++;
      if (process.env['NUKKA_DEBUG_REJECTIONS'])
        console.error(`${decision.player} ${decision.kind}: ${result.problems.join('; ')}`);
    }
    if (!accepted)
      throw new Error(
        `even the default command was rejected for ${decision.player} (${decision.kind})`,
      );
    record.maxTension = Math.max(record.maxTension, state.tension.value);
  }

  const result = state.result!;
  record.reason = result.reason;
  record.rounds = state.round;
  record.scores = result.scores;
  record.winners = result.winners;
  record.winnerPersonalities = result.winners.map((id) => seats[id]!);
  record.hash = stateHash(state);
  record.ms = Math.round(performance.now() - started);
  record.log = log;
  return record;
}

export interface Summary {
  matches: number;
  byPersonality: Record<string, { seats: number; wins: number; winRate: number; avgScore: number }>;
  reasons: Record<string, number>;
  avgMaxTension: number;
  releaseOpenShare: number;
  firstUseShare: number;
  avgFirstUseRound: number | null;
  lastRoundLaunchShare: number;
  avgDetonations: number;
  avgCaptures: number;
  avgWars: number;
  avgTreaties: number;
  avgCardsPlayed: number;
  covert: { success: number; foiled: number; exposed: number };
  eliminationShare: number;
  midLeaderWinShare: number;
  rejectedPerMatch: number;
  defaultedPerMatch: number;
  avgMs: number;
}

export function summarize(records: readonly MatchRecord[]): Summary {
  const n = Math.max(1, records.length);
  const by: Summary['byPersonality'] = {};
  const reasons: Record<string, number> = {};
  const covert = { success: 0, foiled: 0, exposed: 0 };
  let sum = {
    tension: 0,
    open: 0,
    firstUse: 0,
    firstRound: 0,
    lastRound: 0,
    det: 0,
    cap: 0,
    wars: 0,
    treaties: 0,
    cards: 0,
    elim: 0,
    mid: 0,
    midKnown: 0,
    rej: 0,
    def: 0,
    ms: 0,
  };
  for (const r of records) {
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    for (const [seat, personality] of Object.entries(r.seats)) {
      const entry = (by[personality] ??= { seats: 0, wins: 0, winRate: 0, avgScore: 0 });
      entry.seats++;
      entry.avgScore += r.scores[seat] ?? 0;
      if (r.winners.includes(seat)) entry.wins++;
    }
    sum = {
      tension: sum.tension + r.maxTension,
      open: sum.open + (r.releaseOpenRounds > 0 ? 1 : 0),
      firstUse: sum.firstUse + (r.firstNuclearRound !== null ? 1 : 0),
      firstRound: sum.firstRound + (r.firstNuclearRound ?? 0),
      lastRound: sum.lastRound + (r.lastRoundDetonations > 0 ? 1 : 0),
      det: sum.det + r.detonations,
      cap: sum.cap + r.captures,
      wars: sum.wars + r.wars,
      treaties: sum.treaties + r.treaties,
      cards: sum.cards + r.cardsPlayed,
      elim: sum.elim + (r.eliminations.length > 0 ? 1 : 0),
      mid: sum.mid + (r.midLeader !== null && r.winners.includes(r.midLeader) ? 1 : 0),
      midKnown: sum.midKnown + (r.midLeader !== null ? 1 : 0),
      rej: sum.rej + r.rejected,
      def: sum.def + r.defaulted,
      ms: sum.ms + r.ms,
    };
    covert.success += r.covert.success;
    covert.foiled += r.covert.foiled;
    covert.exposed += r.covert.exposed;
  }
  for (const entry of Object.values(by)) {
    entry.winRate = Math.round((entry.wins / Math.max(1, entry.seats)) * 1000) / 1000;
    entry.avgScore = Math.round((entry.avgScore / Math.max(1, entry.seats)) * 10) / 10;
  }
  const ratio = (a: number, b = n) => Math.round((a / Math.max(1, b)) * 1000) / 1000;
  return {
    matches: records.length,
    byPersonality: by,
    reasons,
    avgMaxTension: ratio(sum.tension),
    releaseOpenShare: ratio(sum.open),
    firstUseShare: ratio(sum.firstUse),
    avgFirstUseRound: sum.firstUse > 0 ? ratio(sum.firstRound, sum.firstUse) : null,
    lastRoundLaunchShare: ratio(sum.lastRound),
    avgDetonations: ratio(sum.det),
    avgCaptures: ratio(sum.cap),
    avgWars: ratio(sum.wars),
    avgTreaties: ratio(sum.treaties),
    avgCardsPlayed: ratio(sum.cards),
    covert,
    eliminationShare: ratio(sum.elim),
    midLeaderWinShare: ratio(sum.mid, sum.midKnown),
    rejectedPerMatch: ratio(sum.rej),
    defaultedPerMatch: ratio(sum.def),
    avgMs: ratio(sum.ms),
  };
}
