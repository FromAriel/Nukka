import { sortedIds } from '../collections.js';
import type { DeckDef } from '../data/cards.js';
import type { MapDef, SeaZoneDef, TerritoryDef } from '../data/map.js';
import type { InstallationRules, Ruleset } from '../data/ruleset.js';
import type { ScenarioDef } from '../data/scenario.js';
import type { CombatResolver } from './combat-interface.js';

/** Static, read-only match data shared by every engine step. Never part of GameState. */
export interface MatchContext {
  readonly ruleset: Ruleset;
  readonly map: MapDef;
  readonly deck: DeckDef;
  readonly scenario: ScenarioDef;
  readonly territories: ReadonlyMap<string, TerritoryDef>;
  readonly seaZones: ReadonlyMap<string, SeaZoneDef>;
  readonly territoryIds: readonly string[];
  /** Resolves combat windows; supplied by the harness or client (Technical Architecture spec §12). */
  readonly combat: CombatResolver | null;
}

export function createContext(
  ruleset: Ruleset,
  map: MapDef,
  deck: DeckDef,
  scenario: ScenarioDef,
  combat: CombatResolver | null = null,
): MatchContext {
  return {
    ruleset,
    map,
    deck,
    scenario,
    territories: new Map(map.territories.map((t) => [t.id, t])),
    seaZones: new Map(map.seaZones.map((s) => [s.id, s])),
    territoryIds: sortedIds(map.territories.map((t) => t.id)),
    combat,
  };
}

/** Rules for any installation kind, whether civilian/infrastructure or a defense battery. */
export interface AnyInstallationRules {
  readonly cost: number;
  readonly powerDraw: number;
  readonly powerSupply: number;
  readonly civilian: boolean;
  readonly hardened: boolean;
  readonly magazine: number | null;
  readonly economy: InstallationRules | null;
}

export function installationRules(ctx: MatchContext, kind: string): AnyInstallationRules {
  const economy = ctx.ruleset.economy.installations[kind];
  if (economy) {
    return {
      cost: economy.cost,
      powerDraw: economy.powerDraw,
      powerSupply: economy.powerSupply ?? 0,
      civilian: economy.civilian,
      hardened: economy.hardened,
      magazine: null,
      economy,
    };
  }
  const defense = ctx.ruleset.defenses.defenses[kind];
  if (defense) {
    return {
      cost: defense.cost,
      powerDraw: defense.powerDraw,
      powerSupply: 0,
      civilian: false,
      hardened: false,
      magazine: defense.magazine,
      economy: null,
    };
  }
  throw new Error(`unknown installation kind "${kind}"`);
}

export function territoryDef(ctx: MatchContext, id: string): TerritoryDef {
  const def = ctx.territories.get(id);
  if (!def) throw new Error(`unknown territory "${id}"`);
  return def;
}
