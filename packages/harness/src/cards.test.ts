import { PASS_ORDERS, submit, type PendingDecision } from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { match, play, round, tensionFrom, type Responder } from './test-helpers.js';

describe('root cards', () => {
  it('Propaganda Broadcast turns others against the target and raises tension', () => {
    const { ctx, state } = match({ A: ['propaganda-broadcast'] });
    const { state: after, events } = round(ctx, state, { A: play('propaganda-broadcast', 'B') });
    expect(after.hostility['C>B']).toBe(1);
    expect(after.hostility['D>B']).toBe(1);
    expect(after.hostility['A>B']).toBeUndefined();
    expect(tensionFrom(events, 'Propaganda Broadcast')).toBe(2);
    expect(after.players['A']!.hand).not.toContain('propaganda-broadcast');
    expect(after.deck.discard).toContain('propaganda-broadcast');
  });

  it('adds the open-crisis bonus to aggressive cards at 40+', () => {
    const { ctx, state } = match({ A: ['propaganda-broadcast'] }, { tension: 50 });
    const { events } = round(ctx, state, { A: play('propaganda-broadcast', 'B') });
    expect(tensionFrom(events, 'Propaganda Broadcast')).toBe(4);
  });

  it('Sanctions needs a blamed target and drains production for two upkeeps', () => {
    const { ctx, state } = match({ A: ['sanctions'] });
    const refused = submit(ctx, state, {
      matchId: 'test',
      playerId: 'A',
      seq: 1,
      cmd: { type: 'SubmitPlanning', orders: { ...PASS_ORDERS, ...play('sanctions', 'B') } },
    });
    expect(refused.ok).toBe(false);
    state.players['B']!.blame = 5;
    const { state: after } = round(ctx, state, { A: play('sanctions', 'B') });
    expect(after.players['B']!.reserves.production).toBe(6 + 7 - 2);
    expect(after.players['C']!.reserves.production).toBe(6 + 7);
  });

  it('Destabilize Government costs the target a development order next round', () => {
    const { ctx, state } = match({ A: ['destabilize-government'], B: ['summit', 'hotline'] });
    const { state: after } = round(ctx, state, { A: play('destabilize-government', 'B') });
    expect(after.players['B']!.hand.length).toBe(1 + 2); // discarded 1, drew 2 at upkeep
    const twoOrders = submit(ctx, after, {
      matchId: 'test',
      playerId: 'B',
      seq: (after.lastSeq['B'] ?? 0) + 1,
      cmd: {
        type: 'SubmitPlanning',
        orders: {
          ...PASS_ORDERS,
          development: [
            { type: 'ammunition', kind: 'conventionalBombs' },
            { type: 'ammunition', kind: 'conventionalBombs' },
          ],
        },
      },
    });
    expect(twoOrders.ok === false && twoOrders.problems.join()).toMatch(/at most 1 development/);
  });
});

describe('reactions', () => {
  it('offers only legal reactions and skips empty slots', () => {
    const { ctx, state } = match({ A: ['propaganda-broadcast'], B: ['summit'] });
    const seen: PendingDecision[] = [];
    round(ctx, state, { A: play('propaganda-broadcast', 'B') }, (d) => {
      seen.push(d);
      return undefined;
    });
    expect(seen).toEqual([]);
  });

  it('Hotline as stabilization halves the chain tension and blocks hostility', () => {
    const { ctx, state } = match({ A: ['propaganda-broadcast'], B: ['hotline'] });
    const slots: unknown[] = [];
    const { state: after, events } = round(
      ctx,
      state,
      { A: play('propaganda-broadcast', 'B') },
      (d) => {
        slots.push(d.slot);
        return d.kind === 'reaction' ? { type: 'React', card: 'hotline' } : undefined;
      },
    );
    expect(slots).toEqual(['stabilization']);
    expect(tensionFrom(events, 'Propaganda Broadcast')).toBe(1);
    expect(after.hostility['C>B']).toBeUndefined();
    expect(after.players['B']!.reactionPoints).toBe(2); // reset at upkeep
  });

  it('Smuggling Network halves an economic drain', () => {
    const { ctx, state } = match({ A: ['sanctions'], B: ['smuggling-network'] });
    state.players['B']!.blame = 5;
    const { state: after } = round(ctx, state, { A: play('sanctions', 'B') }, (d) =>
      d.kind === 'reaction' && d.slot === 'response'
        ? { type: 'React', card: 'smuggling-network' }
        : undefined,
    );
    expect(after.players['B']!.reserves.production).toBe(6 + 7 - 1);
  });

  it('rejects an illegal reaction', () => {
    const { ctx, state } = match({
      A: ['sanctions'],
      B: ['smuggling-network', 'hardened-shelters'],
    });
    state.players['B']!.blame = 5;
    expect(() =>
      round(ctx, state, { A: play('sanctions', 'B') }, (d) =>
        d.kind === 'reaction' ? { type: 'React', card: 'hardened-shelters' } : undefined,
      ),
    ).toThrow(/not a legal reaction/);
  });
});

