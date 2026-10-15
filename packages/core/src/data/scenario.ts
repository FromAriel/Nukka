import { z } from 'zod';
import { sortedEntries } from '../collections.js';
import { nonNeg } from './common.js';
import type { MapDef } from './map.js';
import { DataValidationError, formatIssues, type Ruleset } from './ruleset.js';

const placedInstallation = z.strictObject({
  kind: z.string(),
  upgraded: z.boolean().optional(),
  /** Weapons loaded at start, e.g. { "warheads": 2 } in a silo. */
  loaded: z.partialRecord(z.string(), nonNeg()).optional(),
});

const homeSlot = z.strictObject({
  installations: z.array(placedInstallation).optional(),
  units: z.record(z.string(), nonNeg()).optional(),
});

export const scenarioSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string(),
  /** Extra starting military per home, keyed by territory role. Map `start` entries still apply. */
  homes: z.record(z.string(), homeSlot),
  /** Extra stockpiled ammunition per player. */
  stock: z.record(z.string(), nonNeg()),
});
export type ScenarioDef = z.infer<typeof scenarioSchema>;

export function parseScenario(
  raw: unknown,
  ruleset: Ruleset,
  map: MapDef,
  source = 'scenario',
): ScenarioDef {
  const result = scenarioSchema.safeParse(raw);
  if (!result.success) throw new DataValidationError(source, formatIssues(result.error));
  const scenario = result.data;
  const problems: string[] = [];
  const roles = new Set(map.territories.filter((t) => t.homeOf !== null).map((t) => t.role));
  const isInstallation = (k: string) =>
    k in ruleset.economy.installations || k in ruleset.defenses.defenses;
  for (const [role, slot] of sortedEntries(scenario.homes)) {
    if (!roles.has(role as never)) problems.push(`homes.${role}: no home territory has this role`);
    for (const placed of slot.installations ?? []) {
      if (!isInstallation(placed.kind))
        problems.push(`homes.${role}: unknown installation "${placed.kind}"`);
      for (const [ammo] of sortedEntries(placed.loaded ?? {})) {
        if (!(ammo in ruleset.units.ammunition))
          problems.push(`homes.${role}: unknown ammunition "${ammo}"`);
      }
    }
    for (const [unit] of sortedEntries(slot.units ?? {})) {
      if (!(unit in ruleset.units.units)) problems.push(`homes.${role}: unknown unit "${unit}"`);
    }
    const sites =
      (map.territories.find((t) => t.role === role && t.homeOf !== null)?.start.length ?? 0) +
      (slot.installations?.length ?? 0);
    if (sites > 4) problems.push(`homes.${role}: ${sites} installations but only 4 sites`);
  }
  for (const [ammo] of sortedEntries(scenario.stock)) {
    if (!(ammo in ruleset.units.ammunition)) problems.push(`stock: unknown ammunition "${ammo}"`);
  }
  if (problems.length > 0) throw new DataValidationError(source, problems);
  return scenario;
}
