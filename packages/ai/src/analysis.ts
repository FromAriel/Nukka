/** Read-only helpers that answer questions about a player's view. */
import {
  installationRules,
  sortedEntries,
  territoryDef,
  type MatchContext,
  type PlayerId,
  type PlayerView,
  type ViewInstallation,
  type ViewUnit,
} from '@nukka/core';

export const SITES = 4;

export function myTerritories(view: PlayerView): string[] {
  return sortedEntries(view.territories)
    .filter(([, t]) => t.owner === view.you)
    .map(([id]) => id);
}

export function installationsIn(view: PlayerView, territory: string): ViewInstallation[] {
  return sortedEntries(view.installations)
    .map(([, i]) => i)
    .filter((i) => i.territory === territory);
}

export function myInstallations(view: PlayerView, kind?: string): ViewInstallation[] {
  return sortedEntries(view.installations)
    .map(([, i]) => i)
    .filter((i) => i.owner === view.you && (kind === undefined || i.kind === kind));
}

export function freeSites(view: PlayerView, territory: string): number[] {
  const used = new Set(installationsIn(view, territory).map((i) => i.site));
  const free: number[] = [];
  for (let s = 0; s < SITES; s++) if (!used.has(s)) free.push(s);
  return free;
}

export function myUnits(view: PlayerView, kind?: string): ViewUnit[] {
  return sortedEntries(view.units)
    .map(([, u]) => u)
    .filter((u) => u.owner === view.you && (kind === undefined || u.kind === kind));
}

export function unitCount(view: PlayerView, kind: string): number {
  return myUnits(view, kind).reduce((s, u) => s + (u.count ?? 0), 0);
}

/** Power supply minus draw across all of a player's working installations (ignores grid splits). */
export function powerSpare(ctx: MatchContext, view: PlayerView): number {
  let spare = 0;
  for (const inst of myInstallations(view)) {
    if (inst.condition === 'ruined') continue;
    const rules = installationRules(ctx, inst.kind);
    spare += inst.condition === 'impaired' ? Math.floor(rules.powerSupply / 2) : rules.powerSupply;
    spare -= rules.powerDraw;
  }
  return spare;
}

export function population(view: PlayerView): number {
  return myTerritories(view).reduce((s, id) => s + (view.territories[id]?.population ?? 0), 0);
}

/** Expected food and water output from working farms and waterworks. */
export function foodWater(ctx: MatchContext, view: PlayerView): { food: number; water: number } {
  let food = 0;
  let water = 0;
  for (const inst of myInstallations(view)) {
    if (inst.condition === 'ruined' || inst.repairCompletesRound !== null) continue;
    const rules = installationRules(ctx, inst.kind).economy;
    const out = inst.upgraded && rules?.upgrade ? rules.upgrade.output : rules?.output;
    const half = inst.condition === 'impaired';
    food += half ? Math.floor((out?.food ?? 0) / 2) : (out?.food ?? 0);
    water += half ? Math.floor((out?.water ?? 0) / 2) : (out?.water ?? 0);
  }
  return { food, water };
}

export function supplyUpkeep(ctx: MatchContext, view: PlayerView): number {
  let total = 0;
  for (const u of myUnits(view))
    total += (ctx.ruleset.units.units[u.kind]?.supplyUpkeep ?? 0) * (u.count ?? 0);
  for (const i of myInstallations(view))
    total += installationRules(ctx, i.kind).economy?.supplyUpkeep ?? 0;
  return total;
}

export function neighbours(ctx: MatchContext, territory: string): readonly string[] {
  return territoryDef(ctx, territory).land;
}

export function rivals(view: PlayerView): PlayerId[] {
  return view.playerIds.filter((id) => id !== view.you && view.players[id]?.viable);
}

export function relation(view: PlayerView, other: PlayerId): 'peace' | 'hostile' | 'war' {
  const key = view.you < other ? `${view.you}|${other}` : `${other}|${view.you}`;
  return view.relations[key] ?? 'peace';
}

export function hostility(view: PlayerView, from: PlayerId, toward: PlayerId): number {
  return view.hostility[`${from}>${toward}`] ?? 0;
}

export function capitalOf(ctx: MatchContext, player: PlayerId): string | null {
  return ctx.map.territories.find((t) => t.homeOf === player && t.role === 'capital')?.id ?? null;
}

export function hasTreaty(view: PlayerView, other: PlayerId, kind: string): boolean {
  return view.treaties.some(
    (t) => t.kind === kind && t.parties.includes(view.you) && t.parties.includes(other),
  );
}

export function inCooldown(view: PlayerView, other: PlayerId): boolean {
  const [a, b] = view.you < other ? [view.you, other] : [other, view.you];
  return view.cooldowns.some((c) => c.a === a && c.b === b && c.untilRound >= view.round);
}

/** The rival this player resents most, breaking ties toward the current score leader's neighbours deterministically. */
export function topRival(view: PlayerView): PlayerId | null {
  const options = rivals(view);
  if (options.length === 0) return null;
  return [...options].sort(
    (a, b) => hostility(view, view.you, b) - hostility(view, view.you, a) || (a < b ? -1 : 1),
  )[0]!;
}

export function handHas(view: PlayerView, card: string): boolean {
  return view.me.hand.includes(card);
}
