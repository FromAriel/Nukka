/**
 * Values computed from state rather than stored: supply networks, power,
 * output, posture and the tension floor (Economy spec §7, Tension spec §2).
 */
import { sortedEntries, sortedIds } from '../collections.js';
import { floorDiv, mulPermille } from '../fixed.js';
import { installationRules, territoryDef, type MatchContext } from './context.js';
import type { GameState, Installation, PlayerId } from './state.js';

export interface Network {
  /** Territory ids, sorted. */
  readonly territories: readonly string[];
  /** The largest network is the main one; only it can draw national reserves. */
  readonly main: boolean;
}

function laneDisrupted(state: GameState, a: string, b: string): boolean {
  const [x, y] = a < b ? [a, b] : [b, a];
  return state.disruptedLanes.some(
    (lane) => lane.a === x && lane.b === y && lane.untilRound >= state.round,
  );
}

/** A player's supply networks: owned territories connected over land, excluding contested ones. */
export function networks(ctx: MatchContext, state: GameState, player: PlayerId): Network[] {
  const owned = ctx.territoryIds.filter((id) => state.territories[id]?.owner === player);
  const ownedSet = new Set(owned);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const start of owned) {
    if (seen.has(start)) continue;
    seen.add(start);
    const group = [start];
    if ((state.territories[start]?.contestedRounds ?? 0) === 0) {
      const queue = [start];
      while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const next of territoryDef(ctx, current).land) {
          if (seen.has(next) || !ownedSet.has(next)) continue;
          if ((state.territories[next]?.contestedRounds ?? 0) > 0) continue;
          if (laneDisrupted(state, current, next)) continue;
          seen.add(next);
          group.push(next);
          queue.push(next);
        }
      }
    }
    groups.push(sortedIds(group));
  }
  groups.sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : 1));
  return groups.map((territories, i) => ({ territories, main: i === 0 }));
}

export function installationsIn(state: GameState, territories: readonly string[]): Installation[] {
  const set = new Set(territories);
  return sortedEntries(state.installations)
    .map(([, inst]) => inst)
    .filter((inst) => set.has(inst.territory));
}

/** Ids of installations that have power this round, grid by grid, in priority order. */
export function poweredInstallations(ctx: MatchContext, state: GameState): Set<string> {
  const powered = new Set<string>();
  const disabled = disabledInstallations(state);
  const priority = ctx.ruleset.economy.powerPriority;
  const rank = (kind: string) => {
    const i = priority.indexOf(kind);
    return i < 0 ? priority.length : i;
  };
  for (const player of state.playerIds) {
    for (const network of networks(ctx, state, player)) {
      const insts = installationsIn(state, network.territories).filter((i) => i.owner === player);
      let capacity = 0;
      for (const inst of insts) {
        if (
          inst.condition === 'ruined' ||
          inst.repairCompletesRound !== null ||
          disabled.has(inst.id)
        )
          continue;
        const supply = installationRules(ctx, inst.kind).powerSupply;
        capacity += inst.condition === 'impaired' ? floorDiv(supply, 2) : supply;
      }
      const consumers = insts
        .filter(
          (i) => i.condition !== 'ruined' && i.repairCompletesRound === null && !disabled.has(i.id),
        )
        .sort((a, b) => rank(a.kind) - rank(b.kind) || (a.id < b.id ? -1 : 1));
      for (const inst of consumers) {
        const draw = installationRules(ctx, inst.kind).powerDraw;
        if (draw === 0) {
          powered.add(inst.id);
        } else if (draw <= capacity) {
          capacity -= draw;
          powered.add(inst.id);
        }
      }
    }
  }
  return powered;
}

/** Installations disabled this round (for example by Sabotage Crew). */
export function disabledInstallations(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const m of state.modifiers) {
    if (m.stat === 'disabled' && m.fromRound <= state.round && state.round <= m.untilRound)
      ids.add(String(m.data['installation']));
  }
  return ids;
}

/** Whether an installation is working: not ruined, not under repair, and powered if it needs power. */
export function isWorking(inst: Installation, powered: ReadonlySet<string>): boolean {
  return inst.condition !== 'ruined' && inst.repairCompletesRound === null && powered.has(inst.id);
}

export interface Output {
  production: number;
  food: number;
  water: number;
  supplies: number;
  intelligence: number;
  counterIntel: number;
}

