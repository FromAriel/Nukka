/**
 * The upkeep phase (Economy spec §7; Technical Architecture spec §7 step 1).
 * Runs at the start of every round after the first.
 */
import { sortedEntries } from '../collections.js';
import { ceilDiv, floorDiv } from '../fixed.js';
import { installationRules, type MatchContext } from './context.js';
import {
  installationsIn,
  isWorking,
  networks,
  outputOf,
  poweredInstallations,
  type Network,
} from './derived.js';
import type { EventSink } from './events.js';
import { drawCards } from './setup.js';
import { changeTension, settleTension } from './tension.js';
import type { GameState, PlayerId, Reserves } from './state.js';
import { eliminatePlayer } from './viability.js';
import { upkeepDiplomacy } from './diplomacy.js';
import { activeModifiers, expireModifiers, modifierTotal } from './modifiers.js';

export function runUpkeep(ctx: MatchContext, state: GameState, events: EventSink): void {
  const { economy } = ctx.ruleset;
  expireModifiers(state);
  upkeepDiplomacy(ctx, state, events);
  const powered = poweredInstallations(ctx, state);

  for (const player of state.playerIds) {
    const p = state.players[player]!;
    if (!p.viable) continue;
    const nets = networks(ctx, state, player);
    const owned = (net: Network) =>
      installationsIn(state, net.territories).filter((i) => i.owner === player);

    // Output.
    let freeCounterIntel = 0;
    const gained: Reserves = { production: 0, food: 0, water: 0, supplies: 0, intelligence: 0 };
    for (const net of nets) {
      const out = outputOf(ctx, state, owned(net), powered);
      gained.production += out.production;
      gained.supplies += out.supplies;
      gained.intelligence += out.intelligence;
      freeCounterIntel += out.counterIntel;
      feedNetwork(ctx, state, events, player, net, out.food, out.water, p.reserves);
    }
    gained.supplies += economy.government.supplies ?? 0;
    gained.intelligence += economy.government.intelligence ?? 0;
    gained.production += economy.government.production ?? 0;
    const exclaveCost = economy.exclaveProductionCost * Math.max(0, nets.length - 1);
    p.reserves.production = Math.max(0, p.reserves.production + gained.production - exclaveCost);
    p.reserves.supplies += gained.supplies;
    p.reserves.intelligence += gained.intelligence;
    p.counterIntel = freeCounterIntel;
    events.push({
      type: 'UpkeepIncome',
      visibility: { players: [player] },
      player,
      gained,
      exclaveCost,
    });

    // Resource drains from cards such as Sanctions and Trade Embargo.
    for (const drain of activeModifiers(state, player, 'drain')) {
      const resource = drain.data['resource'] as keyof Reserves;
      if (resource in p.reserves)
        p.reserves[resource] = Math.max(0, p.reserves[resource] - drain.amount);
    }

    if (modifierTotal(state, player, 'supplyUpkeepWaived') === 0)
      payMilitary(ctx, state, events, player, powered, nets[0]);
  }

  // Repairs and rebuilds that finish this round.
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.repairCompletesRound !== null && inst.repairCompletesRound <= state.round) {
      inst.repairCompletesRound = null;
      inst.condition = 'operational';
      events.push({ type: 'RepairCompleted', visibility: 'public', installation: inst.id });
    }
    if (inst.pendingMode !== null) {
      inst.mode = inst.pendingMode;
      inst.pendingMode = null;
    }
  }

  applyCaps(ctx, state, powered);

  // Timed map effects count down.
  for (const [, t] of sortedEntries(state.territories)) {
    if (t.contestedRounds > 0) t.contestedRounds--;
    if (t.contaminationRounds > 0) t.contaminationRounds--;
  }
  state.disruptedLanes = state.disruptedLanes.filter((lane) => lane.untilRound >= state.round);

  // Natural cooling and blame decay.
  settleTension(ctx, state);
  const cooling = ctx.ruleset.tension.cooling;
  const cool =
    state.lastCombat === 'nuclear'
      ? cooling.nuclear
      : state.lastCombat === 'conventional'
        ? cooling.conventionalOnly
        : cooling.noCombat;
  if (state.tension.release !== 'aftermath') {
    const room = state.tension.value - state.tension.floor;
    changeTension(ctx, state, events, -Math.min(cool, Math.max(0, room)), null, 'natural cooling');
  }
  state.lastCombat = 'none';
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    if (!p.blameGainedThisRound && p.blame > 0)
      p.blame = Math.max(0, p.blame - ctx.ruleset.tension.blame.decayPerQuietUpkeep);
    p.blameGainedThisRound = false;
  }

  // Viability.
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    if (p.viable && !hasPopulatedTerritory(state, id)) eliminatePlayer(ctx, state, events, id);
  }

  // Cards, reaction points, initiative.
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    if (!p.viable) continue;
    drawCards(state, id, ctx.ruleset.match.hand.drawPerRound);
    p.reactionPoints = ctx.ruleset.match.reactionPointsPerRound;
  }
  state.initiative = (state.initiative + 1) % state.playerIds.length;
  settleTension(ctx, state);
}

function hasPopulatedTerritory(state: GameState, player: PlayerId): boolean {
  return sortedEntries(state.territories).some(([, t]) => t.owner === player && t.population > 0);
}

/**
 * Feeds one network. The main network can draw on national reserves and
 * banks its surplus; a cut-off network lives on its own output and its
 * surplus is lost. Shortfalls make tokens hungry; a token hungry at two
 * upkeeps in a row is lost (Economy spec §7.3).
 */
