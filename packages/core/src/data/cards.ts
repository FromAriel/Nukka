import { z } from 'zod';
import { DataValidationError, formatIssues } from './ruleset.js';
import { int, nonNeg, pos } from './common.js';

/** Effect vocabulary (main design §14; Technical Architecture spec §11). */
export const primitiveOps = [
  'damage',
  'disable',
  'modify',
  'reveal',
  'move',
  'protect',
  'transfer',
  'cancel',
  'draw',
  'discard',
  'tension',
  'blame',
  'hostility',
  'choice',
] as const;
export type PrimitiveOp = (typeof primitiveOps)[number];

export interface Effect {
  readonly op: PrimitiveOp;
  readonly [param: string]: unknown;
}

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly effects: readonly Effect[];
}

const choiceOptionSchema: z.ZodType<ChoiceOption> = z.lazy(() =>
  z.strictObject({ id: z.string(), label: z.string(), effects: z.array(effectSchema) }),
);

const effectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.union([
    z.looseObject({
      op: z.literal('choice'),
      chooser: z.enum(['target', 'each-other-player', 'owner']),
      options: z.array(choiceOptionSchema).min(2),
    }),
    z.looseObject({ op: z.enum(primitiveOps).exclude(['choice']) }),
  ]),
);

export const playModes = [
  'root',
  'response',
  'counter',
  'stabilization',
  'global',
  'operation',
  'countermeasure',
  'attachment',
  'build-modifier',
] as const;

export const cardTag = z.enum([
  'covert',
  'economic',
  'military',
  'political',
  'nuclear',
  'diplomatic',
]);

export const targetSchema = z.strictObject({
  type: z.enum([
    'none',
    'player',
    'territory',
    'installation',
    'treaty',
    'chain-card',
    'operation',
    'own-build',
  ]),
  owner: z.enum(['any', 'self', 'other', 'self-or-partner']).optional(),
  kinds: z.array(z.string()).optional(),
  filters: z.array(z.string()).optional(),
});

const appliesWhen = z.enum(['always', 'on-success', 'on-exposure', 'on-reveal']);

export const cardSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  copies: pos(),
  plays: z.array(z.enum(playModes)).min(1),
  tags: z.array(cardTag),
  text: z.string().min(1),
  cost: z.strictObject({ ip: nonNeg() }).optional(),
  difficulty: nonNeg().optional(),
  requires: z.array(z.string()).optional(),
  target: targetSchema,
  effects: z.array(effectSchema),
  tension: int(),
  blame: int(),
  /** When the printed tension applies, and when the printed blame applies. */
  tensionWhen: appliesWhen,
  blameWhen: appliesWhen,
  lastsRounds: pos().optional(),
});
export type CardDef = z.infer<typeof cardSchema>;

export const deckSchema = z.strictObject({
  id: z.string(),
  version: z.string(),
  cards: z.array(cardSchema).min(1),
});
export type DeckDef = z.infer<typeof deckSchema>;

export function parseDeck(raw: unknown, source = 'deck'): DeckDef {
  const result = deckSchema.safeParse(raw);
  if (!result.success) throw new DataValidationError(source, formatIssues(result.error));
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const card of result.data.cards) {
    if (ids.has(card.id)) problems.push(`duplicate card id "${card.id}"`);
    ids.add(card.id);
    const covertKind = card.plays.some(
      (p) => p === 'operation' || p === 'countermeasure' || p === 'attachment',
    );
    if (covertKind && !card.tags.includes('covert'))
      problems.push(`${card.id}: covert play mode without the covert tag`);
    if (
      card.plays.includes('operation') &&
      (card.cost?.ip === undefined || card.difficulty === undefined)
    ) {
      problems.push(`${card.id}: operations need an IP cost and a difficulty`);
    }
  }
  if (problems.length > 0) throw new DataValidationError(source, problems);
  return result.data;
}

/** Card ids expanded by copy count, in definition order. */
export function expandDeck(deck: DeckDef): string[] {
  return deck.cards.flatMap((card) => Array.from({ length: card.copies }, () => card.id));
}
