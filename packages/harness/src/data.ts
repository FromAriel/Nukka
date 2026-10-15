import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RULESET_FILES,
  applyPatches,
  parseDeck,
  parseMap,
  parseRuleset,
  type DeckDef,
  type MapDef,
  type Ruleset,
  type RulesetFiles,
  type TuningPatch,
} from '@nukka/core';

/** Repository root, resolved from this file's location. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = join(REPO_ROOT, 'data');

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not read ${path}: ${(error as Error).message}`, { cause: error });
  }
}

export function rulesetDir(id: string): string {
  return join(DATA_DIR, 'rulesets', id);
}

/** Loads and validates a ruleset folder, e.g. `base-0.1`. */
export function loadRuleset(id: string): Ruleset {
  const dir = rulesetDir(id);
  const files = Object.fromEntries(
    RULESET_FILES.map((name) => [name, readJson(join(dir, `${name}.json`))]),
  ) as RulesetFiles;
  return parseRuleset(files, `ruleset ${id}`);
}

export function loadPatch(path: string): TuningPatch {
  const raw = readJson(path) as { id?: unknown; changes?: unknown };
  if (typeof raw.id !== 'string' || typeof raw.changes !== 'object' || raw.changes === null) {
    throw new Error(`${path}: a patch needs a string "id" and an object "changes"`);
  }
  return { id: raw.id, changes: raw.changes as Record<string, unknown> };
}

export function loadEffectiveRuleset(id: string, patchPaths: readonly string[] = []): Ruleset {
  const base = loadRuleset(id);
  return patchPaths.length === 0 ? base : applyPatches(base, patchPaths.map(loadPatch));
}

export function mapPath(id: string): string {
  return join(DATA_DIR, 'maps', `${id}.json`);
}

export function loadMap(id: string, ruleset?: Ruleset): MapDef {
  const known = ruleset
    ? new Set(Object.getOwnPropertyNames(ruleset.economy.installations))
    : undefined;
  return parseMap(readJson(mapPath(id)), `map ${id}`, known);
}

export function loadDeck(id: string): DeckDef {
  return parseDeck(readJson(join(DATA_DIR, 'cards', `${id}.json`)), `deck ${id}`);
}

export function listRulesets(): string[] {
  return readdirSync(join(DATA_DIR, 'rulesets')).sort();
}
