import { autopilotResolver } from '@nukka/combat';
import { replayMatch } from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { loadDeck, loadMap, loadPersonality, loadRuleset, loadScenario } from './data.js';
import { runMatch, summarize } from './runner.js';

describe('bot matches', () => {
  const ruleset = loadRuleset('base-0.1');
  const map = loadMap('basin-4p', ruleset);
  const deck = loadDeck('base-0.1');
  const scenario = loadScenario('cold-start', ruleset, map);
  const seats = ['spy', 'rock', 'peacemaker', 'brinkman'].map(loadPersonality);

  it('plays a full match with every bot decision accepted, deterministically', () => {
    const first = runMatch({ ruleset, map, deck, scenario, seats, seed: 11 });
    const second = runMatch({ ruleset, map, deck, scenario, seats, seed: 11 });
    expect(first.reason).toBeTruthy();
    expect(first.defaulted).toBe(0);
    expect(first.hash).toBe(second.hash);
    expect(summarize([first]).matches).toBe(1);
  });

  it('replays a bot match from its command log, hash for hash', () => {
    const record = runMatch({ ruleset, map, deck, scenario, seats, seed: 5 });
    const replay = replayMatch(
      { ruleset, map, deck, scenario, combat: autopilotResolver },
      record.log!,
    );
    expect(replay.divergedAt).toBeNull();
    expect(replay.hashes.at(-1)).toBe(record.hash);
    expect(replay.hashes.length).toBe(record.rounds + 1);
  });

  it('detects a tampered log', () => {
    const record = runMatch({ ruleset, map, deck, scenario, seats, seed: 6 });
    const log = structuredClone(record.log!);
    log.hashes[3] = '0000000000000000';
    expect(
      replayMatch({ ruleset, map, deck, scenario, combat: autopilotResolver }, log).divergedAt,
    ).toBe(3);
  });

  it('runs two-player matches too', () => {
    const record = runMatch({ ruleset, map, deck, scenario, seats: seats.slice(0, 2), seed: 3 });
    expect(Object.keys(record.scores)).toEqual(['A', 'C']);
  });

  it('every personality file loads', () => {
    for (const id of [
      'builder',
      'expansionist',
      'defender',
      'brinkman',
      'spy',
      'rock',
      'peacemaker',
    ]) {
      expect(loadPersonality(id).id).toBe(id);
    }
  });
});
