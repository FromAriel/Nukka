/**
 * Planning orders: validation when submitted, and resolution once every
 * player's orders are in (main design §3B; Technical Architecture spec §7).
 */
import { sortedEntries } from '../collections.js';
import { ceilDiv, mulPermille } from '../fixed.js';
import { installationRules, territoryDef, type MatchContext } from './context.js';
import { rootCardProblems } from './cards.js';
import {
  cardsUsed,
  covertIpCost,
  placeShadowMarkers,
  resolveAccusation,
  shadowProblems,
} from './covert.js';
import { networks, devastationEffects } from './derived.js';
import {
  leaveTreaty,
  leaveTreatyProblems,
  proposalProblems,
  treatiesBetween,
} from './diplomacy.js';
import { modifierTotal } from './modifiers.js';
import { operationProblems } from './operations.js';
import type { EventSink } from './events.js';
import { addInstallation, addUnits } from './setup.js';
import { changeTension } from './tension.js';
import type {
  DevelopmentOrder,
  GameState,
  Installation,
  PlanningOrders,
  PlayerId,
} from './state.js';

const MILITARY_ORDERS: ReadonlySet<DevelopmentOrder['type']> = new Set(['recruit', 'ammunition']);

const SITES_PER_TERRITORY = 4;

function installationsInTerritory(state: GameState, territory: string): Installation[] {
  return sortedEntries(state.installations)
    .map(([, i]) => i)
    .filter((i) => i.territory === territory);
}

function freeSite(state: GameState, territory: string): number | null {
  const used = new Set(installationsInTerritory(state, territory).map((i) => i.site));
  for (let site = 0; site < SITES_PER_TERRITORY; site++) if (!used.has(site)) return site;
  return null;
}

function owns(state: GameState, player: PlayerId, territory: string): boolean {
  return state.territories[territory]?.owner === player;
}

function sameNetwork(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  a: string,
  b: string,
): boolean {
  return networks(ctx, state, player).some(
    (n) => n.territories.includes(a) && n.territories.includes(b),
  );
}

function airCapacity(ctx: MatchContext, state: GameState, territory: string): number {
  let capacity = 0;
  for (const inst of installationsInTerritory(state, territory)) {
    if (inst.condition === 'ruined') continue;
    capacity += installationRules(ctx, inst.kind).economy?.aircraftCapacity ?? 0;
  }
  let used = 0;
  for (const [, u] of sortedEntries(state.units)) {
    if (u.location === territory && ctx.ruleset.units.units[u.kind]?.domain === 'air')
      used += u.count;
  }
  return capacity - used;
}

/** Sea zones a player may place or move sea units into: those next to a coastal territory they own. */
function playerSeaZones(ctx: MatchContext, state: GameState, player: PlayerId): Set<string> {
  const zones = new Set<string>();
  for (const id of ctx.territoryIds)
    if (owns(state, player, id)) for (const z of territoryDef(ctx, id).sea) zones.add(z);
  return zones;
}

export function orderCost(ctx: MatchContext, state: GameState, order: DevelopmentOrder): number {
  switch (order.type) {
    case 'build':
      return installationRules(ctx, order.kind).cost;
    case 'upgrade': {
      const inst = state.installations[order.installation];
      return inst ? (installationRules(ctx, inst.kind).economy?.upgrade?.cost ?? 0) : 0;
    }
    case 'repair': {
      const inst = state.installations[order.installation];
      if (!inst) return 0;
      const base = installationRules(ctx, inst.kind).cost;
      const repair = ctx.ruleset.economy.repair;
      return inst.condition === 'ruined'
        ? base + repair.rebuildExtraCost
        : ceilDiv(base * repair.repairCostPermille, 1000);
    }
    case 'recruit':
      return ctx.ruleset.units.units[order.unit]?.cost ?? 0;
    case 'ammunition':
      return ctx.ruleset.units.ammunition[order.kind]?.cost ?? 0;
    default:
      return 0;
  }
}

