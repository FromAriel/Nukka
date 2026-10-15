import {
  addInstallation,
  addUnits,
  sortedEntries,
  startMatch,
  viewFor,
  type GameState,
} from '@nukka/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { standardMatch } from './fixtures.js';

/** Plants distinctive secrets for `owner`; returns the strings that must never reach anyone else. */
function plantSecrets(base: ReturnType<typeof standardMatch>, owner: string, n: number) {
  const { ctx } = base;
  const state: GameState = structuredClone(base.state);
  const p = state.players[owner]!;
  const nums = [n, n + 1, n + 2, n + 3, n + 4, n + 5, n + 6, n + 7];
  p.reserves = {
    production: nums[0]!,
    food: nums[1]!,
    water: nums[2]!,
    supplies: nums[3]!,
    intelligence: nums[4]!,
  };
  p.counterIntel = nums[5]!;
  p.stock['warheads'] = nums[6]!;
  p.hiddenStock['gravityBombs'] = nums[7]!;
  p.hand = ['canary-card'];
  const bureau = addInstallation(ctx, state, {
    kind: 'bureau',
    owner,
    territory: `${owner}-port`,
    site: 3,
    mode: 'domestic',
  });
  bureau.pendingMode = 'canary-mode';
  const silo = addInstallation(ctx, state, {
    kind: 'silo',
    owner,
    territory: `${owner}-uplands`,
    site: 1,
    hidden: true,
  });
  silo.loaded['warheads'] = 2;
  addUnits(state, owner, 'submarine', 'sea-inland', 1);
  state.covert.operations.push({
    id: 'canary-op',
    owner,
    card: 'sabotage-crew',
    target: 'canary-target',
    fireRound: 3,
    difficulty: 2,
    ignoresCountermeasures: false,
  });
  state.covert.countermeasures.push({
    id: 'canary-trap',
    owner,
    card: 'security-sweep',
    untilRound: 3,
  });
  state.covert.history.push({
    id: 'canary-record',
    round: 1,
    owner,
    victims: [],
    card: 'reconnaissance',
    outcome: 'success',
  });
  state.crisisVotes[owner] = 'authorize';
  state.nuclearPlans[owner] = [
    {
      id: 'canary-plan',
      delivery: silo.id,
      count: 1,
      target: 'canary-plan-target',
      fallback: null,
      wave: 0,
      policy: 'scheduled',
      trigger: null,
    },
  ];
  state.planningOrders[owner] = {
    development: [],
    repositioning: [],
    loads: [],
    modes: {},
    counterIntel: 0,
    trades: [],
    leaveTreaties: [],
    shadow: [],
    accusation: null,
    main: { type: 'card', card: 'canary-main' },
  };
  state.actionQueue.push({ player: owner, action: { type: 'card', card: 'canary-queued' } });
  state.meta.seed = 7654321;
  state.rng['deck'] = [1111111, 2222222, 3333333, 4444444];
  const secrets = [
    ...nums.map((x) => `:${x}`),
    'canary-card',
    'canary-mode',
    'canary-op',
    'canary-target',
    'canary-trap',
    'canary-plan',
    'canary-main',
    'canary-queued',
    '7654321',
    '1111111',
    'domestic',
    silo.id + '"',
  ];
  return { ctx, state, secrets };
}

describe('player views', () => {
  const base = standardMatch();

  it('never leak another player’s secrets', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('A', 'B', 'C', 'D'),
        fc.constantFrom('A', 'B', 'C', 'D'),
        fc.integer({ min: 1_000_000, max: 8_000_000 }),
        (owner, viewer, n) => {
          fc.pre(owner !== viewer);
          const { ctx, state, secrets } = plantSecrets(base, owner, n);
          const json = JSON.stringify(viewFor(ctx, state, viewer));
          for (const secret of secrets) expect(json, `leaked ${secret}`).not.toContain(secret);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('shows a player everything of their own', () => {
    const { ctx, state } = plantSecrets(base, 'A', 2_000_000);
    const view = viewFor(ctx, state, 'A');
    expect(view.me.hand).toEqual(['canary-card']);
    expect(view.me.reserves.production).toBe(2_000_000);
    expect(view.covert.myOperations.map((o) => o.id)).toEqual(['canary-op']);
    expect(view.myCrisisVote).toBe('authorize');
    expect(sortedEntries(view.installations).some(([, i]) => i.kind === 'silo' && i.hidden)).toBe(
      true,
    );
    expect(view.actionQueue.at(-1)?.action).toMatchObject({ card: 'canary-queued' });
  });

  it('hides exact stack sizes of other players but shows where they are', () => {
    const { ctx, state } = base;
    const view = viewFor(ctx, state, 'B');
    const aGround = sortedEntries(view.units).find(
      ([, u]) => u.owner === 'A' && u.kind === 'groundFormation',
    )![1];
    expect(aGround.location).toBe('A-heartland');
    expect(aGround.count).toBeNull();
    const own = sortedEntries(view.units).find(
      ([, u]) => u.owner === 'B' && u.kind === 'groundFormation',
    )![1];
    expect(own.count).toBe(3);
  });

  it('reveals submarines only to patrols in range and to defensive partners', () => {
    const { ctx } = base;
    const state = structuredClone(base.state);
    addUnits(state, 'A', 'submarine', 'sea-N', 1);
    addUnits(state, 'B', 'patrol', 'sea-NE', 1);
    const sees = (viewer: string) =>
      sortedEntries(viewFor(ctx, state, viewer).units).some(([, u]) => u.kind === 'submarine');
    expect(sees('B')).toBe(true); // sea-NE is next to sea-N
    expect(sees('C')).toBe(false);
    state.treaties.push({
      id: 't',
      kind: 'defensive',
      parties: ['A', 'C'],
      signedRound: 1,
      untilRound: null,
      mediatedBy: null,
      baselinePosture: {},
      deadlineRound: null,
    });
    expect(sees('C')).toBe(true);
  });

  it('shows loaded weapons once revealed by verification or reconnaissance', () => {
    const { ctx, state } = standardMatch({ scenario: 'standoff' });
    const silo = (viewer: string) =>
      sortedEntries(viewFor(ctx, state, viewer).installations).find(
        ([, i]) => i.owner === 'A' && i.kind === 'silo',
      )![1];
    expect(silo('B').loaded).toBeNull();
    state.reveals.push({ subject: 'nuclearBreakdown', of: 'A', to: 'B', untilRound: state.round });
    expect(silo('B').loaded).toEqual({ warheads: 2 });
    expect(silo('C').loaded).toBeNull();
  });

  it('lists only your own decisions', () => {
    const { ctx } = base;
    const state = startMatch(base.state);
    expect(viewFor(ctx, state, 'C').decisions).toEqual([{ player: 'C', kind: 'planning' }]);
  });
});
