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
  /** Ammunition built under Covert Program, not yet revealed. */
  hiddenStock: Record<string, number>;
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
  /** Built under Covert Program and not yet revealed. */
  hidden: boolean;
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
  /** Built under Covert Program and not yet revealed. */
  hidden: boolean;
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
  /** Timed effects from cards and rules (Technical Architecture spec §11). */
  modifiers: Modifier[];
  treaties: Treaty[];
  /** Pairs who can't sign a new treaty until the given round (Tension spec §5.3). */
  cooldowns: { a: PlayerId; b: PlayerId; untilRound: number }[];
  /** Hidden information revealed to a player until a round ends. */
  reveals: { subject: string; of: PlayerId; to: PlayerId; untilRound: number }[];
  /** Main actions waiting to resolve this round, in initiative order. */
  actionQueue: QueuedAction[];
  /** The event chain or proposal being resolved, if any. */
  chain: Chain | null;
  covert: {
    operations: CovertOperation[];
    countermeasures: { id: string; owner: PlayerId; card: string; untilRound: number }[];
    /** The true record of resolved operations, used to check accusations. */
    history: CovertRecord[];
  };
  /** Crisis votes cast this round, secret until all are in. */
  crisisVotes: Record<PlayerId, CrisisVote>;
  /** Last accepted command sequence number per player. */
  lastSeq: Record<PlayerId, number>;
  result: MatchResult | null;
}

export type DecisionKind = 'planning' | 'crisis-vote' | 'reaction' | 'choice' | 'proposal';
export type CrisisVote = 'authorize' | 'hold';

export interface PendingDecision {
  player: PlayerId;
  kind: DecisionKind;
  /** For reactions: the slot being offered. */
  slot?: ChainSlot;
  /** For choices: the legal option ids. */
  options?: string[];
}

export type ChainSlot = 'response' | 'counter' | 'stabilization';

export interface Modifier {
  id: string;
  player: PlayerId;
  stat: string;
  amount: number;
  data: Record<string, string | number | boolean>;
  /** Active from the start of fromRound through the end of untilRound. */
  fromRound: number;
  untilRound: number;
}

export interface Treaty {
  id: string;
  kind: string;
  parties: PlayerId[];
  signedRound: number;
  /** Last round the treaty is in force, or null if open-ended. */
  untilRound: number | null;
  mediatedBy: PlayerId | null;
  /** Arms control: posture at signing and the round by which it must have fallen. */
  baselinePosture: Record<PlayerId, number>;
  deadlineRound: number | null;
}

export interface ChainLink {
  slot: 'root' | ChainSlot;
  player: PlayerId;
  card: string;
  target: string | null;
  canceled: boolean;
}

export interface Chain {
  id: string;
  kind: 'card' | 'global' | 'proposal';
  initiator: PlayerId;
  /** The affected player, who answers in the response and stabilization slots. */
  defender: PlayerId | null;
  links: ChainLink[];
  /** Slots still to offer, in order. */
  remaining: ChainSlot[];
  params: CardParams;
  proposal: Proposal | null;
  /** Answers to choices and proposals, by player. */
  answers: Record<PlayerId, string>;
}

export interface CardParams {
  /** Border Exercise: which stacks move where. */
  moves?: Reposition[];
}

export type ProposalKind =
  | 'nonAggression'
  | 'defensive'
  | 'trade'
  | 'ceasefire'
  | 'armsControl'
  | 'settlement'
  | 'moratorium'
  | 'peaceEnvoy'
  | 'mediation'
  | 'openVerification';

export interface Proposal {
  kind: ProposalKind;
  /** Players who must accept: the target, or both sides for mediation; everyone for settlement. */
  parties: PlayerId[];
}

export interface QueuedAction {
  player: PlayerId;
  action: MainAction;
}

// ------------------------------------------------------------ planning orders

export type DevelopmentOrder =
  | { type: 'build'; kind: string; territory: string; mode?: string; covert?: boolean }
  | { type: 'upgrade'; installation: string }
  | { type: 'repair'; installation: string }
  | { type: 'recruit'; unit: string; location: string; covert?: boolean }
  | { type: 'ammunition'; kind: string; covert?: boolean }
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

export type MainAction =
  | { type: 'pass' }
  | { type: 'card'; card: string; target?: string; params?: CardParams }
  | { type: 'proposal'; proposal: ProposalKind; target?: PlayerId; second?: PlayerId };

export type ShadowMarker =
  | { type: 'blank' }
  | {
      type: 'operation';
      card: string;
      target: string;
      /** Extra IP spent to raise difficulty. */
      boost?: number;
      /** Pay to choose the exact fuse instead of a random one. */
      fuse?: number;
      /** Attach an Inside Agent card from hand. */
      insideAgent?: boolean;
    }
  | { type: 'countermeasure'; card: string };

export interface CovertOperation {
  id: string;
  owner: PlayerId;
  card: string;
  target: string;
  fireRound: number;
  difficulty: number;
  ignoresCountermeasures: boolean;
}

export interface CovertRecord {
  id: string;
  round: number;
  owner: PlayerId;
  victims: PlayerId[];
  card: string;
  outcome: 'success' | 'foiled' | 'exposed' | 'fizzled';
}

export interface TradeTransfer {
  to: PlayerId;
  resource: 'food' | 'water' | 'supplies';
  amount: number;
}

export interface PlanningOrders {
  development: DevelopmentOrder[];
  repositioning: Reposition[];
  /** Free: move stockpiled weapons into silos and launchers. */
  loads: LoadOrder[];
  /** Installation id → requested mode (takes effect next upkeep). */
  modes: Record<string, string>;
  /** IP set aside as counter-intelligence this round. */
  counterIntel: number;
  /** Transfers to trade-agreement partners. */
  trades: TradeTransfer[];
  /** Treaties to leave without penalty because the other party is a pariah. */
  leaveTreaties: string[];
  /** Face-down shadow markers; exactly as many as the player's shadow slots. */
  shadow: ShadowMarker[];
  /** At most one accusation per round about a covert effect against you. */
  accusation: { accused: PlayerId; record: string } | null;
  main: MainAction;
}

export const PASS_ORDERS: PlanningOrders = {
  development: [],
  repositioning: [],
  loads: [],
  modes: {},
  counterIntel: 0,
  trades: [],
  leaveTreaties: [],
  shadow: [],
  accusation: null,
  main: { type: 'pass' },
};

export function pairKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hostilityKey(from: PlayerId, toward: PlayerId): string {
  return `${from}>${toward}`;
}