/** Returns a list of problems; empty means the orders are legal. */
export function validatePlanning(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  orders: PlanningOrders,
): string[] {
  const problems: string[] = [];
  const p = state.players[player];
  if (!p) return ['unknown player'];
  const limits = ctx.ruleset.match.orders;
  const devLimit = Math.max(
    0,
    limits.development + modifierTotal(state, player, 'developmentOrders'),
  );
  const militaryExtra = modifierTotal(state, player, 'militaryDevelopmentOrders');
  const general = orders.development.filter((o) => !MILITARY_ORDERS.has(o.type)).length;
  if (orders.development.length > devLimit + militaryExtra || general > devLimit) {
    problems.push(
      `at most ${devLimit} development orders${militaryExtra > 0 ? ` (+${militaryExtra} military)` : ''}`,
    );
  }
  let production = 0;
  const pendingSites = new Map<string, number>();
  const touched = new Set<string>();
  orders.development.forEach((order, index) => {
    const at = `development[${index}]`;
    production += orderCost(ctx, state, order);
    const touch = (id: string) => {
      if (touched.has(id)) problems.push(`${at}: ${id} is already used by another order`);
      touched.add(id);
    };
    switch (order.type) {
      case 'build': {
        let rules;
        try {
          rules = installationRules(ctx, order.kind);
        } catch {
          problems.push(`${at}: unknown installation "${order.kind}"`);
          break;
        }
        if (!owns(state, player, order.territory)) {
          problems.push(`${at}: you don't own ${order.territory}`);
          break;
        }
        const def = territoryDef(ctx, order.territory);
        const feature = rules.economy?.requiresFeature;
        if (feature && !def.features.includes(feature))
          problems.push(`${at}: ${order.kind} needs ${feature}`);
        const taken = pendingSites.get(order.territory) ?? 0;
        const free =
          SITES_PER_TERRITORY - installationsInTerritory(state, order.territory).length - taken;
        if (free <= 0) problems.push(`${at}: no free site in ${order.territory}`);
        pendingSites.set(order.territory, taken + 1);
        const max = rules.economy?.maxPerCountry;
        if (max !== undefined) {
          const have = sortedEntries(state.installations).filter(
            ([, i]) => i.owner === player && i.kind === order.kind,
          ).length;
          const planned = orders.development.filter(
            (o) => o.type === 'build' && o.kind === order.kind,
          ).length;
          if (have + planned > max)
            problems.push(`${at}: at most ${max} ${order.kind} per country`);
        }
        if (order.mode !== undefined && !(order.mode in (rules.economy?.modes ?? {}))) {
          problems.push(`${at}: ${order.kind} has no mode "${order.mode}"`);
        }
        break;
      }
      case 'upgrade': {
        const inst = state.installations[order.installation];
        touch(order.installation);
        if (!inst || inst.owner !== player) problems.push(`${at}: not your installation`);
        else if (!installationRules(ctx, inst.kind).economy?.upgrade)
          problems.push(`${at}: ${inst.kind} has no upgrade`);
        else if (inst.upgraded) problems.push(`${at}: already upgraded`);
        else if (inst.condition !== 'operational') problems.push(`${at}: repair it first`);
        break;
      }
      case 'repair': {
        const inst = state.installations[order.installation];
        touch(order.installation);
        if (!inst || inst.owner !== player) problems.push(`${at}: not your installation`);
        else if (inst.condition === 'operational') problems.push(`${at}: nothing to repair`);
        else if (inst.repairCompletesRound !== null) problems.push(`${at}: already being repaired`);
        break;
      }
      case 'recruit': {
        const unit = ctx.ruleset.units.units[order.unit];
        if (!unit || !unit.buildable) {
          problems.push(`${at}: can't recruit "${order.unit}"`);
          break;
        }
        if (unit.domain === 'sea') {
          if (!playerSeaZones(ctx, state, player).has(order.location))
            problems.push(`${at}: ${order.location} isn't next to your coast`);
        } else if (!owns(state, player, order.location)) {
          problems.push(`${at}: you don't own ${order.location}`);
        } else if (unit.domain === 'air') {
          const planned = orders.development
            .slice(0, index)
            .filter((o) => o.type === 'recruit' && o.location === order.location).length;
          if (airCapacity(ctx, state, order.location) - planned <= 0)
            problems.push(`${at}: no airfield space in ${order.location}`);
        }
        break;
      }
      case 'ammunition':
        if (!ctx.ruleset.units.ammunition[order.kind])
          problems.push(`${at}: unknown ammunition "${order.kind}"`);
        break;
      case 'dismantle': {
        const inst = state.installations[order.installation];
        touch(order.installation);
        if (!inst || inst.owner !== player) problems.push(`${at}: not your installation`);
        break;
      }
      case 'disband': {
        const stack = state.units[order.stack];
        touch(order.stack);
        if (!stack || stack.owner !== player) problems.push(`${at}: not your units`);
        else if (order.count < 1 || order.count > stack.count)
          problems.push(`${at}: invalid count`);
        break;
      }
      case 'destroyAmmunition': {
        const have = p.stock[order.kind] ?? 0;
        if (order.count < 1 || order.count > have)
          problems.push(`${at}: you have ${have} ${order.kind}`);
        break;
      }
    }
  });
  if (production > p.reserves.production) {
    problems.push(`orders cost ${production} production; you have ${p.reserves.production}`);
  }

  const moveLimit = limits.repositioning + modifierTotal(state, player, 'repositioningOrders');
  if (orders.repositioning.length > moveLimit)
    problems.push(`at most ${moveLimit} repositioning orders`);
  const movedStacks = new Set<string>();
  for (const move of orders.repositioning) {
    if (movedStacks.has(move.stack)) problems.push('repositioning: each stack moves once');
    movedStacks.add(move.stack);
    const stack = state.units[move.stack];
    if (!stack || stack.owner !== player) problems.push('repositioning: not your units');
    else if (move.count < 1 || move.count > stack.count)
      problems.push('repositioning: invalid count');
    else {
      const domain = ctx.ruleset.units.units[stack.kind]?.domain;
      if (domain === 'sea') {
        const from = ctx.seaZones.get(stack.location);
        if (!from || !(from.adjacentSea.includes(move.to) || move.to === stack.location))
          problems.push('repositioning: sea units move one zone');
      } else if (
        !owns(state, player, move.to) ||
        !sameNetwork(ctx, state, player, stack.location, move.to)
      ) {
        problems.push('repositioning: destination must be connected friendly territory');
      } else if (domain === 'air' && airCapacity(ctx, state, move.to) < move.count) {
        problems.push('repositioning: not enough airfield space');
      } else if ((ctx.ruleset.units.units[stack.kind]?.speed ?? 0) === 0 && domain === 'ground') {
        problems.push('repositioning: this unit cannot move');
      }
    }
  }

  const stockAfter = { ...p.stock };
  for (const [i, load] of orders.loads.entries()) {
    const inst = state.installations[load.installation];
    const capacity = inst ? (installationRules(ctx, inst.kind).economy?.missileCapacity ?? 0) : 0;
    const accepts =
      inst?.kind === 'silo'
        ? 'warheads'
        : inst?.kind === 'missileLauncher'
          ? 'conventionalMissiles'
          : null;
    if (!inst || inst.owner !== player || accepts === null)
      problems.push(`loads[${i}]: can't load that installation`);
    else if (load.ammunition !== accepts)
      problems.push(`loads[${i}]: ${inst.kind} takes ${accepts}`);
    else {
      const loaded = sortedEntries(inst.loaded).reduce((s, [, n]) => s + n, 0);
      if (load.count < 1 || loaded + load.count > capacity)
        problems.push(`loads[${i}]: exceeds capacity ${capacity}`);
      const left = (stockAfter[load.ammunition] ?? 0) - load.count;
      if (left < 0) problems.push(`loads[${i}]: not enough ${load.ammunition} in stock`);
      stockAfter[load.ammunition] = left;
    }
  }

  for (const [id, mode] of sortedEntries(orders.modes)) {
    const inst = state.installations[id];
    const modes = inst ? installationRules(ctx, inst.kind).economy?.modes : undefined;
    if (!inst || inst.owner !== player || !modes)
      problems.push(`modes.${id}: not an installation with modes`);
    else if (!(mode in modes)) problems.push(`modes.${id}: unknown mode "${mode}"`);
  }

  problems.push(...shadowProblems(ctx, state, player, orders));
  const counts = new Map<string, number>();
  for (const card of cardsUsed(orders)) counts.set(card, (counts.get(card) ?? 0) + 1);
  for (const [card, need] of counts) {
    const have = p.hand.filter((c) => c === card).length;
    if (have < need) problems.push(`hand: these orders use ${need} × ${card}, you hold ${have}`);
  }
  for (const order of orders.development) {
    if ('covert' in order && order.covert) {
      const asset =
        order.type === 'build' || order.type === 'ammunition'
          ? order.kind
          : order.type === 'recruit'
            ? order.unit
            : '';
      if ((ctx.ruleset.tension.buildupSpikes[asset] ?? 0) === 0) {
        problems.push(`covert: only nuclear builds can be hidden, not ${asset}`);
      }
    }
  }
  const covertIp = covertIpCost(ctx, orders);
  if (!Number.isSafeInteger(orders.counterIntel) || orders.counterIntel < 0) {
    problems.push('counterIntel must be a non-negative integer');
  } else if (orders.counterIntel + covertIp > p.reserves.intelligence) {
    problems.push(
      `intelligence: orders cost ${orders.counterIntel + covertIp} IP; you have ${p.reserves.intelligence}`,
    );
  }

  const main = orders.main;
  if (main.type === 'card')
    problems.push(
      ...rootCardProblems(ctx, state, player, main.card, main.target).map((m) => `main: ${m}`),
    );
  else if (main.type === 'proposal')
    problems.push(...proposalProblems(state, player, main).map((m) => `main: ${m}`));
  else if (main.type === 'operation') problems.push(...operationProblems(ctx, state, player, main));

  const sent = new Map<string, number>();
  for (const trade of orders.trades) {
    const key = trade.to;
    sent.set(key, (sent.get(key) ?? 0) + trade.amount);
    if (treatiesBetween(state, player, trade.to, 'trade').length === 0)
      problems.push(`trades: no trade agreement with ${trade.to}`);
    else if (
      modifierTotal(state, player, 'tradeBlocked') > 0 ||
      modifierTotal(state, trade.to, 'tradeBlocked') > 0
    )
      problems.push('trades: trade is blocked');
    if (trade.amount < 1 || (sent.get(key) ?? 0) > ctx.ruleset.tension.trade.maxPerPartner)
      problems.push(`trades: at most ${ctx.ruleset.tension.trade.maxPerPartner} per partner`);
    if (trade.amount > p.reserves[trade.resource])
      problems.push(`trades: not enough ${trade.resource}`);
  }
  for (const id of orders.leaveTreaties)
    problems.push(...leaveTreatyProblems(ctx, state, player, id));
  return problems;
}

