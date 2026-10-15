/** Scoring (main design §1, Economy spec §8, Tension spec §4.1). */
import { sortedEntries } from '../collections.js';
import { floorDiv } from '../fixed.js';
import type { MatchContext } from './context.js';
import { installationsIn, networks, outputOf, poweredInstallations } from './derived.js';
import type { GameState, PlayerId } from './state.js';

export interface ScoreBreakdown {
  supportedPopulation: number;
  civilianInstallations: number;
  nonStartingTerritories: number;
  peaceBrokerTokens: number;
  infamyPenalty: number;
  total: number;
}

/**
 * A token is supported when it isn't hungry and its network's output plus
 * reserves (main network only) cover the network's needs for the forecast
 * period.
 */
export function supportedPopulation(ctx: MatchContext, state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p || !p.viable) return 0;
  const powered = poweredInstallations(ctx, state);
  const horizon = ctx.ruleset.economy.supportedForecastUpkeeps;
  const demand = ctx.ruleset.economy.populationDemand;
  let supported = 0;
  for (const net of networks(ctx, state, player)) {
    const out = outputOf(
      ctx,
      state,
      installationsIn(state, net.territories).filter((i) => i.owner === player),
      powered,
    );
    const tokens = net.territories.reduce((sum, id) => sum + state.territories[id]!.population, 0);
    const fed = net.territories.reduce(
      (sum, id) => sum + state.territories[id]!.population - state.territories[id]!.hungry,
      0,
    );
    const foodPool = out.food * horizon + (net.main ? p.reserves.food : 0);
    const waterPool = out.water * horizon + (net.main ? p.reserves.water : 0);
    const coverable = (pool: number, per: number) =>
      per === 0 ? tokens : floorDiv(pool, per * horizon);
    supported += Math.min(
      fed,
      coverable(foodPool, demand.food),
      coverable(waterPool, demand.water),
    );
  }
  return supported;
}

export function scoreFor(ctx: MatchContext, state: GameState, player: PlayerId): ScoreBreakdown {
  const s = ctx.ruleset.scoring;
  const p = state.players[player];
  if (!p || !p.viable) {
    return {
      supportedPopulation: 0,
      civilianInstallations: 0,
      nonStartingTerritories: 0,
      peaceBrokerTokens: 0,
      infamyPenalty: 0,
      total: 0,
    };
  }
  const civilianKinds = new Set(s.civilianInstallationKinds);
  let civilian = 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner === player && civilianKinds.has(inst.kind) && inst.condition !== 'ruined')
      civilian++;
  }
  let nonStarting = 0;
  for (const [, t] of sortedEntries(state.territories)) {
    if (t.owner === player && t.startingOwner !== player) nonStarting++;
  }
  const supported = supportedPopulation(ctx, state, player);
  const infamyPenalty = floorDiv(p.infamy, s.infamyPenaltyEvery);
  const parts = {
    supportedPopulation: supported * s.supportedPopulation,
    civilianInstallations: civilian * s.civilianInstallation,
    nonStartingTerritories: nonStarting * s.nonStartingTerritory,
    peaceBrokerTokens: p.peaceBrokerTokens * s.peaceBrokerToken,
    infamyPenalty,
  };
  return {
    ...parts,
    total:
      parts.supportedPopulation +
      parts.civilianInstallations +
      parts.nonStartingTerritories +
      parts.peaceBrokerTokens -
      infamyPenalty,
  };
}
