/**
 * Card legality: who may play what, at which target (Base Deck spec;
 * Technical Architecture spec §11).
 */
import { sortedEntries } from '../collections.js';
import type { CardDef } from '../data/cards.js';
import { territoryDef, type MatchContext } from './context.js';
import { posturePoints } from './derived.js';
import { isPariah } from './tension.js';
import type { ChainLink, GameState, PlayerId } from './state.js';

export function cardDef(ctx: MatchContext, id: string): CardDef {
  const card = ctx.deck.cards.find((c) => c.id === id);
  if (!card) throw new Error(`unknown card "${id}"`);
  return card;
}

/** The player a card's target belongs to (a player target, or a territory/installation owner). */
export function targetOwner(
  state: GameState,
  card: CardDef,
  target: string | undefined | null,
): PlayerId | null {
  if (target === undefined || target === null) return null;
  switch (card.target.type) {
    case 'player':
      return target;
    case 'territory':
      return state.territories[target]?.owner ?? null;
    case 'installation':
      return state.installations[target]?.owner ?? null;
    default:
      return null;
  }
}

/** Aggressive cards aimed at another player (everything but diplomacy). */
export function isHostileCard(card: CardDef): boolean {
  return !card.tags.includes('diplomatic') && card.target.owner === 'other';
}

function ownsAdjacentTo(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  territory: string,
): boolean {
  return territoryDef(ctx, territory).land.some((n) => state.territories[n]?.owner === player);
}

function bordersPlayer(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  other: PlayerId,
): boolean {
  return ctx.territoryIds.some(
    (id) => state.territories[id]?.owner === other && ownsAdjacentTo(ctx, state, player, id),
  );
}

function warheadsHeld(state: GameState, player: PlayerId): number {
  let total = state.players[player]?.stock['warheads'] ?? 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner === player) total += inst.loaded['warheads'] ?? 0;
  }
  return total;
}

function requirementMet(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  requirement: string,
): boolean {
  switch (requirement) {
    case 'self.nuclearAssets>=1':
      return posturePoints(ctx, state, player) > 0;
    case 'self.warheads>=1':
      return warheadsHeld(state, player) >= 1;
    default:
      throw new Error(`unknown card requirement "${requirement}"`);
  }
}

function filterMet(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  filter: string,
  target: string,
  owner: PlayerId | null,
): boolean {
  const blameAtLeast = /^blame>=(\d+)$/.exec(filter);
  if (blameAtLeast) return (state.players[target]?.blame ?? 0) >= Number(blameAtLeast[1]);
  switch (filter) {
    case 'pariah':
      return isPariah(ctx, state, target);
    case 'borders-self':
      return bordersPlayer(ctx, state, player, target);
    case 'non-starting':
      return state.territories[target]?.startingOwner !== owner;
    case 'adjacent-to-self':
      return ownsAdjacentTo(ctx, state, player, target);
    default:
      throw new Error(`unknown target filter "${filter}"`);
  }
}

/** Problems with playing a root or global card now; empty means legal. */
export function rootCardProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  cardId: string,
  target: string | undefined,
): string[] {
  const p = state.players[player];
  if (!p) return ['unknown player'];
  if (!p.hand.includes(cardId)) return [`${cardId} is not in your hand`];
  let card: CardDef;
  try {
    card = cardDef(ctx, cardId);
  } catch {
    return [`unknown card "${cardId}"`];
  }
  if (!card.plays.includes('root') && !card.plays.includes('global'))
    return [`${card.name} can't be played as a main action`];
  for (const requirement of card.requires ?? []) {
    if (!requirementMet(ctx, state, player, requirement))
      return [`${card.name} requires ${requirement}`];
  }
  return targetProblems(ctx, state, player, card, target);
}

export function targetProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  card: CardDef,
  target: string | undefined,
): string[] {
  const spec = card.target;
  if (spec.type === 'none') return target === undefined ? [] : [`${card.name} takes no target`];
  if (target === undefined) return [`${card.name} needs a ${spec.type} target`];
  let owner: PlayerId | null;
  switch (spec.type) {
    case 'player':
      if (!state.players[target]?.viable) return [`${target} is not a player in the game`];
      owner = target;
      break;
    case 'territory':
      if (!state.territories[target]) return [`unknown territory "${target}"`];
      owner = state.territories[target]?.owner ?? null;
      break;
    case 'installation': {
      const inst = state.installations[target];
      if (!inst) return [`unknown installation "${target}"`];
      if (spec.kinds && !spec.kinds.includes(inst.kind))
        return [`${card.name} can't target a ${inst.kind}`];
      owner = inst.owner;
      break;
    }
    default:
      return [`${card.name} can't be aimed by a main action`];
  }
  if (spec.owner === 'other' && (owner === null || owner === player))
    return [`${card.name} must target another player`];
  if (spec.owner === 'self' && owner !== player) return [`${card.name} must target yourself`];
  for (const filter of spec.filters ?? []) {
    if (!filterMet(ctx, state, player, filter, target, owner))
      return [`${card.name}: target fails "${filter}"`];
  }
  return [];
}

/** Whether a reaction card may answer the chain's root in the given slot. */
export function reactionLegal(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  card: CardDef,
  slot: 'response' | 'counter' | 'stabilization',
  root: ChainLink,
  rootTension: number,
): boolean {
  if (!card.plays.includes(slot)) return false;
  if (card.plays.some((m) => m === 'operation' || m === 'countermeasure' || m === 'attachment'))
    return false;
  const rootCard = cardDef(ctx, root.card);
  const rootOwner = targetOwner(state, rootCard, root.target);
  if (card.target.type === 'chain-card') {
    for (const filter of card.target.filters ?? []) {
      switch (filter) {
        case 'hostile':
          if (!isHostileCard(rootCard)) return false;
          break;
        case 'targets-own-territory':
          if (rootCard.target.type !== 'territory' || rootOwner !== player) return false;
          break;
        case 'economic-or-interdiction':
          if (!rootCard.tags.includes('economic')) return false;
          break;
        case 'targets-self':
          if (rootOwner !== player) return false;
          break;
        default:
          throw new Error(`unknown chain filter "${filter}"`);
      }
    }
    return true;
  }
  // Stabilization cards that act on the chain itself (Hotline): any chain that raises tension.
  if (slot === 'stabilization' && card.effects.some((e) => e['mode'] === 'stabilization'))
    return rootTension > 0;
  return false;
}
