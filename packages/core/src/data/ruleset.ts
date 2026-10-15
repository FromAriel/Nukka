import { z } from 'zod';
import { sortedKeys } from '../collections.js';
import { stateHash } from '../hash.js';
import {
  feature,
  int,
  ms,
  nonNeg,
  permille,
  pos,
  resourceAmounts,
  resourceKey,
  terrain,
  threatClass,
} from './common.js';

// ---------------------------------------------------------------- manifest

export const manifestSchema = z.strictObject({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  schemaVersion: pos(),
  description: z.string(),
});

// ---------------------------------------------------------------- match

export const matchSchema = z.strictObject({
  rounds: pos(),
  players: z.strictObject({ min: pos(), max: pos() }),
  hand: z.strictObject({ start: nonNeg(), drawPerRound: nonNeg(), max: pos() }),
  reactionPointsPerRound: nonNeg(),
  orders: z.strictObject({ development: nonNeg(), repositioning: nonNeg(), main: nonNeg() }),
  chain: z.strictObject({ maxCards: pos(), responseWindowMs: ms() }),
  neutral: z.strictObject({
    militiaPerTerritory: nonNeg(),
    militiaAfterTiedClaim: nonNeg(),
    captureTension: nonNeg(),
  }),
});

// ---------------------------------------------------------------- economy

const upgradeSchema = z.strictObject({
  id: z.string(),
  cost: nonNeg(),
  output: resourceAmounts,
  requiresNetworkResource: resourceKey.optional(),
});

const installationSchema = z.strictObject({
  cost: nonNeg(),
  powerDraw: nonNeg(),
  powerSupply: nonNeg().optional(),
  civilian: z.boolean(),
  hardened: z.boolean(),
  requiresFeature: feature.optional(),
  output: resourceAmounts.optional(),
  modes: z
    .record(z.string(), resourceAmounts.and(z.object({ counterIntel: nonNeg().optional() })))
    .optional(),
  defaultMode: z.string().optional(),
  featureBonus: z.partialRecord(feature, int()).optional(),
  upgrade: upgradeSchema.optional(),
  maxPerCountry: pos().optional(),
  supplyCapBonus: nonNeg().optional(),
  housingBonus: nonNeg().optional(),
  aircraftCapacity: nonNeg().optional(),
  missileCapacity: nonNeg().optional(),
  supplyUpkeep: nonNeg().optional(),
  visionRange: nonNeg().optional(),
  coastalOnly: z.boolean().optional(),
});
export type InstallationRules = z.infer<typeof installationSchema>;

export const economySchema = z.strictObject({
  caps: z.strictObject({
    production: nonNeg(),
    food: nonNeg(),
    water: nonNeg(),
    supplies: nonNeg(),
    intelligence: nonNeg(),
  }),
  government: resourceAmounts,
  populationDemand: z.strictObject({ food: nonNeg(), water: nonNeg() }),
  exclaveProductionCost: nonNeg(),
  housing: z.record(terrain, nonNeg()),
  shortages: z.strictObject({
    hungryUpkeepsBeforeLoss: pos(),
    unsuppliedUpkeepsBeforeDisband: pos(),
    displacedUpkeepsBeforeLoss: pos(),
  }),
  supportedForecastUpkeeps: pos(),
  repair: z.strictObject({
    repairCostPermille: permille(),
    rebuildExtraCost: nonNeg(),
    rebuildUpkeeps: pos(),
    clearRuinedCost: nonNeg(),
  }),
  startingReserves: z.strictObject({
    production: nonNeg(),
    food: nonNeg(),
    water: nonNeg(),
    supplies: nonNeg(),
    intelligence: nonNeg(),
  }),
  installations: z.record(z.string(), installationSchema),
  /** Installations keep power in this order when a grid is short; unlisted kinds go last. */
  powerPriority: z.array(z.string()),
});

// ---------------------------------------------------------------- units

const weaponSchema = z.strictObject({
  range: nonNeg(),
  damage: nonNeg(),
  intervalMs: ms(),
  targets: z.array(threatClass).min(1),
});

