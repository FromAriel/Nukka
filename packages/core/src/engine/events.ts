import type { PlayerId } from './state.js';

/** Who may see an event (Technical Architecture spec §9.1). */
export type Visibility = 'public' | { readonly players: readonly PlayerId[] };

export interface GameEvent {
  readonly type: string;
  readonly visibility: Visibility;
  readonly [field: string]: unknown;
}

export type EventSink = GameEvent[];

export function visibleTo(event: GameEvent, player: PlayerId): boolean {
  return event.visibility === 'public' || event.visibility.players.includes(player);
}
