import { autopilotResolver } from '@nukka/combat';
import {
  EMPTY_RESULT,
  sortedEntries,
  type CombatInput,
  type CombatResolver,
  type CombatResult,
  type GameState,
  type PlanningOrders,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { match, round, tensionFrom } from './test-helpers.js';

/** A combat resolver that records its input and returns a scripted result. */
function scripted(build: (state: GameState, input: CombatInput) => Partial<CombatResult>) {
  const inputs: CombatInput[] = [];
  const resolver: CombatResolver = (_ctx, state, input) => {
    inputs.push(input);
    return { ...EMPTY_RESULT, ...build(state, input) };
  };
  return { resolver, inputs };
}

const groundStack = (state: GameState, player: string, territory: string) =>
  sortedEntries(state.units).find(
    ([, u]) => u.owner === player && u.location === territory && u.kind === 'groundFormation',
  )![1];
const inst = (state: GameState, territory: string, kind: string) =>
  sortedEntries(state.installations).find(
    ([, i]) => i.territory === territory && i.kind === kind,
  )![1];

const assault = (state: GameState, target: string): Partial<PlanningOrders> => ({
  main: {
    type: 'operation',
    operation: 'groundAssault',
    target,
    forces: [{ stack: groundStack(state, 'A', 'A-heartland').id, count: 3 }],
  },
});

describe('operations', () => {
  it('captures a neutral territory without declaring war', () => {
    const { resolver, inputs } = scripted((_s, input) => ({
      militiaLosses: [{ territory: 'N-lakeshore', count: 2 }],
      captures: [{ territory: 'N-lakeshore', by: input.operations[0]!.attacker }],
    }));
    const { ctx, state } = match({}, { combat: resolver });
    const { state: after, events } = round(ctx, state, { A: assault(state, 'N-lakeshore') });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      kind: 'conventional',
      operations: [{ kind: 'groundAssault', defender: null }],
    });
    expect(after.territories['N-lakeshore']).toMatchObject({ owner: 'A', militia: 0 });
    expect(groundStack(after, 'A', 'N-lakeshore').count).toBe(3);
    expect(events.some((e) => e.type === 'WarDeclared')).toBe(false);
    expect(tensionFrom(events, 'A took neutral N-lakeshore')).toBe(1);
    expect(after.lastCombat).toBe('none'); // reset by the next upkeep after cooling
  });

  it('declaring an air raid on a farm starts a war and counts as a civilian target', () => {
    const { resolver } = scripted((s) => ({
      installationHits: [{ installation: inst(s, 'B-heartland', 'farm').id, steps: 1 }],
    }));
    const { ctx, state } = match({}, { combat: resolver });
    state.players['A']!.stock['conventionalBombs'] = 4;
    const aircraft = sortedEntries(state.units).find(
      ([, u]) => u.owner === 'A' && u.kind === 'aircraft',
    )![1];
    const farm = inst(state, 'B-heartland', 'farm');
    const { state: after, events } = round(ctx, state, {
      A: {
        main: {
          type: 'operation',
          operation: 'airRaid',
          target: farm.id,
          forces: [{ stack: aircraft.id, count: 1 }],
        },
      },
    });
    expect(after.relations['A|B']).toBe('war');
    expect(tensionFrom(events, 'A declared war on B')).toBe(12);
    expect(tensionFrom(events, 'A targeted civilians')).toBe(3);
    expect(after.players['A']!.infamy).toBe(3);
    expect(inst(after, 'B-heartland', 'farm').condition).toBe('impaired');
  });

  it('rejects illegal operations', () => {
    const { ctx, state } = match({});
    const far = {
      main: {
        type: 'operation' as const,
        operation: 'groundAssault' as const,
        target: 'C-capital',
        forces: [{ stack: groundStack(state, 'A', 'A-heartland').id, count: 1 }],
      },
    };
    expect(() => round(ctx, state, { A: far })).toThrow(/does not border/);
    const aircraft = sortedEntries(state.units).find(
      ([, u]) => u.owner === 'A' && u.kind === 'aircraft',
    )![1];
    const noBombs = {
      main: {
        type: 'operation' as const,
        operation: 'airRaid' as const,
        target: inst(state, 'B-heartland', 'farm').id,
        forces: [{ stack: aircraft.id, count: 1 }],
      },
    };
    expect(() => round(ctx, state, { A: noBombs })).toThrow(/needs 2 conventional bombs/);
  });

  it('refuses to fight without a combat resolver', () => {
    const { ctx, state } = match({});
    expect(() => round(ctx, state, { A: assault(state, 'N-lakeshore') })).toThrow(
      /no combat resolver/,
    );
  });

  it('breaks a pact and triggers the defender’s ally to honor or decline', () => {
    const { resolver } = scripted(() => ({}));
    const { ctx, state } = match({}, { combat: resolver });
    state.territories['N-lakeshore']!.owner = 'B';
    state.treaties.push(
      {
        id: 'pact',
        kind: 'nonAggression',
        parties: ['A', 'B'],
        signedRound: 0,
        untilRound: null,
        mediatedBy: null,
        baselinePosture: {},
        deadlineRound: null,
      },
      {
        id: 'def',
        kind: 'defensive',
        parties: ['B', 'D'],
        signedRound: 0,
        untilRound: null,
        mediatedBy: null,
        baselinePosture: {},
        deadlineRound: null,
      },
    );
    const asked: string[] = [];
    const { state: after, events } = round(
      ctx,
      state,
      { A: assault(state, 'N-lakeshore') },
      (d) => {
        asked.push(`${d.player}:${d.kind}`);
        return d.kind === 'honor' ? { type: 'AnswerHonorCall', honor: true } : undefined;
      },
    );
    expect(asked).toEqual(['D:honor']);
    expect(after.treaties.map((t) => t.id)).toEqual(['def']);
    expect(events.some((e) => e.type === 'TreatyEnded' && e['reason'] === 'breach')).toBe(true);
    expect(after.relations['A|D']).toBe('war');
    expect(tensionFrom(events, 'D honored its alliance with B')).toBe(4);
  });

  it('a pariah can be attacked at the cheaper rate', () => {
    const { resolver } = scripted(() => ({}));
    const { ctx, state } = match({}, { combat: resolver });
    state.territories['N-lakeshore']!.owner = 'B';
    state.players['B']!.blame = 12;
    const { events } = round(ctx, state, { A: assault(state, 'N-lakeshore') });
    expect(tensionFrom(events, 'A declared war on B')).toBe(4);
  });

  it('captured nuclear assets are scuttled and installations drop a step', () => {
    const { resolver } = scripted((_s, input) => ({
      captures: [{ territory: 'B-uplands', by: input.operations[0]!.attacker }],
    }));
    const { ctx, state } = match({}, { scenario: 'standoff', combat: resolver });
    // B-uplands borders B-capital, B-heartland and E-frontier: stage the attack from E-frontier.
    const stack = groundStack(state, 'A', 'A-heartland');
    stack.location = 'E-frontier';
    state.territories['E-frontier']!.owner = 'A';
    const { state: after, events } = round(ctx, state, {
      A: {
        main: {
          type: 'operation',
          operation: 'groundAssault',
          target: 'B-uplands',
          forces: [{ stack: stack.id, count: 3 }],
        },
      },
    });
    expect(after.territories['B-uplands']!.owner).toBe('A');
    expect(
      sortedEntries(after.installations).some(
        ([, i]) => i.territory === 'B-uplands' && i.kind === 'silo',
      ),
    ).toBe(false);
    expect(inst(after, 'B-uplands', 'industry').condition).toBe('impaired');
    expect(tensionFrom(events, 'A captured B-uplands')).toBe(5);
  });

  it('a tied neutral claim leaves the territory neutral with reset militia', () => {
    const { resolver } = scripted(() => ({
      militiaLosses: [{ territory: 'N-lakeshore', count: 2 }],
      tiedClaims: [{ territory: 'N-lakeshore' }],
    }));
    const { ctx, state } = match({}, { combat: resolver });
    const { state: after, events } = round(ctx, state, { A: assault(state, 'N-lakeshore') });
    expect(after.territories['N-lakeshore']).toMatchObject({
      owner: null,
      militia: ctx.ruleset.match.neutral.militiaAfterTiedClaim,
    });
    expect(events.some((e) => e.type === 'NeutralClaimTied')).toBe(true);
  });

  it('partial hits on a hardened installation are kept for the next raid', () => {
    const { resolver } = scripted((s) => ({
      hardHits: [{ installation: inst(s, 'B-capital', 'command').id, hits: 1 }],
    }));
    const { ctx, state } = match({}, { combat: resolver });
    const { state: after } = round(ctx, state, { A: assault(state, 'N-lakeshore') });
    expect(inst(after, 'B-capital', 'command')).toMatchObject({
      hardHits: 1,
      condition: 'operational',
    });
  });
});