describe('choices and global cards', () => {
  it('Ultimatum: the target may yield the named territory', () => {
    const { ctx, state } = match({ A: ['ultimatum'] });
    state.territories['N-frontier']!.owner = 'B';
    state.territories['N-frontier']!.militia = 0;
    const { state: after, events } = round(
      ctx,
      state,
      { A: play('ultimatum', 'N-frontier') },
      (d) => (d.kind === 'choice' ? { type: 'Choose', option: 'yield' } : undefined),
    );
    expect(after.territories['N-frontier']!.owner).toBe('A');
    expect(after.hostility['B>A']).toBe(3);
    expect(tensionFrom(events, 'Ultimatum')).toBe(15);
    expect(after.players['A']!.infamy).toBe(3);
  });

  it('Ultimatum defaults to refusing when the target does not answer', () => {
    const { ctx, state } = match({ A: ['ultimatum'] });
    state.territories['N-frontier']!.owner = 'B';
    const { state: after } = round(ctx, state, { A: play('ultimatum', 'N-frontier') });
    expect(after.territories['N-frontier']!.owner).toBe('B');
  });

  it('Doomsday Rhetoric collects a simultaneous choice from every other player', () => {
    const { ctx, state } = match({ A: ['doomsday-rhetoric'] }, { scenario: 'standoff' });
    const answers: Record<string, string> = { B: 'pay-production', C: 'refuse', D: 'pay-supplies' };
    const { state: after, events } = round(ctx, state, { A: play('doomsday-rhetoric') }, (d) =>
      d.kind === 'choice' ? { type: 'Choose', option: answers[d.player]! } : undefined,
    );
    expect(tensionFrom(events, 'Doomsday Rhetoric')).toBe(20);
    expect(after.hostility['C>A']).toBe(2);
    expect(events.filter((e) => e.type === 'ResourcesTransferred')).toHaveLength(2);
    expect(after.players['A']!.reserves.production).toBe(6 + 2 + 7);
  });

  it('Summit lowers tension per attendee and blames those who refuse', () => {
    const { ctx, state } = match({ A: ['summit'] }, { tension: 30 });
    const { state: after, events } = round(ctx, state, { A: play('summit') }, (d) =>
      d.kind === 'choice'
        ? { type: 'Choose', option: d.player === 'D' ? 'refuse' : 'attend' }
        : undefined,
    );
    expect(tensionFrom(events, 'Summit')).toBe(-9); // A, B and C attend; D refuses
    expect(after.players['D']!.infamy).toBe(1);
  });
});

describe('diplomacy', () => {
  it('signs a non-aggression pact; breaking it costs tension, blame and a cooldown', () => {
    const { ctx, state } = match({ A: ['propaganda-broadcast'] });
    const accept: Responder = (d) =>
      d.kind === 'proposal' ? { type: 'AnswerProposal', accept: true } : undefined;
    const { state: signed, events } = round(
      ctx,
      state,
      { A: { main: { type: 'proposal', proposal: 'nonAggression', target: 'B' } } },
      accept,
    );
    expect(signed.treaties.map((t) => t.kind)).toEqual(['nonAggression']);
    expect(events.some((e) => e.type === 'TreatySigned')).toBe(true);

    const { state: broken, events: breach } = round(ctx, signed, {
      A: play('propaganda-broadcast', 'B'),
    });
    expect(broken.treaties).toEqual([]);
    expect(breach.some((e) => e.type === 'TreatyEnded' && e['reason'] === 'breach')).toBe(true);
    expect(broken.players['A']!.infamy).toBe(3);
    expect(broken.hostility['B>A']).toBe(3);

    const again = submit(ctx, broken, {
      matchId: 'test',
      playerId: 'A',
      seq: (broken.lastSeq['A'] ?? 0) + 1,
      cmd: {
        type: 'SubmitPlanning',
        orders: {
          ...PASS_ORDERS,
          main: { type: 'proposal', proposal: 'nonAggression', target: 'B' },
        },
      },
    });
    expect(again.ok === false && again.problems.join()).toMatch(/cooldown/);
  });

  it('a declined proposal changes nothing', () => {
    const { ctx, state } = match({});
    const { state: after, events } = round(ctx, state, {
      A: { main: { type: 'proposal', proposal: 'peaceEnvoy', target: 'B' } },
    });
    expect(events.some((e) => e.type === 'ProposalDeclined')).toBe(true);
    expect(after.tension.value).toBe(state.tension.value - 4); // natural cooling only
  });

  it('mediation ends a war with a ceasefire and rewards the mediator', () => {
    const { ctx, state } = match({});
    state.relations['B|C'] = 'war';
    const { state: after } = round(
      ctx,
      state,
      { A: { main: { type: 'proposal', proposal: 'mediation', target: 'B', second: 'C' } } },
      (d) => (d.kind === 'proposal' ? { type: 'AnswerProposal', accept: true } : undefined),
    );
    expect(after.relations['B|C']).toBe('hostile');
    expect(after.treaties).toMatchObject([
      { kind: 'ceasefire', parties: ['B', 'C'], mediatedBy: 'A' },
    ]);
    expect(after.players['A']!.peaceBrokerTokens).toBe(1);
  });

  it('trade partners can send supplies', () => {
    const { ctx, state } = match({});
    const accept: Responder = (d) =>
      d.kind === 'proposal' ? { type: 'AnswerProposal', accept: true } : undefined;
    const { state: signed } = round(
      ctx,
      state,
      { A: { main: { type: 'proposal', proposal: 'trade', target: 'B' } } },
      accept,
    );
    const { state: after } = round(ctx, signed, {
      A: { trades: [{ to: 'B', resource: 'food', amount: 2 }] },
    });
    expect(after.players['A']!.reserves.food).toBe(4);
    expect(after.players['B']!.reserves.food).toBe(8);
  });
});
