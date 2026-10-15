#!/usr/bin/env -S npx tsx
/**
 * nukka-sim: headless bot matches (Technical Architecture spec §14).
 *
 *   pnpm sim --matches 100 --bots builder,expansionist,defender,brinkman --seed 1 --out results/run-001
 *   pnpm sim --matches 50 --sweep tension.floorCap=75,90
 *   pnpm smoke
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyPatches, expandDeck, rulesetHash, type Ruleset, type TuningPatch } from '@nukka/core';
import {
  loadDeck,
  loadMap,
  loadPatch,
  loadPersonality,
  loadRuleset,
  loadScenario,
} from './data.js';
import { runMatch, summarize, type MatchRecord } from './runner.js';
import { runSmoke } from './smoke.js';

interface Options {
  ruleset: string;
  patches: string[];
  map: string;
  scenario: string;
  bots: string[];
  players: number;
  matches: number;
  seed: number;
  out: string | null;
  sweep: { key: string; values: number[] } | null;
  smoke: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    ruleset: 'base-0.1',
    patches: [],
    map: 'basin-4p',
    scenario: 'cold-start',
    bots: ['builder', 'expansionist', 'defender', 'brinkman'],
    players: 4,
    matches: 20,
    seed: 1,
    out: null,
    sweep: null,
    smoke: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--':
        break; // pnpm passes a bare separator through
      case '--ruleset':
        options.ruleset = value();
        break;
      case '--patch':
        options.patches.push(resolve(value()));
        break;
      case '--map':
        options.map = value();
        break;
      case '--scenario':
        options.scenario = value();
        break;
      case '--bots':
        options.bots = value().split(',');
        break;
      case '--players':
        options.players = Number(value());
        break;
      case '--matches':
        options.matches = Number(value());
        break;
      case '--seed':
        options.seed = Number(value());
        break;
      case '--out':
        options.out = resolve(value());
        break;
      case '--sweep': {
        const [key, list] = value().split('=');
        if (!key || !list) throw new Error('--sweep expects key=v1,v2');
        options.sweep = { key, values: list.split(',').map(Number) };
        break;
      }
      case '--smoke':
        options.smoke = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      default:
        throw new Error(`unknown option ${arg}`);
    }
  }
  return options;
}

/** Turns "a.b.c" = v into { a: { b: { c: v } } }. */
function patchFor(key: string, value: number): TuningPatch {
  const parts = key.split('.');
  const changes: Record<string, unknown> = {};
  let node = changes;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) node[part] = value;
    else node = (node[part] = {}) as Record<string, unknown>;
  });
  return { id: `${key}=${value}`, changes };
}

function runBatch(options: Options, ruleset: Ruleset, label: string): MatchRecord[] {
  const map = loadMap(options.map, ruleset);
  const deck = loadDeck('base-0.1');
  const scenario = loadScenario(options.scenario, ruleset, map);
  const personalities = options.bots.map(loadPersonality);
  const records: MatchRecord[] = [];
  for (let m = 0; m < options.matches; m++) {
    // Rotate personalities through the seats so none always plays the same home or opponents.
    const seats = Array.from(
      { length: options.players },
      (_, i) => personalities[(i + m) % personalities.length]!,
    );
    const record = runMatch({
      ruleset,
      map,
      deck,
      scenario,
      seats,
      seed: options.seed + m,
      matchId: `${label}-${m}`,
    });
    records.push(record);
    if (!options.quiet) {
      process.stdout.write(`\r${label}: ${m + 1}/${options.matches} matches`);
    }
  }
  if (!options.quiet) process.stdout.write('\n');
  return records;
}

function report(label: string, records: MatchRecord[], out: string | null): void {
  const summary = summarize(records);
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(summary, null, 2));
  if (out) {
    mkdirSync(out, { recursive: true });
    const file = label.replace(/[^a-z0-9.=-]/gi, '_');
    writeFileSync(
      join(out, `${file}.matches.jsonl`),
      records.map(({ log: _log, ...r }) => JSON.stringify(r)).join('\n') + '\n',
    );
    mkdirSync(join(out, 'logs'), { recursive: true });
    for (const r of records)
      if (r.log) writeFileSync(join(out, 'logs', `${r.matchId}.json`), JSON.stringify(r.log));
    writeFileSync(join(out, `${file}.summary.json`), JSON.stringify(summary, null, 2) + '\n');
    console.log(`wrote ${join(out, file)}.*`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.smoke) {
    const result = runSmoke();
    const ruleset = loadRuleset('base-0.1');
    const map = loadMap('basin-4p', ruleset);
    const deck = loadDeck('base-0.1');
    console.log(`smoke ok: ${result.checks} check(s), hash ${result.hash}`);
    console.log(
      `data ok: ruleset base-0.1 (${rulesetHash(ruleset)}), map ${map.id} (${map.territories.length} territories, ` +
        `${map.seaZones.length} sea zones), deck ${deck.id} (${deck.cards.length} designs, ${expandDeck(deck).length} cards)`,
    );
    const records = runBatch({ ...options, matches: 4, quiet: true }, ruleset, 'smoke');
    const again = runMatch({
      ruleset,
      map,
      deck,
      scenario: loadScenario('cold-start', ruleset, map),
      seats: options.bots.slice(0, options.players).map(loadPersonality),
      seed: options.seed,
      matchId: 'smoke-0',
    });
    if (again.hash !== records[0]!.hash) throw new Error('smoke: bot match is not deterministic');
    const s = summarize(records);
    console.log(
      `bots ok: ${records.length} matches, reasons ${JSON.stringify(s.reasons)}, avg ${s.avgMs} ms, ` +
        `rejected/match ${s.rejectedPerMatch}, defaulted/match ${s.defaultedPerMatch}, deterministic`,
    );
    return;
  }
  const base = loadRuleset(options.ruleset);
  const patched =
    options.patches.length > 0 ? applyPatches(base, options.patches.map(loadPatch)) : base;
  if (options.sweep) {
    for (const value of options.sweep.values) {
      const ruleset = applyPatches(patched, [patchFor(options.sweep.key, value)]);
      const label = `${options.sweep.key}=${value}`;
      report(label, runBatch(options, ruleset, label), options.out);
    }
    return;
  }
  report('run', runBatch(options, patched, 'run'), options.out);
}

main();
