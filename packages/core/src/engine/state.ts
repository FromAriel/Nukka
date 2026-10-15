/**
 * The full game state (Technical Architecture spec §6). Plain, JSON-safe and
 * integer-only so it can be hashed, saved and replayed.
 */

export type PlayerId = string;
export type Phase =
  'upkeep' | 'planning' | 'intelligence' | 'events' | 'crisis' | 'combat' | 'aftermath' | 'ended';
export type Condition = 'operational' | 'impaired' | 'ruined';

export interface Reserves {
  production: number;
  food: number;
  water: number;
  supplies: number;
  intelligence: number;
}

export interface PlayerState {
  id: PlayerId;
  /** Home letter on the map. */
  home: string;
  reserves: Reserves;
  hand: string[];
  /** Ammunition stockpiled nationally, by ammunition kind (loaded weapons live on installations). */
  stock: Record<string, number>;
  reactionPoints: number;
  blame: number;
  infamy: number;
  blameGainedThisRound: boolean;
  peaceBrokerTokens: number;
  viable: boolean;
  /** Counter-intelligence set aside for the current round. */
  counterIntel: number;
}

export interface TerritoryState {
  owner: PlayerId | null;
  /** Home this territory started in, if any (for scoring non-starting territories). */
  startingOwner: PlayerId | null;
  population: number;
  /** Tokens that went hungry at the last upkeep. */
  hungry: number;
  militia: number;
  contestedRounds: number;
  contaminationRounds: number;
}

export interface Installation {
  id: string;
  kind: string;
  owner: PlayerId;
  territory: string;
  site: number;
  condition: Condition;
  upgraded: boolean;
  /** Industry or bureau mode in force, and any change waiting for the next upkeep. */
  mode: string | null;
  pendingMode: string | null;
  /** Weapons loaded, e.g. warheads in a silo. */
  loaded: Record<string, number>;
  /** Defense shots left in the magazine, or null for installations without one. */
  magazine: number | null;
  /** Round in which an ongoing repair or rebuild completes. */
  repairCompletesRound: number | null;
  /** Conventional hits taken toward the next condition step (hardened installations). */
  hardHits: number;
}

export interface UnitStack {
  id: string;
  owner: PlayerId;
  kind: string;
  /** Territory or sea zone id. */
  location: string;
  count: number;
  /** Formations in this stack that went unsupplied at the last upkeep. */
  unsupplied: number;
}

export interface TensionChange {
  round: number;
  source: PlayerId | null;
  amount: number;
  reason: string;
}

export interface TensionState {
  value: number;
  floor: number;
  release: 'locked' | 'open' | 'aftermath';
  log: TensionChange[];
}

export type RelationState = 'peace' | 'hostile' | 'war';

export interface MatchMeta {
  matchId: string;
  rulesetId: string;
  rulesetHash: string;
  mapId: string;
  deckId: string;
  scenarioId: string;
  seed: number;
  formatVersion: number;
}

export interface MatchResult {
  reason: 'rounds' | 'settlement' | 'last-viable' | 'mutual-defeat';
  scores: Record<PlayerId, number>;
  winners: PlayerId[];
}

export interface GameState {
  meta: MatchMeta;
  round: number;
  phase: Phase;
  /** Player ids in fixed order. */
  playerIds: PlayerId[];
  /** Index into playerIds of the player acting first this round. */
  initiative: number;
  players: Record<PlayerId, PlayerState>;
  territories: Record<string, TerritoryState>;
  installations: Record<string, Installation>;
  units: Record<string, UnitStack>;
  nextId: number;
  tension: TensionState;
  /** Keyed by pairKey(a, b). */
  relations: Record<string, RelationState>;
  /** Keyed by `${from}>${toward}`. */
  hostility: Record<string, number>;
  deck: { draw: string[]; discard: string[]; covertDiscard: string[] };
  devastation: number;
  lastCombat: 'none' | 'conventional' | 'nuclear';
  /** Land borders whose supply links are cut: [a, b] sorted, until the given round. */
  disruptedLanes: { a: string; b: string; untilRound: number }[];
  rng: Record<string, number[]>;
  /** Decisions the engine is waiting for (Technical Architecture spec §7.1). */
  decisions: PendingDecision[];
  /** Planning orders submitted this round, revealed together when all are in. */
  planningOrders: Record<PlayerId, PlanningOrders>;
  /** Last accepted command sequence number per player. */
  lastSeq: Record<PlayerId, number>;
  result: MatchResult | null;
}

export type DecisionKind = 'planning';

export interface PendingDecision {
  player: PlayerId;
  kind: DecisionKind;
}

// ------------------------------------------------------------ planning orders

export type DevelopmentOrder =
  | { type: 'build'; kind: string; territory: string; mode?: string }
  | { type: 'upgrade'; installation: string }
  | { type: 'repair'; installation: string }
  | { type: 'recruit'; unit: string; location: string }
  | { type: 'ammunition'; kind: string }
  | { type: 'dismantle'; installation: string }
  | { type: 'disband'; stack: string; count: number }
  | { type: 'destroyAmmunition'; kind: string; count: number };

export interface Reposition {
  stack: string;
  count: number;
  to: string;
}

export interface LoadOrder {
  installation: string;
  ammunition: string;
  count: number;
}

export type MainAction = { type: 'pass' };

export interface PlanningOrders {
  development: DevelopmentOrder[];
  repositioning: Reposition | null;
  /** Free: move stockpiled weapons into silos and launchers. */
  loads: LoadOrder[];
  /** Installation id → requested mode (takes effect next upkeep). */
  modes: Record<string, string>;
  /** IP set aside as counter-intelligence this round. */
  counterIntel: number;
  main: MainAction;
}

export const PASS_ORDERS: PlanningOrders = {
  development: [],
  repositioning: null,
  loads: [],
  modes: {},
  counterIntel: 0,
  main: { type: 'pass' },
};

export function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hostilityKey(from: PlayerId, toward: PlayerId): string {
  return `${from}>${toward}`;
}
