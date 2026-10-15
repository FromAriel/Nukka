import {
  PASS_ORDERS,
  posturePoints,
  sortedEntries,
  submit,
  type GameEvent,
  type GameState,
  type PlanningOrders,
  type ShadowMarker,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { match, round } from './test-helpers.js';

const radarOf = (state: GameState, player: string) =>
  sortedEntries(state.installations).find(([, i]) => i.owner === player && i.kind === 'radar')![1]
    .id;

const op = (
  card: string,
  target: string,
  extra: Partial<Extract<ShadowMarker, { type: 'operation' }>> = {},
): Partial<PlanningOrders> => ({
  shadow: [{ type: 'operation', card, target, fuse: 1, ...extra }],
});

const covertEffect = (events: GameEvent[]) => events.find((e) => e.type === 'CovertEffect');

function setupSabotage(hands: Record<string, string[]> = {}) {
  const m = match({ A: ['sabotage-crew'], ...hands });
  m.state.players['A']!.reserves.intelligence = 6;
  m.state.players['B']!.reserves.intelligence = 6;
  return m;
}

describe('covert operations', () => {
  it('goes off at a later intelligence step, credited to an unknown actor', () => {
    const { ctx, state } = setupSabotage();
    const radar = radarOf(state, 'B');
    const r1 = round(ctx, state, { A: op('sabotage-crew', radar) });
    expect(covertEffect(r1.events)).toBeUndefined();
    expect(r1.state.players['A']!.hand).not.toContain('sabotage-crew');
    // A paid 2 for the card and 1 for the precise fuse.
    expect(r1.state.players['A']!.reserves.intelligence).toBe(6 - 3 + 3);

    const r2 = round(ctx, r1.state, {});
    const effect = covertEffect(r2.events)!;
    expect(effect).toMatchObject({ outcome: 'success', actor: null, victims: ['B'] });
    expect(
      r2.events.some((e) => e.type === 'InstallationDisabled' && e['installation'] === radar),
    ).toBe(true);
    expect(
      r2.events.some(
        (e) =>
          e.type === 'CovertReport' && (e.visibility as { players: string[] }).players[0] === 'A',
      ),
    ).toBe(true);
    expect(r2.state.players['A']!.blame).toBe(0);
  });

  it('is foiled, unattributed, when counter-intelligence meets the difficulty', () => {
    const { ctx, state } = setupSabotage();
    const r1 = round(ctx, state, { A: op('sabotage-crew', radarOf(state, 'B')) });
    const r2 = round(ctx, r1.state, { B: { counterIntel: 2 } });
    expect(covertEffect(r2.events)).toMatchObject({ outcome: 'foiled', actor: null });
  });

  it('is exposed when counter-intelligence beats the difficulty by the margin', () => {
    const { ctx, state } = setupSabotage();
    const r1 = round(ctx, state, { A: op('sabotage-crew', radarOf(state, 'B')) });
    const r2 = round(ctx, r1.state, { B: { counterIntel: 4 } });
    expect(covertEffect(r2.events)).toMatchObject({ outcome: 'exposed', actor: 'A' });
    expect(r2.state.players['A']!.infamy).toBe(2);
    expect(r2.state.hostility['B>A']).toBe(2);
  });

  it('boosting raises the difficulty', () => {
    const { ctx, state } = setupSabotage();
    const r1 = round(ctx, state, { A: op('sabotage-crew', radarOf(state, 'B'), { boost: 2 }) });
    const r2 = round(ctx, r1.state, { B: { counterIntel: 3 } });
    expect(covertEffect(r2.events)).toMatchObject({ outcome: 'success' });
  });

  it('Security Sweep catches and exposes the next operation whatever the CI', () => {
    const { ctx, state } = setupSabotage({ B: ['security-sweep'] });
    const r1 = round(ctx, state, {
      A: op('sabotage-crew', radarOf(state, 'B')),
      B: { shadow: [{ type: 'countermeasure', card: 'security-sweep' }] },
    });
    const r2 = round(ctx, r1.state, {});
    expect(covertEffect(r2.events)).toMatchObject({ outcome: 'exposed', actor: 'A' });
  });

  it('Inside Agent slips past Security Sweep and adds 2 difficulty', () => {
    const { ctx, state } = setupSabotage({
      A: ['sabotage-crew', 'inside-agent'],
      B: ['security-sweep'],
    });
    const r1 = round(ctx, state, {
      A: op('sabotage-crew', radarOf(state, 'B'), { insideAgent: true }),
      B: { shadow: [{ type: 'countermeasure', card: 'security-sweep' }] },
    });
    const r2 = round(ctx, r1.state, { B: { counterIntel: 3 } });
    expect(covertEffect(r2.events)).toMatchObject({ outcome: 'success' });
  });

  it('rolls a random fuse of 1–3 rounds when timing is not bought', () => {
    const fired: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const m = match({ A: ['reconnaissance'] }, { seed });
      let current = round(m.ctx, m.state, {
        A: { shadow: [{ type: 'operation', card: 'reconnaissance', target: 'B' }] },
      }).state;
      for (let r = 2; r <= 5; r++) {
        const next = round(m.ctx, current, {});
        if (covertEffect(next.events)) {
          fired.push(r - 1);
          break;
        }
        current = next.state;
      }
    }
    expect(fired).toHaveLength(12);
    expect(Math.min(...fired)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...fired)).toBeLessThanOrEqual(3);
    expect(new Set(fired).size).toBeGreaterThan(1);
  });

  it('rejects markers without the card, without the IP, or beyond the slots', () => {
    const { ctx, state } = match({ A: ['reconnaissance'] });
    const problems = (orders: Partial<PlanningOrders>) => {
      const r = submit(ctx, state, {
        matchId: 'test',
        playerId: 'A',
        seq: 1,
        cmd: { type: 'SubmitPlanning', orders: { ...PASS_ORDERS, ...orders } },
      });
      return r.ok ? '' : r.problems.join('; ');
    };
    expect(problems(op('sabotage-crew', radarOf(state, 'B')))).toMatch(/you hold 0/);
    expect(problems(op('reconnaissance', 'B', { boost: 3 }))).toMatch(
      /orders cost 5 IP; you have 2/,
    );
    expect(problems({ shadow: [{ type: 'blank' }, { type: 'blank' }] })).toMatch(/1 shadow slot/);
  });

  it('accusations: right exposes the accused, wrong costs the accuser', () => {
    const { ctx, state } = setupSabotage();
    const r1 = round(ctx, state, { A: op('sabotage-crew', radarOf(state, 'B')) });
    const r2 = round(ctx, r1.state, {});
    const record = covertEffect(r2.events)!['record'] as string;

    const wrong = round(ctx, r2.state, { B: { accusation: { accused: 'C', record } } });
    expect(wrong.events.find((e) => e.type === 'Accusation')).toMatchObject({ correct: false });
    expect(wrong.state.players['B']!.infamy).toBe(2);

    const right = round(ctx, r2.state, { B: { accusation: { accused: 'A', record } } });
    expect(right.events.find((e) => e.type === 'Accusation')).toMatchObject({ correct: true });
    expect(right.state.players['A']!.infamy).toBe(2);
  });

  it('Arm the Insurgents contests a territory; the unrest raises tension without blame', () => {
    const { ctx, state } = match({ A: ['arm-the-insurgents'] });
    state.players['A']!.reserves.intelligence = 6;
    const r1 = round(ctx, state, { A: op('arm-the-insurgents', 'B-heartland') });
    const r2 = round(ctx, r1.state, {});
    expect(r2.state.territories['B-heartland']!.contestedRounds).toBeGreaterThan(0);
    expect(
      r2.events.some(
        (e) => e.type === 'TensionChanged' && e['source'] === null && e['amount'] === 8,
      ),
    ).toBe(true);
    expect(r2.state.players['A']!.infamy).toBe(0);
    const formations = sortedEntries(r2.state.units).filter(
      ([, u]) => u.owner === 'B' && u.location === 'B-heartland',
    );
    expect(formations[0]![1].count).toBe(2);
  });

  it('Spoiler ends a treaty between others without breach penalties', () => {
    const { ctx, state } = match({ A: ['spoiler'] });
    state.players['A']!.reserves.intelligence = 6;
    state.treaties.push({
      id: 'tx',
      kind: 'nonAggression',
      parties: ['B', 'C'],
      signedRound: 0,
      untilRound: null,
      mediatedBy: null,
      baselinePosture: {},
      deadlineRound: null,
    });
    const r1 = round(ctx, state, { A: op('spoiler', 'tx') });
    const r2 = round(ctx, r1.state, {});
    expect(r2.state.treaties).toEqual([]);
    expect(r2.state.players['B']!.infamy + r2.state.players['C']!.infamy).toBe(0);
    expect(r2.state.hostility['B>C']).toBe(1);
    expect(r2.state.cooldowns.some((c) => c.a === 'B' && c.b === 'C')).toBe(true);
  });
});

