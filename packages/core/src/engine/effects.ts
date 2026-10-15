/**
 * Applies card effects from data (Technical Architecture spec §11). Each
 * effect primitive is handled once here; cards never carry their own code.
 */
import { sortedEntries } from '../collections.js';
import type { Effect } from '../data/cards.js';
import { mulPermille } from '../fixed.js';
import { territoryDef, type MatchContext } from './context.js';
import { endTreaty, treatiesBetween } from './diplomacy.js';
import type { EventSink } from './events.js';
import { addModifier } from './modifiers.js';
import { rollInt } from './random.js';
import { addUnits, drawCards } from './setup.js';
import { changeBlame, changeHostility, changeTension } from './tension.js';
import type { CardParams, GameState, PlayerId, Reserves } from './state.js';

export interface Bindings {
  readonly self: PlayerId;
  readonly target: string | null;
  readonly targetOwner: PlayerId | null;
  readonly chooser?: PlayerId;
  readonly chainTarget?: string | null;
}

/** Chain-wide adjustments set by stabilization cards (Hotline, Smuggling Network). */
export interface ChainAdjustments {
  tensionPermille: number;
  noHostility: boolean;
  resourceLossPermille: number;
}

export const NO_ADJUSTMENTS: ChainAdjustments = {
  tensionPermille: 1000,
  noHostility: false,
  resourceLossPermille: 1000,
};

export type PlayMode = 'root' | 'stabilization' | 'response';

const SAFE_OPTIONS = ['decline', 'refuse', 'abstain'];