function feedNetwork(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  net: Network,
  foodOut: number,
  waterOut: number,
  reserves: Reserves,
): void {
  const demand = ctx.ruleset.economy.populationDemand;
  const ts = net.territories.map((id) => state.territories[id]!).filter((t) => t.owner === player);
  const tokens = ts.reduce((sum, t) => sum + t.population, 0);
  const needFood = tokens * demand.food;
  const needWater = tokens * demand.water;
  const foodAvail = foodOut + (net.main ? reserves.food : 0);
  const waterAvail = waterOut + (net.main ? reserves.water : 0);
  if (net.main) {
    reserves.food = Math.max(0, foodAvail - needFood);
    reserves.water = Math.max(0, waterAvail - needWater);
  }
  const short = (avail: number, need: number, per: number) =>
    per === 0 || avail >= need ? 0 : ceilDiv(need - avail, per);
  const hungryNow = Math.min(
    tokens,
    Math.max(short(foodAvail, needFood, demand.food), short(waterAvail, needWater, demand.water)),
  );

  const previouslyHungry = ts.reduce((sum, t) => sum + t.hungry, 0);
  const fresh = tokens - previouslyHungry;
  let lost = Math.max(0, hungryNow - fresh);
  const stillHungry = hungryNow - lost;
  // Losses come from tokens that were already hungry, territory by territory.
  for (const id of net.territories) {
    const t = state.territories[id]!;
    if (t.owner !== player) continue;
    const dying = Math.min(lost, t.hungry);
    if (dying > 0) {
      t.population -= dying;
      lost -= dying;
      events.push({
        type: 'PopulationLost',
        visibility: 'public',
        territory: id,
        amount: dying,
        cause: 'starvation',
      });
    }
    t.hungry = 0;
  }
  let toMark = stillHungry;
  for (const id of net.territories) {
    const t = state.territories[id]!;
    if (t.owner !== player || toMark === 0) continue;
    const mark = Math.min(toMark, t.population);
    t.hungry = mark;
    toMark -= mark;
  }
  if (stillHungry > 0) {
    events.push({ type: 'PopulationHungry', visibility: 'public', player, amount: stillHungry });
  }
}

/** Pays supply upkeep: silos first, then unit stacks in id order; then refills magazines. */
function payMilitary(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  powered: ReadonlySet<string>,
  main: Network | undefined,
): void {
  const p = state.players[player]!;
  const { units } = ctx.ruleset.units;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner !== player || inst.condition === 'ruined') continue;
    const upkeep = installationRules(ctx, inst.kind).economy?.supplyUpkeep ?? 0;
    p.reserves.supplies = Math.max(0, p.reserves.supplies - upkeep);
  }
  for (const [id, stack] of sortedEntries(state.units)) {
    if (stack.owner !== player) continue;
    const per = units[stack.kind]?.supplyUpkeep ?? 0;
    if (per === 0) {
      stack.unsupplied = 0;
      continue;
    }
    const paid = Math.min(stack.count, floorDiv(p.reserves.supplies, per));
    p.reserves.supplies -= paid * per;
    const unpaid = stack.count - paid;
    const disband = Math.min(unpaid, stack.unsupplied);
    if (disband > 0) {
      stack.count -= disband;
      events.push({
        type: 'UnitsDisbanded',
        visibility: 'public',
        stack: id,
        kind: stack.kind,
        amount: disband,
      });
    }
    stack.unsupplied = unpaid - disband;
    if (stack.unsupplied > 0) {
      events.push({
        type: 'UnitsUnsupplied',
        visibility: { players: [player] },
        stack: id,
        amount: stack.unsupplied,
      });
    }
    if (stack.count === 0) delete state.units[id];
  }
  // Refill magazines in the main network.
  const mainSet = new Set(main?.territories ?? []);
  const refill = ctx.ruleset.defenses.refillSuppliesPerBattery;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner !== player || inst.magazine === null || !mainSet.has(inst.territory)) continue;
    const full = installationRules(ctx, inst.kind).magazine;
    if (full === null || inst.magazine >= full || !isWorking(inst, powered)) continue;
    if (p.reserves.supplies < refill) break;
    p.reserves.supplies -= refill;
    inst.magazine = full;
  }
}

function applyCaps(ctx: MatchContext, state: GameState, powered: ReadonlySet<string>): void {
  const caps = ctx.ruleset.economy.caps;
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    let depots = 0;
    for (const [, inst] of sortedEntries(state.installations)) {
      if (inst.owner === id && isWorking(inst, powered)) {
        depots += installationRules(ctx, inst.kind).economy?.supplyCapBonus ?? 0;
      }
    }
    p.reserves.production = Math.min(p.reserves.production, caps.production);
    p.reserves.food = Math.min(p.reserves.food, caps.food);
    p.reserves.water = Math.min(p.reserves.water, caps.water);
    p.reserves.supplies = Math.min(p.reserves.supplies, caps.supplies + depots);
    p.reserves.intelligence = Math.min(p.reserves.intelligence, caps.intelligence);
  }
}

/** Supply cap including depots, for previews. */
export function supplyCap(ctx: MatchContext, state: GameState, player: PlayerId): number {
  const powered = poweredInstallations(ctx, state);
  let bonus = 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner === player && isWorking(inst, powered))
      bonus += installationRules(ctx, inst.kind).economy?.supplyCapBonus ?? 0;
  }
  return ctx.ruleset.economy.caps.supplies + bonus;
}
