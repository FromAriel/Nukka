# Nukka

Turn-based escalation strategy game. Design and planning docs live in `docs/planning/`; the
Technical Architecture spec there is the source of truth for code structure.

## Commands

- `pnpm install` — install dependencies (pnpm workspaces, Node 22+)
- `pnpm check` — everything CI runs: format check, lint, typecheck, tests, harness smoke run
- `pnpm test` / `pnpm test:watch` — Vitest across all packages
- `pnpm lint`, `pnpm typecheck`, `pnpm format`
- `pnpm smoke` — headless harness smoke run

Run `pnpm check` before every commit.

## Packages

- `packages/core` — rules engine (no dependencies on other packages)
- `packages/combat` — combat simulation (depends on core)
- `packages/ai` — bots and autopilot (core, combat)
- `packages/harness` — headless match runner CLI (core, combat, ai)

Lint enforces these boundaries.

## Rules for simulation code (core, combat)

- Integers only. Use `fixed.ts` helpers; fractions are per-mille. No `Math.random`, `Math.sin`,
  `Date`, or other float/clock APIs — lint blocks them.
- Randomness only through named streams from `rng.ts` (`deriveStream(seed, name)`).
- Never iterate `Object.keys/values/entries` directly; use `sortedKeys`/`sortedEntries`.
- Every tunable number belongs in `data/rulesets/`, not in code.
- Clients and bots receive only per-player views, never the full state.