describe('nuclear release and use', () => {
  it('offers commitments only when release is open, and the first use changes the world', () => {
    const { resolver, inputs } = scripted((_s, input) => ({
      detonations: (input.plans['A'] ?? []).map((p) => ({
        player: 'A',
        territory: 'B-capital',
        plan: p.id,
      })),
      population: [{ territory: 'B-capital', killed: 2, displaced: 1 }],
    }));
    const { ctx, state } = match({}, { scenario: 'standoff', tension: 100, combat: resolver });
    const silo = inst(state, 'A-uplands', 'silo');
    const asked: string[] = [];
    const { state: after, events } = round(ctx, state, {}, (d) => {
      asked.push(`${d.player}:${d.kind}`);
      if (d.kind === 'commit' && d.player === 'A') {
        return {
          type: 'CommitNuclear',
          plans: [
            {
              id: '',
              delivery: silo.id,
              count: 1,
              target: 'B-capital',
              fallback: null,
              wave: 0,
              policy: 'scheduled',
              trigger: null,
            },
          ],
        };
      }
      return undefined;
    });
    expect(asked).toEqual(['A:commit', 'B:commit', 'C:commit', 'D:commit']);
    expect(inputs[0]!.kind).toBe('nuclear');
    expect(after.tension).toMatchObject({ release: 'aftermath', value: 100 });
    expect(after.devastation).toBe(3);
    expect(after.players['A']!.infamy).toBeGreaterThanOrEqual(10 + 8);
    expect(after.territories['B-capital']!.population).toBe(0);
    expect(events.some((e) => e.type === 'FirstNuclearUse')).toBe(true);
  });

  it('offers no commitments while release is locked', () => {
    const { resolver } = scripted(() => ({}));
    const { ctx, state } = match({}, { scenario: 'standoff', combat: resolver });
    const asked: string[] = [];
    round(ctx, state, {}, (d) => {
      asked.push(d.kind);
      return undefined;
    });
    expect(asked).toEqual([]);
  });

  it('rejects launches at a ceasefire partner', () => {
    const { resolver } = scripted(() => ({}));
    const { ctx, state } = match({}, { scenario: 'standoff', tension: 100, combat: resolver });
    state.treaties.push({
      id: 'cf',
      kind: 'ceasefire',
      parties: ['A', 'B'],
      signedRound: 1,
      untilRound: 4,
      mediatedBy: null,
      baselinePosture: {},
      deadlineRound: null,
    });
    const silo = inst(state, 'A-uplands', 'silo');
    expect(() =>
      round(ctx, state, {}, (d) =>
        d.kind === 'commit' && d.player === 'A'
          ? {
              type: 'CommitNuclear',
              plans: [
                {
                  id: '',
                  delivery: silo.id,
                  count: 1,
                  target: 'B-capital',
                  fallback: null,
                  wave: 0,
                  policy: 'scheduled',
                  trigger: null,
                },
              ],
            }
          : undefined,
      ),
    ).toThrow(/ceasefire bars launches/);
  });

  it('launching from a hidden silo reveals the covert program with its penalty', () => {
    const { ctx, state } = match(
      {},
      { scenario: 'standoff', tension: 100, combat: autopilotResolver },
    );
    const silo = inst(state, 'A-uplands', 'silo');
    silo.hidden = true;
    const { state: after, events } = round(ctx, state, {}, (d) =>
      d.kind === 'commit' && d.player === 'A'
        ? {
            type: 'CommitNuclear',
            plans: [
              {
                id: '',
                delivery: silo.id,
                count: 1,
                target: 'B-capital',
                fallback: null,
                wave: 0,
                policy: 'scheduled',
                trigger: null,
              },
            ],
          }
        : undefined,
    );
    expect(after.installations[silo.id]!.hidden).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'CovertProgramRevealed',
        player: 'A',
        assets: ['silo'],
        how: 'used in combat',
      }),
    );
  });
});
