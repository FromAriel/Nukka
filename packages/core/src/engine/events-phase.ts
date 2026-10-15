/**
 * The events phase: main actions resolve one at a time in initiative order,
 * each through a bounded chain (main design §4; Technical Architecture §7).
 * A chain has at most a root plus one card in each of the response, counter
 * and stabilization slots; nothing can reopen it.
 */
import type { CardDef, Effect } from '../data/cards.js';
import { mulPermille } from '../fixed.js';
import { cardDef, isHostileCard, reactionLegal, targetOwner, targetProblems } from './cards.js';
import type { MatchContext } from './context.js';
import {
  applyProposal,
  breachIfProtected,
  proposalParties,
  proposalProblems,
} from './diplomacy.js';
import { NO_ADJUSTMENTS, applyEffects, safeOption, type ChainAdjustments } from './effects.js';
import type { EventSink } from './events.js';
import { declareOperation } from './operations.js';
import { newId } from './setup.js';
import { changeBlame, changeTension } from './tension.js';
import type {
  Chain,
  ChainSlot,
  GameState,
  PendingDecision,
  PlayerId,
  QueuedAction,
} from './state.js';

/** Runs the events phase until it finishes (true) or needs a decision (false). */
export function runEvents(ctx: MatchContext, state: GameState, events: EventSink): boolean {
  for (;;) {
    if (state.decisions.length > 0) return false;
    if (state.chain) {
      if (!advanceChain(ctx, state, events)) return false;
      continue;
    }
    const next = state.actionQueue.shift();
    if (!next) return true;
    beginAction(ctx, state, events, next);
  }
}

function beginAction(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  queued: QueuedAction,
): void {
  const { player, action } = queued;
  if (!state.players[player]?.viable) return;
  switch (action.type) {
    case 'pass':
      return;
    case 'operation':
      declareOperation(ctx, state, events, player, action);
      return;
    case 'card': {
      const card = cardDef(ctx, action.card);
      const problems = targetProblems(ctx, state, player, card, action.target);
      if (problems.length > 0) {
        state.deck.discard.push(action.card);
        events.push({
          type: 'ActionFizzled',
          visibility: 'public',
          player,
          card: card.id,
          reason: problems.join('; '),
        });
        return;
      }
      const defender = targetOwner(state, card, action.target ?? null);
      events.push({
        type: 'CardPlayed',
        visibility: 'public',
        player,
        card: card.id,
        target: action.target ?? null,
        slot: 'root',
      });
      if (defender !== null && isHostileCard(card))
        breachIfProtected(ctx, state, events, player, defender);
      const global = card.plays.includes('global');
      state.chain = {
        id: newId(state, 'c'),
        kind: global ? 'global' : 'card',
        initiator: player,
        defender: global ? null : defender,
        links: [
          { slot: 'root', player, card: card.id, target: action.target ?? null, canceled: false },
        ],
        remaining: global || defender === null ? [] : ['response', 'counter', 'stabilization'],
        params: structuredClone(action.params ?? {}),
        proposal: null,
        answers: {},
      };
      return;
    }
    case 'proposal': {
      const problems = proposalProblems(state, player, action);
      if (problems.length > 0) {
        events.push({
          type: 'ActionFizzled',
          visibility: 'public',
          player,
          proposal: action.proposal,
          reason: problems.join('; '),
        });
        return;
      }
      const parties = proposalParties(state, player, action);
      events.push({
        type: 'ProposalMade',
        visibility: 'public',
        player,
        proposal: action.proposal,
        parties,
      });
      state.chain = {
        id: newId(state, 'c'),
        kind: 'proposal',
        initiator: player,
        defender: null,
        links: [],
        remaining: [],
        params: {},
        proposal: { kind: action.proposal, parties },
        answers: {},
      };
      return;
    }
  }
}

function rootTension(ctx: MatchContext, state: GameState, card: CardDef): number {
  const bonus =
    card.tension > 0 && state.tension.value >= ctx.ruleset.tension.bands.openCrisis
      ? ctx.ruleset.tension.openCrisisCardBonus
      : 0;
  return card.tension + bonus;
}

/** Cards a player could play in this slot right now. */
export function legalReactions(
  ctx: MatchContext,
  state: GameState,
  chain: Chain,
  player: PlayerId,
  slot: ChainSlot,
): string[] {
  const p = state.players[player];
  const root = chain.links[0];
  if (!p || !root || p.reactionPoints < 1) return [];
  const tension = rootTension(ctx, state, cardDef(ctx, root.card));
  return [...new Set(p.hand)]
    .filter((id) => reactionLegal(ctx, state, player, cardDef(ctx, id), slot, root, tension))
    .sort();
}

function slotPlayer(chain: Chain, slot: ChainSlot): PlayerId | null {
  return slot === 'counter' ? chain.initiator : chain.defender;
}

/** Top-level choice effects of the root card, with who must answer each. */
function pendingChoices(ctx: MatchContext, state: GameState, chain: Chain): PendingDecision[] {
  const root = chain.links[0];
  if (!root || root.canceled) return [];
  const card = cardDef(ctx, root.card);
  const decisions: PendingDecision[] = [];
  for (const effect of card.effects) {
    if (effect.op !== 'choice' || (effect['mode'] !== undefined && effect['mode'] !== 'root'))
      continue;
    const options = effect['options'] as { id: string; effects: Effect[] }[];
    const choosers =
      effect['chooser'] === 'each-other-player'
        ? state.playerIds.filter((id) => id !== chain.initiator && state.players[id]?.viable)
        : [chain.defender ?? ''];
    for (const chooser of choosers) {
      if (!chooser || chain.answers[chooser] !== undefined) continue;
      const legal = options
        .filter((o) => optionAffordable(state, chooser, o.effects))
        .map((o) => o.id);
      decisions.push({
        player: chooser,
        kind: 'choice',
        options: legal.length > 0 ? legal : [safeOption(options)],
      });
    }
  }
  return decisions;
}

