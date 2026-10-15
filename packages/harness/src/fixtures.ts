import { createMatch, type MatchContext, type GameState } from '@nukka/core';
import { loadDeck, loadMap, loadRuleset, loadScenario } from './data.js';

export interface MatchOptions {
  readonly players?: number;
  readonly seed?: number;
  readonly scenario?: string;
  readonly ruleset?: string;
}

/** Creates a match from the standard data, for tests and the harness. */
export function standardMatch(options: MatchOptions = {}): { ctx: MatchContext; state: GameState } {
  const ruleset = loadRuleset(options.ruleset ?? 'base-0.1');
  const map = loadMap('basin-4p', ruleset);
  return createMatch({
    matchId: 'test',
    seed: options.seed ?? 1,
    players: options.players ?? 4,
    ruleset,
    map,
    deck: loadDeck('base-0.1'),
    scenario: loadScenario(options.scenario ?? 'cold-start', ruleset, map),
  });
}