const unitSchema = z.strictObject({
  cost: nonNeg(),
  supplyUpkeep: nonNeg(),
  hp: pos(),
  speed: nonNeg(),
  domain: z.enum(['ground', 'air', 'sea']),
  operationRange: nonNeg().optional(),
  weapon: weaponSchema.optional(),
  roles: z
    .record(
      z.string(),
      z.strictObject({ conventionalBombs: nonNeg().optional(), weapon: weaponSchema.optional() }),
    )
    .optional(),
  carries: z.strictObject({ nuclearBombs: nonNeg(), conventionalBombs: nonNeg() }).optional(),
  missileCapacity: nonNeg().optional(),
  launchRange: nonNeg().optional(),
  visionRange: nonNeg().optional(),
  requiresInstallation: z.string().optional(),
  coastalOnly: z.boolean().optional(),
  nuclearCapable: z.boolean(),
  buildable: z.boolean(),
});
export type UnitRules = z.infer<typeof unitSchema>;

const ammunitionSchema = z.strictObject({
  cost: nonNeg(),
  quantity: pos(),
  nuclear: z.boolean(),
});

const missileSchema = z.strictObject({
  hp: pos(),
  speed: pos(),
  range: nonNeg().nullable(),
  class: threatClass,
  boostMs: ms().optional(),
  terminalMs: ms().optional(),
  minFlightMs: ms().optional(),
  maxFlightMs: ms().optional(),
});

export const unitsSchema = z.strictObject({
  units: z.record(z.string(), unitSchema),
  ammunition: z.record(z.string(), ammunitionSchema),
  missiles: z.record(z.string(), missileSchema),
});

// ---------------------------------------------------------------- defenses

const defenseSchema = z.strictObject({
  cost: nonNeg(),
  powerDraw: nonNeg(),
  range: nonNeg(),
  engages: z
    .array(z.enum(['air', 'missile', 'strategic-midcourse', 'strategic-terminal', 'ground']))
    .min(1),
  firing: z.enum(['hold', 'point', 'homing', 'automatic']),
  intervalMs: ms(),
  projectileSpeed: nonNeg(),
  burstRadius: nonNeg(),
  damage: nonNeg(),
  destroysOnHit: z.boolean(),
  magazine: nonNeg().nullable(),
  engagementsPerWindow: pos().optional(),
});
export type DefenseRules = z.infer<typeof defenseSchema>;

export const defensesSchema = z.strictObject({
  refillSuppliesPerBattery: nonNeg(),
  defenses: z.record(z.string(), defenseSchema),
});

// ---------------------------------------------------------------- tension

export const tensionSchema = z.strictObject({
  start: nonNeg(),
  max: pos(),
  bands: z.strictObject({ openCrisis: nonNeg(), crisisVote: nonNeg(), releaseOpen: nonNeg() }),
  openCrisisCardBonus: nonNeg(),
  floorCap: nonNeg(),
  posturePoints: z.record(z.string(), nonNeg()),
  postureBands: z.array(z.strictObject({ name: z.string(), min: nonNeg() })).min(1),
  buildupSpikes: z.record(z.string(), nonNeg()),
  aggression: z.strictObject({
    declareWar: z.strictObject({ tension: nonNeg(), blame: nonNeg() }),
    operationWhileAtWar: nonNeg(),
    conventionalMissileRaid: nonNeg(),
    civilianTarget: z.strictObject({ tension: nonNeg(), blame: nonNeg() }),
    captureStartingTerritory: nonNeg(),
    firstNuclearLaunch: z.strictObject({ blame: nonNeg(), infamy: nonNeg() }),
    laterNuclearPopulationStrikeBlame: nonNeg(),
  }),
  cooling: z.strictObject({ noCombat: nonNeg(), conventionalOnly: nonNeg(), nuclear: nonNeg() }),
  blame: z.strictObject({
    decayPerQuietUpkeep: nonNeg(),
    pariahThreshold: pos(),
    leavePariahTreatyBlame: int(),
  }),
  infamy: z.strictObject({ perBlame: nonNeg(), scorePenaltyEvery: pos() }),
  pariahWar: z.strictObject({ tension: nonNeg(), blame: nonNeg() }),
  honorCall: z.strictObject({ tension: nonNeg(), blame: nonNeg(), declineHostility: nonNeg() }),
  hostility: z.strictObject({ max: pos() }),
  treaties: z.strictObject({
    breach: z.strictObject({ tension: nonNeg(), blame: nonNeg(), hostility: nonNeg() }),
    resignCooldownRounds: nonNeg(),
    kinds: z.record(
      z.string(),
      z.strictObject({ signingTension: int(), durationRounds: pos().nullable() }),
    ),
    mediatedBreachExtraBlame: nonNeg(),
    armsControl: z.strictObject({ postureReduction: nonNeg(), deadlineRounds: pos() }),
  }),
  missions: z.strictObject({
    peaceEnvoy: z.strictObject({ tension: int(), hostility: int() }),
    mediation: z.strictObject({
      tension: int(),
      ceasefireRounds: pos(),
      brokerTokens: nonNeg(),
      cards: nonNeg(),
      blame: int(),
      infamy: int(),
    }),
    openVerification: z.strictObject({ tension: int() }),
  }),
  trade: z.strictObject({ maxPerPartner: nonNeg() }),
  disarmamentSpikePermille: permille(),
  vote: z.strictObject({ authorizeBlame: nonNeg(), rollOffDie: pos() }),
  aftermath: z.strictObject({ moratoriumBreachBlame: nonNeg() }),
});

