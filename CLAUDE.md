# Nukka

Turn-based escalation strategy game. Design and planning docs live in `docs/planning/`; the
Technical Architecture spec there is the source of truth for code structure.

**Handoffs:** start every session by reading the newest file in `docs/handoffs/`; end it by writing
a new one (procedure in `docs/handoffs/README.md`).

## Commands

- `pnpm install` — install dependencies (pnpm workspaces, Node 22+)
- `pnpm check` — everything CI runs: format check, lint, typecheck, tests, harness smoke run
- `pnpm test` / `pnpm test:watch` — Vitest across all packages
- `pnpm lint`, `pnpm typecheck`, `pnpm format`
- `pnpm smoke` — headless harness smoke run (also loads all game data)
- `pnpm sim --matches 100 --bots builder,expansionist,defender,brinkman --out results/run` — bot match batches (see `packages/harness/src/cli.ts` for `--patch`, `--sweep`, `--players`, `--scenario`)
- `pnpm gen:maps` — regenerate `data/maps/` from the generators in `packages/harness/src/maps/`

Run `pnpm check` before every commit.

## Data

- `data/rulesets/<id>/` — tunable numbers, validated by the Zod schemas in `packages/core/src/data/`
- `data/maps/` — generated; never edit by hand (a test checks it matches its generator)
- `data/cards/` — card definitions
- `data/scenarios/` — starting positions; `data/bots/` — bot personalities

## CI

GitHub Actions bills a minimum of one minute per job, so CI runs as a single job and only on
non-draft pull requests and pushes to `main` (not on branch pushes, not for docs-only changes).
Don't add workflows or split jobs without a good reason; run checks locally instead.

## Packages

- `packages/core` — rules engine (no dependencies on other packages)
- `packages/combat` — combat simulation (depends on core)
- `packages/ai` — bots and autopilot (core, combat)
- `packages/harness` — headless match runner CLI (core, combat, ai); tests that need data files live here

Lint enforces these boundaries.

## Rules for simulation code (core, combat)

- Integers only. Use `fixed.ts` helpers; fractions are per-mille. No `Math.random`, `Math.sin`,
  `Date`, or other float/clock APIs — lint blocks them.
- Randomness only through named streams from `rng.ts` (`deriveStream(seed, name)`).
- Never iterate `Object.keys/values/entries` directly; use `sortedKeys`/`sortedEntries`.
- Every tunable number belongs in `data/rulesets/`, not in code.
- Clients and bots receive only per-player views, never the full state.
