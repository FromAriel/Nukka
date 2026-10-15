import {
  PASS_ORDERS,
  startMatch,
  submit,
  type Command,
  type GameEvent,
  type GameState,
  type MatchContext,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { standardMatch } from './fixtures.js';

function send(ctx: MatchContext, state: GameState, player: string, cmd: Command) {
  const r = submit(ctx, state, {
    matchId: state.meta.matchId,
    playerId: player,
    seq: (state.lastSeq[player] ?? 0) + 1,
    cmd,
  });
  if (!r.ok) throw new Error(`${player}: ${r.problems.join('; ')}`);
  return r;
}

/** Everyone passes planning; returns the state waiting at the crisis vote (or later). */
function toCrisis(ctx: MatchContext, state: GameState) {
  let current = state;
  const events: GameEvent[] = [];
  for (const d of [...current.decisions]) {
    const r = send(ctx, current, d.player, { type: 'SubmitPlanning', orders: PASS_ORDERS });
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

function vote(ctx: MatchContext, state: GameState, votes: Record<string, 'authorize' | 'hold'>) {
  let current = state;
  const events: GameEvent[] = [];
  for (const d of [...current.decisions]) {
    const r = send(ctx, current, d.player, {
      type: 'CastCrisisVote',
      vote: votes[d.player] ?? 'hold',
    });
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

function atTension(value: number, players = 4) {
  const { ctx, state } = standardMatch({ players });
  state.tension.value = value;
  return { ctx, state: startMatch(state) };
}

const released = (events: GameEvent[]) =>
  events.find((e) => e.type === 'ReleaseDecided')?.['release'];

describe('crisis check', () => {
  it('keeps release locked below the vote band, with no vote', () => {
    const { ctx, state } = atTension(60);
    const { state: after, events } = toCrisis(ctx, state);
    expect(after.decisions.every((d) => d.kind === 'planning')).toBe(true);
    expect(released(events)).toBe('locked');
  });

  it('opens release at 100 without a vote', () => {
    const { ctx, state } = atTension(100);
    expect(released(toCrisis(ctx, state).events)).toBe('open');
  });

  it('calls a vote at 80–99', () => {
    const { ctx, state } = atTension(85);
    const { state: waiting } = toCrisis(ctx, state);
    expect(waiting.phase).toBe('crisis');
    expect(waiting.decisions.map((d) => d.kind)).toEqual([
      'crisis-vote',
      'crisis-vote',
      'crisis-vote',
      'crisis-vote',
    ]);
  });

  it('opens on a strict majority and charges blame to each authorizer', () => {
    const { ctx, state } = atTension(85);
    const { events, state: after } = vote(ctx, toCrisis(ctx, state).state, {
      A: 'authorize',
      B: 'authorize',
      C: 'authorize',
    });
    expect(released(events)).toBe('open');
    expect(after.players['A']!.infamy).toBe(1);
    expect(after.players['D']!.infamy).toBe(0);
  });

  it('fails on a tie', () => {
    const { ctx, state } = atTension(85);
    const { events } = vote(ctx, toCrisis(ctx, state).state, { A: 'authorize', B: 'authorize' });
    expect(released(events)).toBe('locked');
  });

  it('settles a 2-player split with a roll-off; the more infamous player rolls twice', () => {
    const { ctx, state } = atTension(85, 2);
    state.players['A']!.infamy = 6;
    const { events } = vote(ctx, toCrisis(ctx, state).state, { A: 'authorize' });
    const rolls = events.filter((e) => e.type === 'RollOff');
    expect(rolls.length).toBeGreaterThan(0);
    for (const r of rolls) {
      const byPlayer = r['rolls'] as Record<string, number[]>;
      expect(byPlayer['A']).toHaveLength(2);
      expect(byPlayer['C']).toHaveLength(1);
    }
    expect(['open', 'locked']).toContain(released(events));
  });

  it('gives the more infamous player worse odds over many seeds', () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { ctx, state } = standardMatch({ players: 2, seed });
      state.tension.value = 85;
      state.players['A']!.infamy = 9;
      const { events } = vote(ctx, toCrisis(ctx, startMatch(state)).state, { A: 'authorize' });
      if (released(events) === 'open') wins++;
    }
    // Disadvantage on a d6 roll-off wins roughly 27% of the time.
    expect(wins).toBeGreaterThan(25);
    expect(wins).toBeLessThan(85);
  });

  it('treats a timed-out vote as hold', async () => {
    const { defaultCommand } = await import('@nukka/core');
    expect(defaultCommand({ player: 'A', kind: 'crisis-vote' })).toEqual({
      type: 'CastCrisisVote',
      vote: 'hold',
    });
  });
});
