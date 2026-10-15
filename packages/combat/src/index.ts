/**
 * Combat simulation (Weapons and Combat spec; Technical Architecture §12).
 */
import type { CombatResolver } from '@nukka/core';
import { createCombat } from './sim.js';

export { CombatSim, createCombat } from './sim.js';
export * from './geometry.js';

/** Resolves a combat window entirely on autopilot (used by the harness and for unattended players). */
export const autopilotResolver: CombatResolver = (ctx, state, input) =>
  createCombat(ctx, state, input).run();