describe('Covert Program', () => {
  it('hides a nuclear build until Reconnaissance reveals it, then penalizes it', () => {
    const { ctx, state } = match({ A: ['covert-program'], B: ['reconnaissance'] });
    state.players['A']!.reserves.production = 15;
    const r1 = round(ctx, state, {
      A: { development: [{ type: 'build', kind: 'silo', territory: 'A-uplands', covert: true }] },
    });
    expect(r1.events.some((e) => e.type === 'TensionChanged' && e['source'] === 'A')).toBe(false);
    expect(posturePoints(ctx, r1.state, 'A')).toBe(0);
    expect(r1.state.tension.floor).toBe(0);

    r1.state.players['B']!.reserves.intelligence = 6;
    const r2 = round(ctx, r1.state, { B: op('reconnaissance', 'A') });
    const r3 = round(ctx, r2.state, {});
    expect(r3.events.some((e) => e.type === 'CovertProgramRevealed' && e['player'] === 'A')).toBe(
      true,
    );
    expect(
      r3.events.some(
        (e) => e.type === 'TensionChanged' && e['source'] === 'A' && e['amount'] === 12,
      ),
    ).toBe(true);
    expect(r3.state.players['A']!.infamy).toBe(3);
    expect(posturePoints(ctx, r3.state, 'A')).toBe(6);
  });

  it('refuses to hide a non-nuclear build', () => {
    const { ctx, state } = match({ A: ['covert-program'] });
    const r = submit(ctx, state, {
      matchId: 'test',
      playerId: 'A',
      seq: 1,
      cmd: {
        type: 'SubmitPlanning',
        orders: {
          ...PASS_ORDERS,
          development: [{ type: 'build', kind: 'depot', territory: 'A-port', covert: true }],
        },
      },
    });
    expect(r.ok === false && r.problems.join()).toMatch(/only nuclear builds/);
  });
});