const zeroOutput = (): Output => ({
  production: 0,
  food: 0,
  water: 0,
  supplies: 0,
  intelligence: 0,
  counterIntel: 0,
});

/** What a set of installations produces at upkeep, after impairment, contamination and devastation. */
export function outputOf(
  ctx: MatchContext,
  state: GameState,
  insts: readonly Installation[],
  powered: ReadonlySet<string>,
): Output {
  const out = zeroOutput();
  const devastation = devastationEffects(ctx, state.devastation);
  for (const inst of insts) {
    if (!isWorking(inst, powered)) continue;
    const rules = installationRules(ctx, inst.kind).economy;
    if (!rules) continue;
    const base =
      rules.modes && inst.mode
        ? rules.modes[inst.mode]
        : inst.upgraded && rules.upgrade
          ? rules.upgrade.output
          : rules.output;
    if (!base) continue;
    const territory = state.territories[inst.territory];
    const def = territoryDef(ctx, inst.territory);
    const contaminated = (territory?.contaminationRounds ?? 0) > 0;
    const apply = (amount: number) =>
      inst.condition === 'impaired' ? floorDiv(amount, 2) : amount;
    let production = base.production ?? 0;
    let supplies = base.supplies ?? 0;
    for (const [feature, bonus] of sortedEntries(rules.featureBonus ?? {})) {
      if (def.features.includes(feature)) {
        if (production > 0) production += bonus;
        if (supplies > 0) supplies += bonus;
      }
    }
    let food = base.food ?? 0;
    let water = base.water ?? 0;
    if (inst.kind === 'farm' && food > 0) food = Math.max(0, food + devastation.farmFood);
    if (inst.kind === 'waterworks' && water > 0)
      water = Math.max(0, water + devastation.waterworksWater);
    if (contaminated) {
      const permille = ctx.ruleset.combat.nuclearEffects.contaminationOutputPermille;
      food = mulPermille(food, permille);
      water = mulPermille(water, permille);
    }
    out.production += apply(production);
    out.supplies += apply(supplies);
    out.food += apply(food);
    out.water += apply(water);
    out.intelligence += apply(base.intelligence ?? 0);
    out.counterIntel += apply((base as { counterIntel?: number }).counterIntel ?? 0);
  }
  return out;
}

export function devastationEffects(ctx: MatchContext, devastation: number) {
  let farmFood = 0;
  let waterworksWater = 0;
  let tradePermille = 1000;
  for (const level of ctx.ruleset.combat.devastation) {
    if (devastation >= level.at) {
      farmFood = level.farmFood;
      waterworksWater = level.waterworksWater;
      tradePermille = level.tradePermille;
    }
  }
  return { farmFood, waterworksWater, tradePermille };
}

/** Population living in a set of territories (owned by the player). */
export function populationIn(state: GameState, territories: readonly string[]): number {
  return territories.reduce((sum, id) => sum + (state.territories[id]?.population ?? 0), 0);
}

// ------------------------------------------------------------ posture

/** A player's public nuclear posture points (Tension spec §2.2); hidden Covert Program builds don't count. */
export function posturePoints(ctx: MatchContext, state: GameState, player: PlayerId): number {
  const pp = ctx.ruleset.tension.posturePoints;
  let total = 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner !== player || inst.condition === 'ruined' || inst.hidden) continue;
    total += pp[inst.kind] ?? 0;
    for (const [ammo, count] of sortedEntries(inst.loaded)) total += (pp[ammo] ?? 0) * count;
  }
  for (const [, unit] of sortedEntries(state.units)) {
    if (unit.owner === player && !unit.hidden) total += (pp[unit.kind] ?? 0) * unit.count;
  }
  for (const [ammo, count] of sortedEntries(state.players[player]?.stock ?? {}))
    total += (pp[ammo] ?? 0) * count;
  return total;
}

export function postureBand(ctx: MatchContext, points: number): string {
  let band = ctx.ruleset.tension.postureBands[0]?.name ?? 'low';
  for (const b of ctx.ruleset.tension.postureBands) if (points >= b.min) band = b.name;
  return band;
}

/** Floor = world posture ÷ starting players, rounded down, capped. */
export function tensionFloor(ctx: MatchContext, state: GameState): number {
  const world = state.playerIds.reduce((sum, id) => sum + posturePoints(ctx, state, id), 0);
  return Math.min(ctx.ruleset.tension.floorCap, floorDiv(world, state.playerIds.length));
}