/** The option a player gets if they never answered: the one that commits them to nothing. */
export function safeOption(options: readonly { id: string }[]): string {
  return options.find((o) => SAFE_OPTIONS.includes(o.id))?.id ?? options[options.length - 1]!.id;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

export interface EffectRun {
  readonly ctx: MatchContext;
  readonly state: GameState;
  readonly events: EventSink;
  readonly bindings: Bindings;
  readonly answers: Readonly<Record<PlayerId, string>>;
  readonly adjust: ChainAdjustments;
  readonly params: CardParams;
  readonly mode: PlayMode;
  readonly cardName: string;
}

function ref(run: EffectRun, value: unknown): string | null {
  const s = str(value);
  switch (s) {
    case undefined:
      return null;
    case '$self':
      return run.bindings.self;
    case '$target':
      return run.bindings.target;
    case '$targetOwner':
      return run.bindings.targetOwner;
    case '$chooser':
      return run.bindings.chooser ?? null;
    case '$chainTarget':
      return run.bindings.chainTarget ?? null;
    default:
      return s;
  }
}

function rounds(run: EffectRun, effect: Effect): { fromRound: number; untilRound: number } {
  const round = run.state.round;
  if (typeof effect['upkeeps'] === 'number')
    return { fromRound: round + 1, untilRound: round + effect['upkeeps'] };
  const from = effect['from'] === 'nextRound' ? round + 1 : round;
  return { fromRound: from, untilRound: from + num(effect['rounds'], 1) - 1 };
}

export function applyEffects(run: EffectRun, effects: readonly Effect[]): void {
  for (const effect of effects) {
    const mode = effect['mode'];
    if (mode !== undefined && mode !== (run.mode === 'root' ? 'root' : 'stabilization')) continue;
    applyEffect(run, effect);
  }
}

function applyEffect(run: EffectRun, e: Effect): void {
  const { ctx, state, events } = run;
  switch (e.op) {
    case 'hostility': {
      if (run.adjust.noHostility) return;
      const toward = ref(run, e['toward']);
      const amount = num(e['amount']);
      if (!toward) return;
      if (e['from'] === 'others-except-self') {
        for (const id of state.playerIds) {
          if (id !== run.bindings.self && id !== toward && state.players[id]?.viable)
            changeHostility(ctx, state, id, toward, amount);
        }
      } else {
        const from = ref(run, e['from']);
        if (from) changeHostility(ctx, state, from, toward, amount);
      }
      return;
    }
    case 'blame': {
      const player = ref(run, e['player']);
      if (player) changeBlame(ctx, state, events, player, num(e['amount']), run.cardName);
      return;
    }
    case 'tension':
      changeTension(
        ctx,
        state,
        events,
        num(e['amount']),
        run.bindings.chooser ?? run.bindings.self,
        run.cardName,
      );
      return;
    case 'modify': {
      if (e['chain'] === 'current' || e['build'] !== undefined || e['operation'] !== undefined)
        return; // handled elsewhere
      const player = ref(run, e['player']);
      const stat = str(e['stat']);
      if (!player || !stat) throw new Error(`${run.cardName}: modify needs player and stat`);
      const data: Record<string, string | number | boolean> = {};
      for (const [key, value] of sortedEntries(e as Record<string, unknown>)) {
        if (
          ['op', 'player', 'stat', 'delta', 'value', 'rounds', 'from', 'upkeeps', 'mode'].includes(
            key,
          )
        )
          continue;
        if (typeof value === 'string') data[key] = ref(run, value) ?? value;
        else if (typeof value === 'number' || typeof value === 'boolean') data[key] = value;
      }
      addModifier(state, {
        player,
        stat,
        amount: num(e['delta'], num(e['value'], 1)),
        data,
        ...rounds(run, e),
      });
      return;
    }
    case 'damage': {
      const player = ref(run, e['player']);
      const resource = str(e['resource']);
      if (player && resource) {
        const amount = mulPermille(num(e['amount']), run.adjust.resourceLossPermille);
        if (amount > 0) {
          const window =
            typeof e['upkeeps'] === 'number'
              ? { fromRound: state.round + 1, untilRound: state.round + e['upkeeps'] }
              : { fromRound: state.round + 1, untilRound: state.round + 1 };
          addModifier(state, { player, stat: 'drain', amount, data: { resource }, ...window });
        }
        return;
      }
      const ammunition = str(e['ammunition']);
      if (player && ammunition) {
        removeAmmunition(state, player, ammunition, num(e['amount'], 1));
        return;
      }
      const territory = ref(run, e['territory']);
      if (territory) {
        removeGarrison(state, territory, num(e['garrisonFormations'], 1));
        return;
      }
      throw new Error(`${run.cardName}: unsupported damage effect`);
    }
    case 'discard': {
      const player = ref(run, e['player']);
      const p = player ? state.players[player] : undefined;
      if (!p) return;
      for (let i = 0; i < num(e['count'], 1) && p.hand.length > 0; i++) {
        const index = e['random']
          ? rollInt(state, 'cards', 0, p.hand.length - 1)
          : p.hand.length - 1;
        state.deck.discard.push(...p.hand.splice(index, 1));
      }
      return;
    }
    case 'draw': {
      const player = ref(run, e['player']);
      if (player) drawCards(state, player, num(e['count'], 1));
      return;
    }
    case 'transfer':
      transfer(run, e);
      return;
    case 'cancel': {
      if (str(e['treaty']) === undefined || e['operation'] !== undefined) return; // covert cancels: slice 4e
      const between = (Array.isArray(e['between']) ? e['between'] : [])
        .map((v) => ref(run, v))
        .filter((v): v is string => v !== null);
      if (between.length === 2) {
        for (const treaty of treatiesBetween(state, between[0]!, between[1]!, str(e['treaty']))) {
          endTreaty(ctx, state, events, treaty, { reason: run.cardName });
        }
      }
      return;
    }
    case 'move': {
      const target = run.bindings.target;
      for (const move of (run.params.moves ?? []).slice(0, num(e['stacks'], 1))) {
        const stack = state.units[move.stack];
        if (
          !stack ||
          stack.owner !== run.bindings.self ||
          move.count < 1 ||
          move.count > stack.count
        )
          continue;
        const borders = territoryDef(ctx, move.to).land.some(
          (n) => state.territories[n]?.owner === target,
        );
        if (state.territories[move.to]?.owner !== run.bindings.self || !borders) continue;
        stack.count -= move.count;
        addUnits(state, stack.owner, stack.kind, move.to, move.count);
        if (stack.count === 0) delete state.units[move.stack];
        events.push({
          type: 'UnitsMoved',
          visibility: 'public',
          player: stack.owner,
          kind: stack.kind,
          from: stack.location,
          to: move.to,
        });
      }
      return;
    }
    case 'protect': {
      const rule = str(e['rule']);
      if (rule === 'resourceLoss') return; // applied chain-wide
      const where = ref(run, e['territory']) ?? ref(run, e['installation']);
      addModifier(state, {
        player: run.bindings.self,
        stat: rule ?? 'protect',
        amount: num(e['amount'], num(e['rangePermille'], 1)),
        data: where ? { at: where } : {},
        fromRound: state.round,
        untilRound: state.round,
      });
      return;
    }
    case 'reveal': {
      const of = ref(run, e['of']);
      const to = ref(run, e['to']);
      if (!of || !to) return;
      const subjects = Array.isArray(e['subject']) ? e['subject'] : [e['subject']];
      for (const subject of subjects) {
        if (typeof subject === 'string')
          state.reveals.push({ subject, of, to, untilRound: state.round });
      }
      return;
    }
    case 'choice': {
      const options = e['options'] as { id: string; effects: Effect[] }[];
      const choosers =
        e['chooser'] === 'each-other-player'
          ? state.playerIds.filter((id) => id !== run.bindings.self && state.players[id]?.viable)
          : [
              e['chooser'] === 'target'
                ? (run.bindings.targetOwner ?? run.bindings.target ?? '')
                : run.bindings.self,
            ];
      for (const chooser of choosers) {
        const answer = run.answers[chooser] ?? safeOption(options);
        const option =
          options.find((o) => o.id === answer) ??
          options.find((o) => o.id === safeOption(options))!;
        events.push({
          type: 'ChoiceMade',
          visibility: 'public',
          card: run.cardName,
          player: chooser,
          option: option.id,
        });
        applyEffects({ ...run, bindings: { ...run.bindings, chooser } }, option.effects);
      }
      return;
    }
  }
}

function transfer(run: EffectRun, e: Effect): void {
  const { ctx, state, events } = run;
  const resource = str(e['resource']) as keyof Reserves | undefined;
  if (resource) {
    const from = ref(run, e['from']);
    const to = ref(run, e['to']);
    const giver = from ? state.players[from] : undefined;
    const taker = to ? state.players[to] : undefined;
    if (!giver || !taker) return;
    const amount = Math.min(num(e['amount']), giver.reserves[resource]);
    giver.reserves[resource] -= amount;
    taker.reserves[resource] += amount;
    events.push({ type: 'ResourcesTransferred', visibility: 'public', from, to, resource, amount });
    return;
  }
  const territory = ref(run, e['territory']);
  const newOwner = ref(run, e['to']);
  if (territory && newOwner) {
    transferTerritory(ctx, state, territory, newOwner);
    events.push({ type: 'TerritoryTransferred', visibility: 'public', territory, to: newOwner });
    return;
  }
  if (typeof e['refillBatteries'] === 'number') {
    const where = ref(run, e['territory']);
    let left = e['refillBatteries'];
    for (const [, inst] of sortedEntries(state.installations)) {
      if (left === 0) break;
      if (inst.territory !== where || inst.owner !== run.bindings.self || inst.magazine === null)
        continue;
      const full = ctx.ruleset.defenses.defenses[inst.kind]?.magazine ?? null;
      if (full !== null && inst.magazine < full) {
        inst.magazine = full;
        left--;
      }
    }
    return;
  }
  throw new Error(`${run.cardName}: unsupported transfer effect`);
}

/** Hands a territory over intact; the old owner's units leave for an adjacent friendly territory or are lost. */
export function transferTerritory(
  ctx: MatchContext,
  state: GameState,
  territory: string,
  newOwner: PlayerId,
): void {
  const t = state.territories[territory];
  if (!t) return;
  const oldOwner = t.owner;
  t.owner = newOwner;
  t.hungry = 0;
  t.militia = 0;
  for (const [, inst] of sortedEntries(state.installations))
    if (inst.territory === territory) inst.owner = newOwner;
  if (oldOwner === null) return;
  const refuge = territoryDef(ctx, territory).land.find(
    (n) => state.territories[n]?.owner === oldOwner,
  );
  for (const [id, stack] of sortedEntries(state.units)) {
    if (stack.location !== territory || stack.owner !== oldOwner) continue;
    delete state.units[id];
    if (refuge) addUnits(state, oldOwner, stack.kind, refuge, stack.count);
  }
}

function removeAmmunition(state: GameState, player: PlayerId, kind: string, amount: number): void {
  const p = state.players[player];
  if (!p) return;
  let left = amount;
  const fromStock = Math.min(left, p.stock[kind] ?? 0);
  p.stock[kind] = (p.stock[kind] ?? 0) - fromStock;
  left -= fromStock;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (left === 0) break;
    if (inst.owner !== player) continue;
    const take = Math.min(left, inst.loaded[kind] ?? 0);
    if (take > 0) {
      inst.loaded[kind] = (inst.loaded[kind] ?? 0) - take;
      left -= take;
    }
  }
}

function removeGarrison(state: GameState, territory: string, amount: number): void {
  const t = state.territories[territory];
  if (!t) return;
  let left = amount;
  for (const [id, stack] of sortedEntries(state.units)) {
    if (left === 0) break;
    if (stack.location !== territory || stack.owner !== t.owner || stack.kind !== 'groundFormation')
      continue;
    const take = Math.min(left, stack.count);
    stack.count -= take;
    left -= take;
    if (stack.count === 0) delete state.units[id];
  }
  if (left > 0) t.militia = Math.max(0, t.militia - left);
}
