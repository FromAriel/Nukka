/**
 * Crisis check and vote (Tension and Diplomacy spec §7). Opening release
 * never fires anything; it only makes committed nuclear plans eligible for
 * the coming combat window.
 */
import type { MatchContext } from './context.js';
import type { EventSink } from './events.js';
import { rollInt } from './random.js';
import { changeBlame } from './tension.js';
import type { GameState, PlayerId } from './state.js';

export type CrisisCheck = 'locked' | 'vote' | 'open' | 'aftermath';

export function crisisCheck(ctx: MatchContext, state: GameState): CrisisCheck {
  if (state.tension.release === 'aftermath') return 'aftermath';
  const { bands } = ctx.ruleset.tension;
  if (state.tension.value >= bands.releaseOpen) return 'open';
  if (state.tension.value >= bands.crisisVote) return 'vote';
  return 'locked';
}

export function eligibleVoters(state: GameState): PlayerId[] {
  return state.playerIds.filter((id) => state.players[id]?.viable);
}

/** Counts the votes, applies Authorize blame and sets the release state. */
export function resolveCrisisVote(ctx: MatchContext, state: GameState, events: EventSink): void {
  const voters = eligibleVoters(state);
  const votes = voters.map((id) => [id, state.crisisVotes[id] ?? 'hold'] as const);
  const authorizers = votes.filter(([, v]) => v === 'authorize').map(([id]) => id);
  events.push({
    type: 'CrisisVotesRevealed',
    visibility: 'public',
    votes: Object.fromEntries(votes),
  });
  for (const id of authorizers)
    changeBlame(
      ctx,
      state,
      events,
      id,
      ctx.ruleset.tension.vote.authorizeBlame,
      'voted to authorize release',
    );

  let open = authorizers.length * 2 > voters.length;
  if (voters.length === 2 && authorizers.length === 1) {
    const authorizer = authorizers[0]!;
    const holder = voters.find((id) => id !== authorizer)!;
    open = rollOff(ctx, state, events, authorizer, holder) === authorizer;
  }
  state.tension.release = open ? 'open' : 'locked';
  state.crisisVotes = {};
  events.push({
    type: 'ReleaseDecided',
    visibility: 'public',
    release: state.tension.release,
    authorizers,
  });
}

/**
 * Two-player roll-off: each rolls the die; the player with more infamy rolls
 * twice and keeps the lower; ties are rerolled. Returns the winner.
 */
export function rollOff(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  a: PlayerId,
  b: PlayerId,
): PlayerId {
  const die = ctx.ruleset.tension.vote.rollOffDie;
  const infamy = (id: PlayerId) => state.players[id]?.infamy ?? 0;
  const roll = (id: PlayerId, other: PlayerId): number[] => {
    const first = rollInt(state, 'roll-off', 1, die);
    if (infamy(id) <= infamy(other)) return [first];
    return [first, rollInt(state, 'roll-off', 1, die)];
  };
  for (;;) {
    const rollsA = roll(a, b);
    const rollsB = roll(b, a);
    const keptA = Math.min(...rollsA);
    const keptB = Math.min(...rollsB);
    events.push({ type: 'RollOff', visibility: 'public', rolls: { [a]: rollsA, [b]: rollsB } });
    if (keptA !== keptB) return keptA > keptB ? a : b;
  }
}
