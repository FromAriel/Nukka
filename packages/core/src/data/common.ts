import { z } from 'zod';

/** Every number in rulesets, maps and cards is an integer (Technical Architecture spec §4.1). */
export const int = () => z.int();
export const nonNeg = () => z.int().nonnegative();
export const pos = () => z.int().positive();
/** A fraction expressed in thousandths: 750 means ×0.75. */
export const permille = () => z.int().min(0).max(10_000);
/** A duration in milliseconds that lands exactly on a 20 Hz simulation tick. */
export const ms = () =>
  z
    .int()
    .nonnegative()
    .refine((value) => value % 50 === 0, 'must be a multiple of 50 ms (one tick)');

export const point = z.tuple([int(), int()]);
export type Point = z.infer<typeof point>;

export const resourceKey = z.enum(['production', 'food', 'water', 'supplies', 'intelligence']);
export type ResourceKey = z.infer<typeof resourceKey>;

export const resourceAmounts = z.partialRecord(resourceKey, nonNeg());

export const terrain = z.enum(['plains', 'forest', 'hills', 'urban']);
export type Terrain = z.infer<typeof terrain>;

export const feature = z.enum(['water', 'farmland', 'ore', 'timber']);
export type Feature = z.infer<typeof feature>;

export const threatClass = z.enum(['air', 'missile', 'strategic', 'ground', 'sea']);
export type ThreatClass = z.infer<typeof threatClass>;