// ---------------------------------------------------------------- covert

export const covertSchema = z.strictObject({
  // Intelligence income comes from economy.government and the command/bureau installations.
  shadowSlots: z.strictObject({ base: pos(), withBureau: pos() }),
  fuse: z.strictObject({ minRounds: pos(), maxRounds: pos(), preciseTimingCost: nonNeg() }),
  boost: z.strictObject({ perIp: pos(), maxBonus: nonNeg() }),
  exposeMargin: nonNeg(),
  countermeasureRounds: pos(),
  exposure: z.strictObject({ tension: nonNeg(), blame: nonNeg(), hostility: nonNeg() }),
  accusation: z.strictObject({
    cost: nonNeg(),
    perRound: pos(),
    lookbackRounds: pos(),
    wrongBlame: nonNeg(),
    wrongHostility: nonNeg(),
  }),
  covertProgram: z.strictObject({ revealSpikePermille: permille(), revealBlame: nonNeg() }),
});

// ---------------------------------------------------------------- scoring

export const scoringSchema = z.strictObject({
  supportedPopulation: nonNeg(),
  civilianInstallation: nonNeg(),
  nonStartingTerritory: nonNeg(),
  peaceBrokerToken: nonNeg(),
  infamyPenaltyEvery: pos(),
  civilianInstallationKinds: z.array(z.string()).min(1),
});

// ---------------------------------------------------------------- combat

export const combatSchema = z.strictObject({
  ticksPerSecond: pos(),
  mapSize: pos(),
  conventional: z.strictObject({ windowMs: ms(), cleanupMs: ms() }),
  nuclear: z.strictObject({ windowMs: ms(), cleanupMs: ms(), waveOffsetsMs: z.array(ms()).min(1) }),
  attackerCommandBudget: nonNeg(),
  bombs: z.strictObject({ releaseRadius: nonNeg(), fallMs: ms(), interceptable: z.boolean() }),
  hardenedHitsPerStep: pos(),
  impairedRatePermille: permille(),
  unsuppliedRatePermille: permille(),
  terrain: z.record(
    terrain,
    z.strictObject({
      attackerSpeedPermille: permille(),
      defenderDamageTakenPermille: permille(),
      assaultExtraSupplies: nonNeg(),
    }),
  ),
  population: z.strictObject({ hitsToDisplace: pos(), hitsToKill: pos() }),
  nuclearEffects: z.strictObject({
    blastRadius: pos(),
    outerRadius: pos(),
    blastKillPermille: permille(),
    blastDisplacePermille: permille(),
    outerDisplace: nonNeg(),
    contaminationRounds: nonNeg(),
    contaminationOutputPermille: permille(),
    devastationPerDetonation: nonNeg(),
  }),
  devastation: z.array(
    z.strictObject({
      at: pos(),
      farmFood: int(),
      waterworksWater: int(),
      tradePermille: permille(),
    }),
  ),
  interdictionDisruptRounds: pos(),
  emergencyRelayRangePermille: permille(),
});

// ---------------------------------------------------------------- bundle

export const rulesetFileSchemas = {
  manifest: manifestSchema,
  match: matchSchema,
  economy: economySchema,
  units: unitsSchema,
  defenses: defensesSchema,
  tension: tensionSchema,
  covert: covertSchema,
  scoring: scoringSchema,
  combat: combatSchema,
} as const;

export type RulesetFileName = keyof typeof rulesetFileSchemas;
export const RULESET_FILES = Object.freeze([
  'manifest',
  'match',
  'economy',
  'units',
  'defenses',
  'tension',
  'covert',
  'scoring',
  'combat',
] as const);

export const rulesetSchema = z.strictObject(rulesetFileSchemas);
export type Ruleset = z.infer<typeof rulesetSchema>;
export type RulesetFiles = Record<RulesetFileName, unknown>;

