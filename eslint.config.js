// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Determinism rules for simulation code (Technical Architecture spec §4.4).
const determinismRules = {
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Simulation code must not read the clock.' },
    { name: 'performance', message: 'Simulation code must not read the clock.' },
  ],
  'no-restricted-properties': [
    'error',
    ...[
      'random',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'atan2',
      'sqrt',
      'cbrt',
      'pow',
      'exp',
      'log',
      'hypot',
    ].map((property) => ({
      object: 'Math',
      property,
      message: 'Use the integer helpers in @nukka/core (fixed.ts, rng.ts) instead.',
    })),
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        'CallExpression[callee.object.name="Object"][callee.property.name=/^(keys|values|entries)$/]',
      message: 'Iteration order must be explicit: use sortedKeys/sortedEntries from @nukka/core.',
    },
  ],
};

// Package dependency boundaries (Technical Architecture spec §3).
const boundary = (/** @type {string[]} */ forbidden) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: forbidden.map((name) => ({
        group: [`@nukka/${name}`, `@nukka/${name}/*`],
        message: `This package may not depend on @nukka/${name}.`,
      })),
    },
  ],
});

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**', 'results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/combat/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: determinismRules,
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: boundary(['combat', 'ai', 'harness', 'client', 'server']),
  },
  {
    files: ['packages/combat/**/*.ts'],
    rules: boundary(['ai', 'harness', 'client', 'server']),
  },
  {
    files: ['packages/ai/**/*.ts'],
    rules: boundary(['harness', 'client', 'server']),
  },
);
