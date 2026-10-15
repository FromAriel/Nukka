import { newId } from './setup.js';
import type { GameState, Modifier, PlayerId } from './state.js';

export function addModifier(
  state: GameState,
  spec: Omit<Modifier, 'id' | 'data'> & { data?: Modifier['data'] },
): Modifier {
  const modifier: Modifier = { id: newId(state, 'm'), data: {}, ...spec };
  state.modifiers.push(modifier);
  return modifier;
}

export function activeModifiers(
  state: GameState,
  player: PlayerId,
  stat: string,
  round = state.round,
): Modifier[] {
  return state.modifiers.filter(
    (m) => m.player === player && m.stat === stat && m.fromRound <= round && round <= m.untilRound,
  );
}

export function modifierTotal(
  state: GameState,
  player: PlayerId,
  stat: string,
  round = state.round,
): number {
  return activeModifiers(state, player, stat, round).reduce((sum, m) => sum + m.amount, 0);
}

/** Drops modifiers that ended before the current round. */
export function expireModifiers(state: GameState): void {
  state.modifiers = state.modifiers.filter((m) => m.untilRound >= state.round);
}