export class DataValidationError extends Error {
  constructor(
    readonly source: string,
    readonly issues: readonly string[],
  ) {
    super(`${source} is invalid:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataValidationError';
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/** Validates a raw ruleset bundle (one object per data file). */
export function parseRuleset(files: RulesetFiles, source = 'ruleset'): Ruleset {
  const result = rulesetSchema.safeParse(files);
  if (!result.success) throw new DataValidationError(source, formatIssues(result.error));
  const ruleset = result.data;
  const problems = crossCheckRuleset(ruleset);
  if (problems.length > 0) throw new DataValidationError(source, problems);
  return ruleset;
}

function crossCheckRuleset(ruleset: Ruleset): string[] {
  const problems: string[] = [];
  const { tension, economy, units, combat, covert } = ruleset;
  const known = new Set([
    ...Object.getOwnPropertyNames(economy.installations),
    ...Object.getOwnPropertyNames(units.units),
    ...Object.getOwnPropertyNames(units.ammunition),
  ]);
  for (const name of [
    ...Object.getOwnPropertyNames(tension.posturePoints),
    ...Object.getOwnPropertyNames(tension.buildupSpikes),
  ]) {
    if (!known.has(name)) problems.push(`tension: unknown asset "${name}"`);
  }
  for (const kind of sortedKeys(economy.installations)) {
    const rules = economy.installations[kind]!;
    if (rules.modes && (rules.defaultMode === undefined || !(rules.defaultMode in rules.modes))) {
      problems.push(`economy.installations.${kind}: needs a defaultMode naming one of its modes`);
    }
  }
  for (const name of economy.powerPriority) {
    if (!(name in economy.installations) && !(name in ruleset.defenses.defenses)) {
      problems.push(`economy.powerPriority: unknown installation "${name}"`);
    }
  }
  for (const name of ruleset.scoring.civilianInstallationKinds) {
    if (!(name in economy.installations)) problems.push(`scoring: unknown installation "${name}"`);
  }
  if (tension.floorCap >= tension.bands.releaseOpen) {
    problems.push('tension.floorCap must be below bands.releaseOpen so a vote is always required');
  }
  if (!(
    tension.bands.openCrisis < tension.bands.crisisVote &&
    tension.bands.crisisVote < tension.bands.releaseOpen
  )) {
    problems.push('tension.bands must increase: openCrisis < crisisVote < releaseOpen');
  }
  if (covert.fuse.minRounds > covert.fuse.maxRounds)
    problems.push('covert.fuse: minRounds > maxRounds');
  if (combat.nuclearEffects.outerRadius <= combat.nuclearEffects.blastRadius) {
    problems.push('combat.nuclearEffects: outerRadius must exceed blastRadius');
  }
  const strategic = units.missiles['strategic'];
  const lastWave = Math.max(...combat.nuclear.waveOffsetsMs);
  if (
    strategic?.maxFlightMs !== undefined &&
    lastWave + strategic.maxFlightMs > combat.nuclear.windowMs + combat.nuclear.cleanupMs
  ) {
    problems.push(
      'combat: the last nuclear wave plus max flight time exceeds the window and cleanup',
    );
  }
  return problems;
}

/** Content hash of an effective ruleset, recorded in every match log. */
export function rulesetHash(ruleset: Ruleset): string {
  return stateHash(ruleset);
}

// ---------------------------------------------------------------- patches

export type TuningPatch = { readonly id: string; readonly changes: Record<string, unknown> };

/**
 * Applies tuning patches (Technical Architecture spec §5.2). A patch may only
 * change keys that already exist in the base, so a typo fails loudly instead
 * of being silently ignored. The result is re-validated.
 */
export function applyPatches(base: Ruleset, patches: readonly TuningPatch[]): Ruleset {
  let current: unknown = structuredClone(base);
  for (const patch of patches) {
    current = mergeExisting(current, patch.changes, `patch "${patch.id}"`);
  }
  return parseRuleset(
    current as RulesetFiles,
    `ruleset with patches ${patches.map((p) => p.id).join(', ')}`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeExisting(target: unknown, changes: unknown, path: string): unknown {
  if (!isPlainObject(changes) || !isPlainObject(target)) return changes;
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.getOwnPropertyNames(changes).sort()) {
    if (!(key in target)) throw new DataValidationError(path, [`unknown key "${key}"`]);
    result[key] = mergeExisting(target[key], changes[key], `${path}.${key}`);
  }
  return result;
}
