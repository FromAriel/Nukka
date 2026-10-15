import { z } from 'zod';
import { sortedEntries } from '../collections.js';
import { canonicalJson } from '../hash.js';
import { DataValidationError, formatIssues } from './ruleset.js';
import { feature, nonNeg, point, pos, terrain } from './common.js';

const id = z.string().regex(/^[A-Za-z0-9-]+$/);

export const territorySchema = z.strictObject({
  id,
  name: z.string().min(1),
  role: z.enum(['capital', 'port', 'uplands', 'heartland', 'frontier', 'lakeshore', 'territory']),
  terrain,
  homeOf: z.string().nullable(),
  population: nonNeg(),
  features: z.array(feature),
  sites: z.array(point).length(4),
  garrison: point,
  shape: z.array(point).min(3),
  land: z.array(id),
  sea: z.array(id),
  /** Starting installations, as "kind" or "kind:upgrade". */
  start: z.array(z.string().regex(/^[A-Za-z]+(:[A-Za-z]+)?$/)),
});
export type TerritoryDef = z.infer<typeof territorySchema>;

export const seaZoneSchema = z.strictObject({
  id,
  name: z.string().min(1),
  kind: z.enum(['ocean', 'inland']),
  adjacentSea: z.array(id),
  center: point,
  shape: z.array(point).min(3),
});
export type SeaZoneDef = z.infer<typeof seaZoneSchema>;

export const mapSchema = z.strictObject({
  id,
  name: z.string(),
  version: z.string(),
  size: z.tuple([pos(), pos()]),
  homes: z.array(z.string()).min(2),
  territories: z.array(territorySchema).min(1),
  seaZones: z.array(seaZoneSchema),
  playerCounts: z.record(
    z.string().regex(/^\d+$/),
    z.strictObject({ homes: z.array(z.string()).min(1) }),
  ),
});
export type MapDef = z.infer<typeof mapSchema>;

/** Parses a map and runs the structural checks from the Map Structure spec §9. */
export function parseMap(
  raw: unknown,
  source = 'map',
  knownInstallations?: ReadonlySet<string>,
): MapDef {
  const result = mapSchema.safeParse(raw);
  if (!result.success) throw new DataValidationError(source, formatIssues(result.error));
  const problems = validateMap(result.data, knownInstallations);
  if (problems.length > 0) throw new DataValidationError(source, problems);
  return result.data;
}

export function validateMap(map: MapDef, knownInstallations?: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const territories = new Map(map.territories.map((t) => [t.id, t]));
  const seas = new Map(map.seaZones.map((s) => [s.id, s]));

  if (territories.size !== map.territories.length) problems.push('duplicate territory ids');
  if (seas.size !== map.seaZones.length) problems.push('duplicate sea zone ids');
  for (const tid of territories.keys()) {
    if (seas.has(tid)) problems.push(`id "${tid}" is used by both a territory and a sea zone`);
  }

  const [width, height] = map.size;
  const inBounds = ([x, y]: readonly [number, number]) =>
    x >= 0 && y >= 0 && x <= width && y <= height;

  // Connections exist and are listed on both sides.
  for (const t of map.territories) {
    for (const other of t.land) {
      const target = territories.get(other);
      if (!target) problems.push(`${t.id}: unknown land neighbour "${other}"`);
      else if (!target.land.includes(t.id))
        problems.push(`${t.id} -> ${other}: land link is one-sided`);
      if (other === t.id) problems.push(`${t.id}: borders itself`);
    }
    for (const zone of t.sea) {
      if (!seas.has(zone)) problems.push(`${t.id}: unknown sea zone "${zone}"`);
    }
    if (t.homeOf !== null && !map.homes.includes(t.homeOf))
      problems.push(`${t.id}: unknown home "${t.homeOf}"`);
    for (const p of [...t.sites, t.garrison, ...t.shape]) {
      if (!inBounds(p)) problems.push(`${t.id}: point ${p.join(',')} is outside the map`);
    }
    if (knownInstallations) {
      for (const entry of t.start) {
        const [kind = ''] = entry.split(':');
        if (!knownInstallations.has(kind))
          problems.push(`${t.id}: unknown starting installation "${entry}"`);
      }
    }
  }
  for (const s of map.seaZones) {
    for (const other of s.adjacentSea) {
      const target = seas.get(other);
      if (!target) problems.push(`${s.id}: unknown adjacent sea "${other}"`);
      else if (!target.adjacentSea.includes(s.id))
        problems.push(`${s.id} -> ${other}: sea link is one-sided`);
    }
    const coast = map.territories.filter((t) => t.sea.includes(s.id));
    if (coast.length === 0) problems.push(`${s.id}: no coastal territory`);
  }

  // Homes are identical in what they offer (fair test map).
  const signature = (home: string) => {
    const owned = map.territories.filter((t) => t.homeOf === home);
    const features = owned.flatMap((t) => t.features).sort();
    const start = owned.flatMap((t) => t.start).sort();
    const terrains = owned.map((t) => t.terrain).sort();
    const coastCount = owned.reduce((sum, t) => sum + t.sea.length, 0);
    const population = owned.reduce((sum, t) => sum + t.population, 0);
    return canonicalJson({
      count: owned.length,
      features,
      start,
      terrains,
      coastCount,
      population,
    });
  };
  const first = map.homes[0];
  if (first !== undefined) {
    const expected = signature(first);
    for (const home of map.homes.slice(1)) {
      if (signature(home) !== expected) problems.push(`home ${home} differs from home ${first}`);
    }
  }

  // Player-count setups only name real homes.
  for (const [count, setup] of sortedEntries(map.playerCounts)) {
    if (setup.homes.length !== Number(count))
      problems.push(`playerCounts.${count}: wrong number of homes`);
    for (const home of setup.homes) {
      if (!map.homes.includes(home)) problems.push(`playerCounts.${count}: unknown home "${home}"`);
    }
  }

  // Everything is reachable from everything (land and sea together).
  const graph = new Map<string, string[]>();
  for (const t of map.territories) graph.set(t.id, [...t.land, ...t.sea]);
  for (const s of map.seaZones) {
    graph.set(s.id, [
      ...s.adjacentSea,
      ...map.territories.filter((t) => t.sea.includes(s.id)).map((t) => t.id),
    ]);
  }
  const start = map.territories[0]?.id;
  if (start !== undefined) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const next = queue.shift() as string;
      for (const n of graph.get(next) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    for (const node of graph.keys()) {
      if (!seen.has(node)) problems.push(`${node} cannot be reached from ${start}`);
    }
  }
  return problems;
}
