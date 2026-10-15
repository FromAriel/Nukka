/**
 * Match logs and replays (Technical Architecture spec §9.2). A log is the
 * header plus every accepted command; replaying it must reproduce the
 * recorded hashes exactly.
 */
import type { CommandEnvelope } from '../commands.js';
import { stateHash } from '../hash.js';
import { startMatch, submit, type Command } from './engine.js';
import { createMatch, type MatchConfig } from './setup.js';
import type { GameState } from './state.js';

export interface MatchLog {
  header: {
    formatVersion: number;
    matchId: string;
    rulesetId: string;
    rulesetHash: string;
    mapId: string;
    deckId: string;
    scenarioId: string;
    seed: number;
    players: number;
  };
  commands: CommandEnvelope<Command>[];
  /** State hash at the start of each round's planning, then the final state. */
  hashes: string[];
}

export function logHeader(state: GameState): MatchLog['header'] {
  const { meta } = state;
  return {
    formatVersion: meta.formatVersion,
    matchId: meta.matchId,
    rulesetId: meta.rulesetId,
    rulesetHash: meta.rulesetHash,
    mapId: meta.mapId,
    deckId: meta.deckId,
    scenarioId: meta.scenarioId,
    seed: meta.seed,
    players: state.playerIds.length,
  };
}

/** Records a hash whenever a new round's planning opens, and at the end. */
export function checkpoint(hashes: string[], state: GameState, lastRound: { value: number }): void {
  if (state.phase === 'ended' || (state.phase === 'planning' && state.round !== lastRound.value)) {
    lastRound.value = state.round;
    hashes.push(stateHash(state));
  }
}

export interface ReplayResult {
  state: GameState;
  hashes: string[];
  /** Index of the first hash that differs from the log, or null if all match. */
  divergedAt: number | null;
}

/** Re-runs a log from the start and compares every checkpoint hash. */
export function replayMatch(
  config: Omit<MatchConfig, 'matchId' | 'seed' | 'players'>,
  log: MatchLog,
): ReplayResult {
  const { ctx, state: created } = createMatch({
    ...config,
    matchId: log.header.matchId,
    seed: log.header.seed,
    players: log.header.players,
  });
  if (created.meta.rulesetHash !== log.header.rulesetHash) {
    throw new Error(
      `replay: ruleset hash ${created.meta.rulesetHash} does not match the log's ${log.header.rulesetHash}`,
    );
  }
  let state = startMatch(created);
  const hashes: string[] = [];
  const lastRound = { value: 0 };
  checkpoint(hashes, state, lastRound);
  for (const envelope of log.commands) {
    const result = submit(ctx, state, envelope);
    if (!result.ok)
      throw new Error(
        `replay: command ${envelope.playerId}#${envelope.seq} was rejected: ${result.problems.join('; ')}`,
      );
    state = result.state;
    checkpoint(hashes, state, lastRound);
  }
  const divergedAt = log.hashes.findIndex((h, i) => hashes[i] !== h);
  return {
    state,
    hashes,
    divergedAt:
      divergedAt < 0 && hashes.length === log.hashes.length ? null : Math.max(0, divergedAt),
  };
}