function buildupSpike(ctx: MatchContext, asset: string): number {
  return ctx.ruleset.tension.buildupSpikes[asset] ?? 0;
}

function disarmamentDrop(ctx: MatchContext, asset: string): number {
  return mulPermille(buildupSpike(ctx, asset), ctx.ruleset.tension.disarmamentSpikePermille);
}

/** Applies every player's planning orders in player id order. */
export function resolvePlanning(ctx: MatchContext, state: GameState, events: EventSink): void {
  for (const player of state.playerIds) {
    const orders = state.planningOrders[player];
    const p = state.players[player];
    if (!orders || !p || !p.viable) continue;
    for (const order of orders.development) {
      p.reserves.production -= orderCost(ctx, state, order);
      applyDevelopment(ctx, state, events, player, order);
    }
    for (const load of orders.loads) {
      const inst = state.installations[load.installation];
      if (!inst) continue;
      p.stock[load.ammunition] = (p.stock[load.ammunition] ?? 0) - load.count;
      inst.loaded[load.ammunition] = (inst.loaded[load.ammunition] ?? 0) + load.count;
    }
    for (const move of orders.repositioning) {
      const stack = state.units[move.stack];
      if (stack && stack.count >= move.count) {
        stack.count -= move.count;
        addUnits(state, player, stack.kind, move.to, move.count);
        if (stack.count === 0) delete state.units[move.stack];
        events.push({
          type: 'UnitsMoved',
          visibility: 'public',
          player,
          kind: stack.kind,
          from: stack.location,
          to: move.to,
        });
      }
    }
    for (const [id, mode] of sortedEntries(orders.modes)) {
      const inst = state.installations[id];
      if (inst && inst.mode !== mode) inst.pendingMode = mode;
    }
    p.reserves.intelligence -= orders.counterIntel;
    p.counterIntel += orders.counterIntel;
    placeShadowMarkers(ctx, state, player, orders);
    for (const order of orders.development) {
      if ('covert' in order && order.covert) {
        const i = p.hand.indexOf('covert-program');
        if (i >= 0) state.deck.covertDiscard.push(...p.hand.splice(i, 1));
      }
    }
    if (orders.accusation) {
      resolveAccusation(
        ctx,
        state,
        events,
        player,
        orders.accusation.accused,
        orders.accusation.record,
      );
    }
    const tradePermille = devastationEffects(ctx, state.devastation).tradePermille;
    for (const trade of orders.trades) {
      const amount = Math.min(trade.amount, p.reserves[trade.resource]);
      p.reserves[trade.resource] -= amount;
      const partner = state.players[trade.to];
      if (partner) partner.reserves[trade.resource] += mulPermille(amount, tradePermille);
    }
    for (const id of orders.leaveTreaties) leaveTreaty(ctx, state, events, player, id);
  }
  // Main actions queue in initiative order; cards leave the hand now so they can't also be used as reactions.
  state.actionQueue = [];
  const n = state.playerIds.length;
  for (let k = 0; k < n; k++) {
    const player = state.playerIds[(state.initiative + k) % n]!;
    const orders = state.planningOrders[player];
    if (!orders || !state.players[player]?.viable) continue;
    if (orders.main.type === 'card') {
      const hand = state.players[player]!.hand;
      const index = hand.indexOf(orders.main.card);
      if (index >= 0) hand.splice(index, 1);
    }
    state.actionQueue.push({ player, action: structuredClone(orders.main) });
  }
  state.planningOrders = {};
}

