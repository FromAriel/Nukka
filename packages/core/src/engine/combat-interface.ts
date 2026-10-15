/**
 * The boundary between the rules engine and the combat simulation
 * (Technical Architecture spec §12). The engine builds a CombatInput when
 * combat locks, a resolver (from @nukka/combat, or a test double) returns a
 * CombatResult, and the engine applies it in the aftermath. The resolver may
 * read state but must not change it.
 */
import type { MatchContext } from './context.js';
import type { DeclaredOperation, GameState, NuclearPlan, PlayerId } from './state.js';

export type DefensePolicy = 'protectCivilians' | 'preserveRetaliation' | 'balanced';

export interface CombatInput {
  readonly round: number;
  readonly kind: 'conventional' | 'nuclear';
  readonly operations: readonly DeclaredOperation[];
  readonly plans: Readonly<Record<PlayerId, readonly NuclearPlan[]>>;
  readonly policies: Readonly<Record<PlayerId, DefensePolicy>>;
}

export interface CombatResult {
  /** Condition steps lost per installation; ruined installations lose their contents. */
  readonly installationHits: readonly { installation: string; steps: number }[];
  /** New stored partial-hit count of each hardened installation hit (below one condition step). */
  readonly hardHits: readonly { installation: string; hits: number }[];
  readonly unitLosses: readonly { stack: string; count: number }[];
  readonly militiaLosses: readonly { territory: string; count: number }[];
  readonly population: readonly { territory: string; killed: number; displaced: number }[];
  /** Ground assaults that met the capture condition (Weapons spec §9). */
  readonly captures: readonly { territory: string; by: PlayerId }[];
  /** Neutral territories cleared of defenders where attackers tied; they stay neutral. */
  readonly tiedClaims: readonly { territory: string }[];
  /** Installations and unit stacks that launched or fired; hidden ones are revealed (Covert spec §8). */
  readonly assetsUsed: readonly string[];
  readonly ammunitionUsed: readonly {
    player: PlayerId;
    kind: string;
    count: number;
    installation?: string;
  }[];
  readonly magazinesUsed: readonly { installation: string; shots: number }[];
  /** Nuclear detonations, by the launching player, at a territory. */
  readonly detonations: readonly { player: PlayerId; territory: string; plan: string }[];
  /** Supply lanes cut by interdiction: [a, b]. */
  readonly disruptedLanes: readonly { a: string; b: string }[];
}

export const EMPTY_RESULT: CombatResult = {
  installationHits: [],
  hardHits: [],
  unitLosses: [],
  militiaLosses: [],
  population: [],
  captures: [],
  tiedClaims: [],
  assetsUsed: [],
  ammunitionUsed: [],
  magazinesUsed: [],
  detonations: [],
  disruptedLanes: [],
};

export type CombatResolver = (
  ctx: MatchContext,
  state: Readonly<GameState>,
  input: CombatInput,
) => CombatResult;
