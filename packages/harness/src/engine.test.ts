import {
  PASS_ORDERS,
  sortedEntries,
  startMatch,
  stateHash,
  submit,
  type Command,
  type GameState,
  type MatchContext,
  type PlanningOrders,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { standardMatch } from './fixtures.js';

/** Submits planning orders for every pending player (PASS unless given). */
function playRound(
  ctx: MatchContext,
  state: GameState,
  orders: Record<string, Partial<PlanningOrders>> = {},
): GameState {
  let current = state;
  for (const decision of [...current.decisions]) {
    const cmd: Command = {
      type: 'SubmitPlanning',
      orders: { ...PASS_ORDERS, ...orders[decision.player] },
    };
    const result = submit(ctx, current, {
      matchId: current.meta.matchId,
      playerId: decision.player,
      seq: (current.lastSeq[decision.player] ?? 0) + 1,
      cmd,
    });
    if (!result.ok) throw new Error(`${decision.player}: ${result.problems.join('; ')}`);
    current = result.state;
  }
  return current;
}

function setup(options = {}) {
  const { ctx, state } = standardMatch(options);
  return { ctx, state: startMatch(state) };
}

const instOf = (state: GameState, territory: string, kind: string) =>
  sortedEntries(state.installations).find(
    ([, i]) => i.territory === territory && i.kind === kind,
  )?.[1];

const tryOrders = (
  ctx: MatchContext,
  state: GameState,
  player: string,
  orders: Partial<PlanningOrders>,
) =>
  submit(ctx, state, {
    matchId: state.meta.matchId,
    playerId: player,
    seq: (state.lastSeq[player] ?? 0) + 1,
    cmd: { type: 'SubmitPlanning', orders: { ...PASS_ORDERS, ...orders } },
  });

describe('engine loop', () => {
  it('opens planning for every player', () => {
    const { state } = setup();
    expect(state.decisions.map((d) => d.player)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('plays a full 12-round match of passes, deterministically', () => {
    const run = () => {
      const { ctx, state } = setup({ seed: 9 });
      let current = state;
      while (current.phase !== 'ended') current = playRound(ctx, current);
      return current;
    };
    const finished = run();
    expect(finished.round).toBe(12);
    expect(finished.result?.reason).toBe('rounds');
    expect(finished.result?.winners.length).toBeGreaterThan(0);
    expect(stateHash(run())).toBe(stateHash(finished));
  });

  it('waits until every player has submitted', () => {
    const { ctx, state } = setup();
    const after = tryOrders(ctx, state, 'A', {});
    expect(after.ok && after.state.phase).toBe('planning');
    expect(after.ok && after.state.decisions.map((d) => d.player)).toEqual(['B', 'C', 'D']);
  });

  it('rejects duplicate, skipped and unexpected commands', () => {
    const { ctx, state } = setup();
    const first = tryOrders(ctx, state, 'A', {});
    if (!first.ok) throw new Error('first submit failed');
    const again = submit(ctx, first.state, {
      matchId: 'test',
      playerId: 'A',
      seq: 1,
      cmd: { type: 'SubmitPlanning', orders: PASS_ORDERS },
    });
    expect(again).toMatchObject({ ok: false, code: 'duplicate' });
    const gap = submit(ctx, state, {
      matchId: 'test',
      playerId: 'B',
      seq: 3,
      cmd: { type: 'SubmitPlanning', orders: PASS_ORDERS },
    });
    expect(gap).toMatchObject({ ok: false, code: 'gap' });
    const notWaiting = submit(ctx, first.state, {
      matchId: 'test',
      playerId: 'A',
      seq: 2,
      cmd: { type: 'SubmitPlanning', orders: PASS_ORDERS },
    });
    expect(notWaiting).toMatchObject({ ok: false, code: 'not-waiting' });
  });

  it('discards down to the hand limit in the aftermath', () => {
    const { ctx, state } = setup();
    const r2 = playRound(ctx, playRound(ctx, state));
    expect(r2.round).toBe(3);
    // Round 3 upkeep drew 2 onto a hand trimmed to 7.
    expect(r2.players['A']!.hand).toHaveLength(9);
    expect(r2.deck.discard.length).toBeGreaterThan(0);
  });
});

describe('planning orders', () => {
  it('builds a silo: costs production, raises tension and the floor', () => {
    const { ctx, state } = setup();
    state.players['A']!.reserves.production = 12;
    const next = playRound(ctx, state, {
      A: { development: [{ type: 'build', kind: 'silo', territory: 'A-uplands' }] },
    });
    expect(instOf(next, 'A-uplands', 'silo')).toBeDefined();
    expect(next.tension.log.some((c) => c.source === 'A' && c.amount === 8)).toBe(true);
    // Round 2 upkeep: 12 − 10 + 7 income.
    expect(next.players['A']!.reserves.production).toBe(9);
    expect(next.tension.floor).toBe(1);
  });

  it('rejects illegal orders with readable reasons', () => {
    const { ctx, state } = setup();
    const check = (orders: Partial<PlanningOrders>) => {
      const r = tryOrders(ctx, state, 'A', orders);
      return r.ok ? [] : r.problems;
    };
    expect(
      check({ development: [{ type: 'build', kind: 'silo', territory: 'A-uplands' }] }).join(),
    ).toMatch(/cost 10 production; you have 6/);
    expect(
      check({ development: [{ type: 'build', kind: 'farm', territory: 'A-port' }] }).join(),
    ).toMatch(/needs farmland/);
    expect(
      check({ development: [{ type: 'build', kind: 'depot', territory: 'B-port' }] }).join(),
    ).toMatch(/don't own/);
    expect(
      check({ development: [{ type: 'build', kind: 'depot', territory: 'A-capital' }] }).join(),
    ).toMatch(/no free site/);
    expect(
      check({
        development: [
          { type: 'build', kind: 'depot', territory: 'A-port' },
          { type: 'build', kind: 'shelter', territory: 'A-port' },
          { type: 'build', kind: 'shelter', territory: 'A-uplands' },
        ],
      }).join(),
    ).toMatch(/at most 2 development orders/);
    expect(check({ counterIntel: 99 }).join()).toMatch(/exceeds/);
  });

  it('switches industry to supply mode at the next upkeep', () => {
    const { ctx, state } = setup();
    const industry = instOf(state, 'A-uplands', 'industry')!;
    const next = playRound(ctx, state, { A: { modes: { [industry.id]: 'supply' } } });
    // Takes effect at round 2 upkeep, so round 3 income shows it.
    const r3 = playRound(ctx, next);
    // Round 2: +2 gov −4 upkeep; round 3: +2 gov +5 supply mode −4 upkeep.
    expect(r3.players['A']!.reserves.supplies).toBe(8 + 2 - 4 + 2 + 5 - 4);
  });

  it('moves ground units within connected friendly territory only', () => {
    const { ctx, state } = setup();
    const stack = sortedEntries(state.units).find(
      ([, u]) => u.owner === 'A' && u.kind === 'groundFormation',
    )![1];
    const bad = tryOrders(ctx, state, 'A', {
      repositioning: { stack: stack.id, count: 1, to: 'N-lakeshore' },
    });
    expect(bad.ok).toBe(false);
    const next = playRound(ctx, state, {
      A: { repositioning: { stack: stack.id, count: 2, to: 'A-capital' } },
    });
    const atCapital = sortedEntries(next.units).find(
      ([, u]) => u.owner === 'A' && u.location === 'A-capital',
    );
    expect(atCapital?.[1].count).toBe(2);
  });

  it('produces warheads, loads a silo, and dismantling lowers tension', () => {
    const { ctx, state } = setup({ scenario: 'standoff' });
    state.players['A']!.reserves.production = 15;
    let next = playRound(ctx, state, {
      A: { development: [{ type: 'ammunition', kind: 'warheads' }] },
    });
    expect(next.players['A']!.stock['warheads']).toBe(2);
    expect(
      next.tension.log.some(
        (c) => c.source === 'A' && c.reason.includes('warheads') && c.amount === 5,
      ),
    ).toBe(true);
    const silo = instOf(next, 'A-uplands', 'silo')!;
    const overload = tryOrders(ctx, next, 'A', {
      loads: [{ installation: silo.id, ammunition: 'warheads', count: 1 }],
    });
    expect(overload.ok).toBe(false); // already holds 2
    next = playRound(ctx, next, {
      A: { development: [{ type: 'dismantle', installation: silo.id }] },
    });
    expect(instOf(next, 'A-uplands', 'silo')).toBeUndefined();
    expect(next.players['A']!.stock['warheads']).toBe(4);
    expect(
      next.tension.log.some(
        (c) => c.source === 'A' && c.amount < 0 && c.reason.includes('dismantled'),
      ),
    ).toBe(true);
  });

  it('repairs an impaired installation by the next upkeep at half cost', () => {
    const { ctx, state } = setup();
    const farm = instOf(state, 'A-heartland', 'farm')!;
    farm.condition = 'impaired';
    const next = playRound(ctx, state, {
      A: { development: [{ type: 'repair', installation: farm.id }] },
    });
    expect(instOf(next, 'A-heartland', 'farm')!.condition).toBe('operational');
    expect(next.players['A']!.reserves.production).toBe(6 - 2 + 7);
  });

  it('spends intelligence on counter-intelligence', () => {
    const { ctx, state } = setup();
    const next = playRound(ctx, state, { A: { counterIntel: 2 }, B: {} });
    // Round 2 income: 2 government + 1 command; A spent its starting 2.
    expect(next.players['A']!.reserves.intelligence).toBe(0 + 3);
    expect(next.players['B']!.reserves.intelligence).toBe(2 + 3);
  });
});
