import { readFileSync } from 'node:fs';
import {
  DataValidationError,
  applyPatches,
  expandDeck,
  parseDeck,
  parseMap,
  rulesetHash,
  validateMap,
  type MapDef,
} from '@nukka/core';
import { describe, expect, it } from 'vitest';
import { listRulesets, loadDeck, loadMap, loadRuleset, mapPath } from './data.js';
import { renderMapJson } from './maps/generate.js';

const ruleset = loadRuleset('base-0.1');
const map = loadMap('basin-4p', ruleset);
const deck = loadDeck('base-0.1');

describe('ruleset base-0.1', () => {
  it('loads and validates every ruleset folder', () => {
    for (const id of listRulesets()) expect(() => loadRuleset(id)).not.toThrow();
  });

  it('matches spot values from the specs', () => {
    expect(ruleset.economy.installations['silo']?.cost).toBe(10);
    expect(ruleset.tension.floorCap).toBe(90);
    expect(ruleset.covert.boost.maxBonus).toBe(5);
    expect(ruleset.combat.nuclear.waveOffsetsMs).toEqual([0, 15000, 30000]);
  });

  it('hashes deterministically', () => {
    expect(rulesetHash(loadRuleset('base-0.1'))).toBe(rulesetHash(ruleset));
  });
});

describe('tuning patches', () => {
  it('changes only the patched value and the hash', () => {
    const patched = applyPatches(ruleset, [
      { id: 'cheaper-silos', changes: { economy: { installations: { silo: { cost: 8 } } } } },
    ]);
    expect(patched.economy.installations['silo']?.cost).toBe(8);
    expect(patched.economy.installations['silo']?.missileCapacity).toBe(2);
    expect(ruleset.economy.installations['silo']?.cost).toBe(10);
    expect(rulesetHash(patched)).not.toBe(rulesetHash(ruleset));
  });

  it('rejects unknown keys so typos fail loudly', () => {
    expect(() =>
      applyPatches(ruleset, [{ id: 'typo', changes: { tension: { flooorCap: 80 } } }]),
    ).toThrow(/unknown key "flooorCap"/);
  });

  it('re-validates values after patching', () => {
    expect(() =>
      applyPatches(ruleset, [{ id: 'bad', changes: { tension: { floorCap: 1.5 } } }]),
    ).toThrow(DataValidationError);
    expect(() =>
      applyPatches(ruleset, [{ id: 'no-vote', changes: { tension: { floorCap: 100 } } }]),
    ).toThrow(/vote is always required/);
  });
});

describe('economy starting balance (Economy spec §6.1)', () => {
  const homeOf = (h: string) => map.territories.filter((t) => t.homeOf === h);
  const inst = ruleset.economy.installations;

  it('produces +7 production, balanced food and water, and 1 spare power before defenses', () => {
    let production = 0;
    let food = 0;
    let water = 0;
    let powerDraw = 0;
    let powerSupply = 0;
    for (const t of homeOf('A')) {
      for (const entry of t.start) {
        const [kind = '', upgrade] = entry.split(':');
        const rules = inst[kind]!;
        powerDraw += rules.powerDraw;
        powerSupply += rules.powerSupply ?? 0;
        const output = upgrade
          ? rules.upgrade!.output
          : (rules.modes?.['construction'] ?? rules.output ?? {});
        production += output.production ?? 0;
        food += output.food ?? 0;
        water += output.water ?? 0;
        if (kind === 'industry' && t.features.includes('ore'))
          production += rules.featureBonus?.ore ?? 0;
      }
    }
    const population = homeOf('A').reduce((sum, t) => sum + t.population, 0);
    expect(production).toBe(7);
    expect(food).toBe(population * ruleset.economy.populationDemand.food);
    expect(water).toBe(population * ruleset.economy.populationDemand.water);
    // Command, 2 industry, waterworks = 4; radar + 2 gun batteries = 3 more.
    const defenses =
      inst['radar']!.powerDraw + 2 * ruleset.defenses.defenses['gunBattery']!.powerDraw;
    expect(powerSupply - powerDraw - defenses).toBe(1);
  });
});

describe('map basin-4p', () => {
  it('is up to date with its generator', () => {
    expect(readFileSync(mapPath('basin-4p'), 'utf8')).toBe(renderMapJson());
  });

  it('has 24 territories and 9 sea zones', () => {
    expect(map.territories).toHaveLength(24);
    expect(map.seaZones).toHaveLength(9);
    expect(map.territories.filter((t) => t.homeOf === null)).toHaveLength(8);
  });

  it('never lets two homes border each other', () => {
    const byId = new Map(map.territories.map((t) => [t.id, t]));
    for (const t of map.territories) {
      for (const n of t.land) {
        const other = byId.get(n)!;
        if (t.homeOf !== null && other.homeOf !== null) expect(other.homeOf).toBe(t.homeOf);
      }
    }
  });

  it('puts a neighbour home 2 land steps away and the opposite home 4', () => {
    expect(landDistance(map, 'A-port', 'B-port')).toBe(2);
    expect(landDistance(map, 'A-heartland', 'C-heartland')).toBe(4);
  });

  it('keeps the inland sea separate from the ocean', () => {
    const inland = map.seaZones.find((s) => s.id === 'sea-inland')!;
    expect(inland.adjacentSea).toEqual([]);
    expect(map.territories.filter((t) => t.sea.includes('sea-inland'))).toHaveLength(8);
  });

  it('detects one-sided links and unequal homes', () => {
    const broken: MapDef = structuredClone(map);
    broken.territories[0]!.land.push('N-frontier');
    broken.territories.find((t) => t.id === 'B-capital')!.population = 9;
    const problems = validateMap(broken);
    expect(problems.some((p) => p.includes('one-sided'))).toBe(true);
    expect(problems.some((p) => p.includes('home B differs'))).toBe(true);
  });

  it('rejects unknown starting installations', () => {
    const raw = JSON.parse(readFileSync(mapPath('basin-4p'), 'utf8'));
    raw.territories[0].start.push('castle');
    expect(() => parseMap(raw, 'map', new Set(['command', 'industry', 'powerStation']))).toThrow(
      /castle/,
    );
  });
});

describe('deck base-0.1', () => {
  it('has 24 designs and 57 cards', () => {
    expect(deck.cards).toHaveLength(24);
    expect(expandDeck(deck)).toHaveLength(57);
  });

  it('requires a cost and difficulty on every operation', () => {
    const raw = JSON.parse(JSON.stringify(deck));
    delete raw.cards.find((c: { id: string }) => c.id === 'sabotage-crew').difficulty;
    expect(() => parseDeck(raw)).toThrow(/operations need/);
  });

  it('rejects unknown effect primitives', () => {
    const raw = JSON.parse(JSON.stringify(deck));
    raw.cards[0].effects.push({ op: 'explode' });
    expect(() => parseDeck(raw)).toThrow(DataValidationError);
  });
});

function landDistance(m: MapDef, from: string, to: string): number {
  const byId = new Map(m.territories.map((t) => [t.id, t]));
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const n of byId.get(id)!.land) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(id)! + 1);
        queue.push(n);
      }
    }
  }
  return dist.get(to) ?? -1;
}
