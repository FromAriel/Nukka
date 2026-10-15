import { z } from 'zod';

const weight = () => z.int().min(0).max(10);

export const personalitySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  weights: z.strictObject({
    economy: weight(),
    defense: weight(),
    military: weight(),
    expansion: weight(),
    nuclear: weight(),
    covert: weight(),
    diplomacy: weight(),
    aggression: weight(),
  }),
  /** Share of spare IP put into counter-intelligence each round, in per-mille. */
  counterIntelShare: z.int().min(0).max(1000),
  authorizeRelease: z.boolean(),
  honorAllies: z.boolean(),
  bureauMode: z.enum(['foreign', 'domestic']),
});

export type Personality = z.infer<typeof personalitySchema>;

export function parsePersonality(raw: unknown, source = 'personality'): Personality {
  const result = personalitySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `${source} is invalid: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}
