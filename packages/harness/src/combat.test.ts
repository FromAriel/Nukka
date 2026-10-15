import { autopilotResolver, createCombat } from '@nukka/combat';
import {
  addInstallation,
  sortedEntries,
  stateHash,
  type CombatInput,
  type GameState,
  type MatchContext,
  type NuclearPlan,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { standardMatch } from './fixtures.js';

function setup(scenario = 'cold-start') {
  return standardMatch({ scenario, combat: autopilotResolver });
}

const stackOf = (state: GameState, player: string, kind: string) =>
  sortedEntries(state.units).find(([, u]) => u.owner === player && u.kind === kind)![1];
const inst = (state: GameState, territory: string, kind: string) =>
  sortedEntries(state.installations).find(
    ([, i]) => i.territory === territory && i.kind === kind,
  )?.[1];

function assault(
  state: GameState,
  target: string,
  count: number,
  from = 'A-heartland',
): CombatInput {
  const stack = stackOf(state, 'A', 'groundFormation');
  stack.location = from;
  return {
    round: 1,
    kind: 'conventional',
    operations: [
      {
        id: 'op1',
        kind: 'groundAssault',
        attacker: 'A',
        target,
        territory: target,
        defender: state.territories[target]!.owner,
        forces: [{ stack: stack.id, count }],
        launchers: [],
      },
    ],
    plans: {},
    policies: {},
  };
}

function plan(
  state: GameState,
  player: string,
  target: string,
  extra: Partial<NuclearPlan> = {},
): NuclearPlan {
  const silo = sortedEntries(state.installations).find(
    ([, i]) => i.owner === player && i.kind === 'silo',
  )![1];
  return {
    id: `${player}-plan`,
    delivery: silo.id,
    count: 1,
    target,
    fallback: null,
    wave: 0,
    policy: 'scheduled',
    trigger: null,
    ...extra,
  };
}

const nuclear = (plans: Record<string, NuclearPlan[]>): CombatInput => ({
  round: 1,
  kind: 'nuclear',
  operations: [],
  plans,
  policies: {},
});

describe('ground combat', () => {
  it('three formations take a neutral lakeshore from its militia', () => {
    const { ctx, state } = setup();
    const result = autopilotResolver(ctx, state, assault(state, 'N-lakeshore', 3));
    expect(result.captures).toEqual([{ territory: 'N-lakeshore', by: 'A' }]);
    expect(result.militiaLosses).toEqual([{ territory: 'N-lakeshore', count: 2 }]);
  });

  it('one formation is not enough against two militia', () => {
    const { ctx, state } = setup();
    const result = autopilotResolver(ctx, state, assault(state, 'N-lakeshore', 1));
    expect(result.captures).toEqual([]);
    expect(result.unitLosses.reduce((s, l) => s + l.count, 0)).toBe(1);
  });

  it('two formations reliably win, as the weapons spec intends', () => {
    const { ctx, state } = setup();
    expect(autopilotResolver(ctx, state, assault(state, 'N-lakeshore', 2)).captures).toHaveLength(
      1,
    );
  });

  it('hills make defenders harder to dislodge than plains', () => {
    const { ctx, state } = setup();
    const plains = createCombat(ctx, state, assault(state, 'N-lakeshore', 2)).run();
    const hills = createCombat(ctx, state, assault(state, 'N-frontier', 2, 'A-port')).run();
    const lost = (r: typeof plains) => r.unitLosses.reduce((s, l) => s + l.count, 0);
    expect(lost(hills)).toBeGreaterThanOrEqual(lost(plains));
  });
});

describe('air and missile combat', () => {
  function raid(ctx: MatchContext, state: GameState) {
    state.players['A']!.stock['conventionalBombs'] = 4;
    const aircraft = stackOf(state, 'A', 'aircraft');
    const farm = inst(state, 'B-heartland', 'farm')!;
    const input: CombatInput = {
      round: 1,
      kind: 'conventional',
      operations: [
        {
          id: 'op1',
          kind: 'airRaid',
          attacker: 'A',
          target: farm.id,
          territory: farm.territory,
          defender: 'B',
          forces: [{ stack: aircraft.id, count: 1 }],
          launchers: [],
        },
      ],
      plans: {},
      policies: {},
    };
    return { farm, aircraft, result: autopilotResolver(ctx, state, input) };
  }

  it('an undefended farm is hit by both bombs', () => {
    const { ctx, state } = setup();
    for (const [id, i] of sortedEntries(state.installations))
      if (i.owner === 'B' && i.kind === 'gunBattery') delete state.installations[id];
    const { farm, result } = raid(ctx, state);
    expect(result.installationHits).toEqual([{ installation: farm.id, steps: 2 }]);
    expect(result.ammunitionUsed).toEqual([{ player: 'A', kind: 'conventionalBombs', count: 2 }]);
  });

  it('a gun battery covering the farm shoots the raid down or spends ammunition trying', () => {
    const { ctx, state } = setup();
    const { aircraft, result } = raid(ctx, state);
    const shotDown = result.unitLosses.some((l) => l.stack === aircraft.id);
    expect(result.magazinesUsed.length).toBeGreaterThan(0);
    if (shotDown) expect(result.installationHits).toEqual([]);
  });

  it('is deterministic', () => {
    const a = setup();
    const b = setup();
    expect(stateHash(raid(a.ctx, a.state).result)).toBe(stateHash(raid(b.ctx, b.state).result));
  });
});

describe('nuclear combat', () => {
  it('an unintercepted warhead ruins the capital and kills and displaces its people', () => {
    const { ctx, state } = setup('standoff');
    const result = autopilotResolver(ctx, state, nuclear({ A: [plan(state, 'A', 'B-capital')] }));
    expect(result.detonations).toEqual([{ player: 'A', territory: 'B-capital', plan: 'A-plan' }]);
    expect(
      result.installationHits.find(
        (h) => h.installation === inst(state, 'B-capital', 'command')!.id,
      )?.steps,
    ).toBe(2);
    expect(result.population.find((p) => p.territory === 'B-capital')).toEqual({
      territory: 'B-capital',
      killed: 2,
      displaced: 1,
    });
    expect(result.ammunitionUsed).toEqual([
      {
        player: 'A',
        kind: 'warheads',
        count: 1,
        installation: inst(state, 'A-uplands', 'silo')!.id,
      },
    ]);
  });

  it('a precision interceptor stops a warhead in its terminal phase', () => {
    const { ctx, state } = setup('standoff');
    state.installations['i-pi'] = {
      ...inst(state, 'B-capital', 'radar')!,
      id: 'i-pi',
      kind: 'precisionInterceptor',
      site: 3,
      magazine: 4,
    };
    state.installations[inst(state, 'B-capital', 'radar')!.id]!.site = 3;
    delete state.installations[inst(state, 'B-capital', 'radar')!.id];
    const result = autopilotResolver(ctx, state, nuclear({ A: [plan(state, 'A', 'B-capital')] }));
    expect(result.detonations).toEqual([]);
    expect(result.magazinesUsed).toEqual([{ installation: 'i-pi', shots: 1 }]);
  });

  it('a high-altitude screen intercepts in midcourse', () => {
    const { ctx, state } = setup('standoff');
    state.players['B']!.reserves.production = 15;
    const screen = addInstallation(ctx, state, {
      kind: 'highAltitudeScreen',
      owner: 'B',
      territory: 'N-frontier',
      site: 0,
    });
    state.territories['N-frontier']!.owner = 'B';
    void screen;
    const result = autopilotResolver(ctx, state, nuclear({ A: [plan(state, 'A', 'B-capital')] }));
    expect(result.detonations).toEqual([]);
  });

  it('retaliation fires only when its trigger attacks', () => {
    const { ctx, state } = setup('standoff');
    const retaliate = plan(state, 'B', 'A-capital', { policy: 'retaliation', trigger: 'A' });
    const quiet = autopilotResolver(ctx, state, nuclear({ B: [retaliate] }));
    expect(quiet.detonations).toEqual([]);
    const exchange = autopilotResolver(
      ctx,
      state,
      nuclear({ A: [plan(state, 'A', 'B-capital')], B: [retaliate] }),
    );
    expect(exchange.detonations.map((d) => d.player).sort()).toEqual(['A', 'B']);
  });

  it('a silo destroyed in an earlier wave cannot fire a later one', () => {
    const { ctx, state } = setup('standoff');
    const bSilo = sortedEntries(state.installations).find(
      ([, i]) => i.owner === 'B' && i.kind === 'silo',
    )![1];
    const result = autopilotResolver(
      ctx,
      state,
      nuclear({ A: [plan(state, 'A', bSilo.id)], B: [plan(state, 'B', 'A-capital', { wave: 2 })] }),
    );
    expect(result.detonations.map((d) => d.player)).toEqual(['A']);
  });
});
