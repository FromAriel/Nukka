import {
  networks,
  runUpkeep,
  scoreFor,
  sortedEntries,
  stateHash,
  type GameEvent,
  type GameState,
  type MatchContext,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { standardMatch } from './fixtures.js';

function upkeep(ctx: MatchContext, state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  state.round++;
  runUpkeep(ctx, state, events);
  return events;
}

function ruin(state: GameState, territory: string, kind: string) {
  const inst = sortedEntries(state.installations).find(
    ([, i]) => i.territory === territory && i.kind === kind,
  )?.[1];
  if (!inst) throw new Error(`no ${kind} in ${territory}`);
  inst.condition = 'ruined';
}

const formations = (state: GameState, player: string) =>
  sortedEntries(state.units).reduce((sum, [, u]) => (u.owner === player ? sum + u.count : sum), 0);

describe('match setup', () => {
  it('builds the cold-start position', () => {
    const { state } = standardMatch();
    expect(state.playerIds).toEqual(['A', 'B', 'C', 'D']);
    const owned = sortedEntries(state.territories).filter(([, t]) => t.owner !== null);
    expect(owned).toHaveLength(16);
    expect(state.territories['N-lakeshore']).toMatchObject({
      owner: null,
      militia: 2,
      population: 1,
    });
    expect(sortedEntries(state.installations).filter(([, i]) => i.owner === 'A')).toHaveLength(11);
    expect(formations(state, 'A')).toBe(4);
    for (const id of state.playerIds) expect(state.players[id]!.hand).toHaveLength(6);
    expect(state.deck.draw).toHaveLength(57 - 24);
    expect(state.tension).toMatchObject({ value: 10, floor: 0, release: 'locked' });
  });

  it('turns unused homes neutral in a 2-player game', () => {
    const { state } = standardMatch({ players: 2 });
    expect(state.playerIds).toEqual(['A', 'C']);
    expect(state.territories['B-capital']).toMatchObject({ owner: null, militia: 2 });
  });

  it('computes the floor from starting arsenals in Standoff', () => {
    const { state } = standardMatch({ scenario: 'standoff' });
    // Each player: silo 6 + 2 loaded warheads × 2 = 10 PP; world 40 ÷ 4 players.
    expect(state.tension.floor).toBe(10);
  });

  it('starts every player on a score of 24', () => {
    const { ctx, state } = standardMatch();
    for (const id of state.playerIds) expect(scoreFor(ctx, state, id).total).toBe(24);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    expect(stateHash(standardMatch({ seed: 5 }).state)).toBe(
      stateHash(standardMatch({ seed: 5 }).state),
    );
    expect(stateHash(standardMatch({ seed: 5 }).state)).not.toBe(
      stateHash(standardMatch({ seed: 6 }).state),
    );
  });
});

describe('upkeep', () => {
  it('matches the starting balance sheet', () => {
    const { ctx, state } = standardMatch();
    upkeep(ctx, state);
    expect(state.players['A']!.reserves).toEqual({
      production: 6 + 7,
      food: 6,
      water: 6,
      supplies: 8 + 2 - 4,
      intelligence: 2 + 2 + 1,
    });
    expect(state.players['A']!.hand).toHaveLength(8);
    expect(state.initiative).toBe(1);
    expect(state.tension.value).toBe(6);
  });

  it('caps reserves', () => {
    const { ctx, state } = standardMatch();
    upkeep(ctx, state);
    upkeep(ctx, state);
    expect(state.players['A']!.reserves.production).toBe(15);
  });

  it('starves a country whose water fails, then eliminates it', () => {
    const { ctx, state } = standardMatch();
    ruin(state, 'A-heartland', 'waterworks');
    upkeep(ctx, state); // reserve covers it
    expect(state.players['A']!.reserves.water).toBe(0);
    expect(state.territories['A-capital']!.hungry).toBe(0);
    upkeep(ctx, state); // everyone hungry
    const hungry = sortedEntries(state.territories).reduce(
      (s, [, t]) => (t.owner === 'A' ? s + t.hungry : s),
      0,
    );
    expect(hungry).toBe(6);
    const events = upkeep(ctx, state); // hungry twice in a row: lost
    expect(events.some((e) => e.type === 'PlayerEliminated' && e['player'] === 'A')).toBe(true);
    expect(state.players['A']!.viable).toBe(false);
    expect(state.territories['A-capital']).toMatchObject({ owner: null, militia: 1 });
  });

  it('cuts power in priority order when the only power station is ruined', () => {
    const { ctx, state } = standardMatch();
    ruin(state, 'A-capital', 'powerStation');
    upkeep(ctx, state);
    // No industry, so only the government's supplies arrive; the farm needs no power.
    expect(state.players['A']!.reserves.production).toBe(6);
    expect(state.players['A']!.reserves.food).toBe(6);
  });

  it('disbands units left unsupplied at two upkeeps in a row', () => {
    const { ctx, state } = standardMatch();
    const before = formations(state, 'A');
    for (let i = 0; i < 5; i++) upkeep(ctx, state);
    expect(formations(state, 'A')).toBe(before);
    upkeep(ctx, state);
    upkeep(ctx, state);
    expect(formations(state, 'A')).toBeLessThan(before);
  });

  it('charges production for each exclave', () => {
    const { ctx, state } = standardMatch();
    state.territories['S-frontier']!.owner = 'A';
    state.territories['S-frontier']!.militia = 0;
    expect(networks(ctx, state, 'A')).toHaveLength(2);
    upkeep(ctx, state);
    expect(state.players['A']!.reserves.production).toBe(6 + 7 - 1);
  });

  it('cuts a contested territory out of the network', () => {
    const { ctx, state } = standardMatch();
    state.territories['A-heartland']!.contestedRounds = 2;
    const nets = networks(ctx, state, 'A');
    expect(nets).toHaveLength(2);
    expect(nets.find((n) => n.territories.includes('A-heartland'))!.main).toBe(false);
  });
});