function applyDevelopment(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  order: DevelopmentOrder,
): void {
  const p = state.players[player]!;
  switch (order.type) {
    case 'build': {
      const site = freeSite(state, order.territory);
      if (site === null) return;
      const inst = addInstallation(ctx, state, {
        kind: order.kind,
        owner: player,
        territory: order.territory,
        site,
        ...(order.mode !== undefined ? { mode: order.mode } : {}),
        hidden: order.covert === true,
      });
      events.push({
        type: 'InstallationBuilt',
        visibility: order.covert ? { players: [player] } : 'public',
        player,
        installation: inst.id,
        kind: order.kind,
        territory: order.territory,
      });
      if (!order.covert)
        changeTension(
          ctx,
          state,
          events,
          buildupSpike(ctx, order.kind),
          player,
          `${player} built ${order.kind}`,
        );
      return;
    }
    case 'upgrade': {
      const inst = state.installations[order.installation];
      if (inst) inst.upgraded = true;
      events.push({
        type: 'InstallationUpgraded',
        visibility: 'public',
        player,
        installation: order.installation,
      });
      return;
    }
    case 'repair': {
      const inst = state.installations[order.installation];
      if (!inst) return;
      inst.repairCompletesRound =
        state.round + (inst.condition === 'ruined' ? ctx.ruleset.economy.repair.rebuildUpkeeps : 1);
      events.push({
        type: 'RepairStarted',
        visibility: 'public',
        player,
        installation: inst.id,
        completesRound: inst.repairCompletesRound,
      });
      return;
    }
    case 'recruit': {
      addUnits(state, player, order.unit, order.location, 1, order.covert === true);
      const sea = ctx.ruleset.units.units[order.unit]?.domain === 'sea';
      events.push({
        type: 'UnitsRecruited',
        visibility: sea || order.covert ? { players: [player] } : 'public',
        player,
        unit: order.unit,
        location: order.location,
      });
      if (!order.covert)
        changeTension(
          ctx,
          state,
          events,
          buildupSpike(ctx, order.unit),
          player,
          `${player} deployed ${order.unit}`,
        );
      return;
    }
    case 'ammunition': {
      const ammo = ctx.ruleset.units.ammunition[order.kind];
      if (!ammo) return;
      const store = order.covert ? p.hiddenStock : p.stock;
      store[order.kind] = (store[order.kind] ?? 0) + ammo.quantity;
      events.push({
        type: 'AmmunitionProduced',
        visibility: { players: [player] },
        player,
        kind: order.kind,
        quantity: ammo.quantity,
      });
      if (!order.covert)
        changeTension(
          ctx,
          state,
          events,
          buildupSpike(ctx, order.kind),
          player,
          `${player} produced ${order.kind}`,
        );
      return;
    }
    case 'dismantle': {
      const inst = state.installations[order.installation];
      if (!inst) return;
      for (const [ammo, count] of sortedEntries(inst.loaded))
        p.stock[ammo] = (p.stock[ammo] ?? 0) + count;
      delete state.installations[inst.id];
      events.push({
        type: 'InstallationDismantled',
        visibility: 'public',
        player,
        installation: inst.id,
        kind: inst.kind,
      });
      changeTension(
        ctx,
        state,
        events,
        -disarmamentDrop(ctx, inst.kind),
        player,
        `${player} dismantled ${inst.kind}`,
      );
      return;
    }
    case 'disband': {
      const stack = state.units[order.stack];
      if (!stack) return;
      const count = Math.min(order.count, stack.count);
      stack.count -= count;
      if (stack.count === 0) delete state.units[order.stack];
      events.push({
        type: 'UnitsDisbanded',
        visibility: 'public',
        player,
        kind: stack.kind,
        amount: count,
      });
      changeTension(
        ctx,
        state,
        events,
        -disarmamentDrop(ctx, stack.kind) * count,
        player,
        `${player} disbanded ${stack.kind}`,
      );
      return;
    }
    case 'destroyAmmunition': {
      const count = Math.min(order.count, p.stock[order.kind] ?? 0);
      p.stock[order.kind] = (p.stock[order.kind] ?? 0) - count;
      events.push({
        type: 'AmmunitionDestroyed',
        visibility: 'public',
        player,
        kind: order.kind,
        amount: count,
      });
      changeTension(
        ctx,
        state,
        events,
        -disarmamentDrop(ctx, order.kind) * count,
        player,
        `${player} destroyed ${order.kind}`,
      );
      return;
    }
  }
}