function optionAffordable(
  state: GameState,
  chooser: PlayerId,
  effects: readonly Effect[],
): boolean {
  const p = state.players[chooser];
  if (!p) return false;
  return effects.every((e) => {
    if (e.op !== 'transfer' || e['from'] !== '$chooser' || typeof e['resource'] !== 'string')
      return true;
    return (
      (p.reserves[e['resource'] as keyof typeof p.reserves] ?? 0) >=
      (typeof e['amount'] === 'number' ? e['amount'] : 0)
    );
  });
}

/** Moves the chain forward. Returns false when it opened a decision. */
function advanceChain(ctx: MatchContext, state: GameState, events: EventSink): boolean {
  const chain = state.chain!;
  while (chain.remaining.length > 0) {
    const slot = chain.remaining[0]!;
    const player = slotPlayer(chain, slot);
    const counterWithoutResponse =
      slot === 'counter' && !chain.links.some((l) => l.slot === 'response');
    if (
      player === null ||
      counterWithoutResponse ||
      legalReactions(ctx, state, chain, player, slot).length === 0
    ) {
      chain.remaining.shift();
      continue;
    }
    state.decisions = [{ player, kind: 'reaction', slot }];
    return false;
  }
  if (chain.kind === 'proposal') {
    const waiting = chain.proposal!.parties.filter(
      (p) => chain.answers[p] === undefined && state.players[p]?.viable,
    );
    if (waiting.length > 0) {
      state.decisions = waiting.map((player) => ({ player, kind: 'proposal' }));
      return false;
    }
  } else {
    const choices = pendingChoices(ctx, state, chain);
    if (choices.length > 0) {
      state.decisions = choices;
      return false;
    }
  }
  closeChain(ctx, state, events, chain);
  state.chain = null;
  return true;
}

function closeChain(ctx: MatchContext, state: GameState, events: EventSink, chain: Chain): void {
  if (chain.kind === 'proposal') {
    const proposal = chain.proposal!;
    const accepted = proposal.parties.every((p) => chain.answers[p] === 'accept');
    events.push({
      type: accepted ? 'ProposalAccepted' : 'ProposalDeclined',
      visibility: 'public',
      player: chain.initiator,
      proposal: proposal.kind,
    });
    if (accepted) applyProposal(ctx, state, events, chain.initiator, proposal);
    return;
  }

  const root = chain.links[0]!;
  const card = cardDef(ctx, root.card);
  const adjust: ChainAdjustments = { ...NO_ADJUSTMENTS };
  for (const link of chain.links.slice(1)) {
    if (link.canceled) continue;
    for (const effect of cardDef(ctx, link.card).effects) {
      if (
        effect.op === 'modify' &&
        effect['chain'] === 'current' &&
        link.slot === 'stabilization'
      ) {
        adjust.tensionPermille =
          typeof effect['tensionPermille'] === 'number' ? effect['tensionPermille'] : 1000;
        adjust.noHostility = effect['noHostility'] === true;
      }
      if (
        effect.op === 'protect' &&
        effect['rule'] === 'resourceLoss' &&
        typeof effect['permille'] === 'number'
      ) {
        adjust.resourceLossPermille = effect['permille'];
      }
    }
  }

  const bindings = {
    self: chain.initiator,
    target: root.target,
    targetOwner: chain.defender ?? targetOwner(state, card, root.target),
  };
  if (!root.canceled) {
    applyEffects(
      {
        ctx,
        state,
        events,
        bindings,
        answers: chain.answers,
        adjust,
        params: chain.params,
        mode: 'root',
        cardName: card.name,
      },
      card.effects,
    );
  }
  const tension = rootTension(ctx, state, card);
  changeTension(
    ctx,
    state,
    events,
    tension > 0 ? mulPermille(tension, adjust.tensionPermille) : tension,
    chain.initiator,
    card.name,
  );
  if (card.blame !== 0) changeBlame(ctx, state, events, chain.initiator, card.blame, card.name);

  for (const link of chain.links.slice(1)) {
    if (link.canceled) continue;
    const reaction = cardDef(ctx, link.card);
    applyEffects(
      {
        ctx,
        state,
        events,
        bindings: {
          self: link.player,
          target: link.target,
          targetOwner: link.player,
          chainTarget: root.target,
        },
        answers: {},
        adjust,
        params: {},
        mode: link.slot === 'stabilization' ? 'stabilization' : 'response',
        cardName: reaction.name,
      },
      reaction.effects,
    );
  }
  for (const link of chain.links) state.deck.discard.push(link.card);
  events.push({
    type: 'ChainClosed',
    visibility: 'public',
    chain: chain.id,
    cards: chain.links.map((l) => l.card),
  });
}

/** Records a reaction (or a pass) for the current slot. */
export function applyReaction(state: GameState, player: PlayerId, card: string | null): void {
  const chain = state.chain;
  if (!chain) return;
  const slot = chain.remaining.shift();
  if (!slot) return;
  if (card === null) return;
  const p = state.players[player]!;
  p.hand.splice(p.hand.indexOf(card), 1);
  p.reactionPoints -= 1;
  chain.links.push({ slot, player, card, target: null, canceled: false });
}
