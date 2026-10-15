# Technical Architecture — Draft Spec v0.1

How the game is built: the tech stack, repository layout, deterministic simulation, tunable rulesets, game state and hidden information, commands and logs, the canonical round sequence, card data, the combat and bot interfaces, the headless test harness and the testing strategy.

Expands main design §14. The game rules come from the other specs in this folder; this doc says how the code holds them.

## 1. Principles

1. **One rules engine everywhere.** The same TypeScript core runs the single-player game, the headless bot harness, tests, and later the online server.
2. **Deterministic.** The same ruleset, map, seed and commands always produce the same game, on any machine, at any frame rate.
3. **Data-driven.** Every number in the specs lives in versioned data files, not code. Values can be tuned without a rebuild.
4. **Hidden information is enforced by the engine.** Players and bots only ever receive a filtered view. Nobody's interface can show what the rules say they can't see.
5. **Headless first.** The full strategic game runs without graphics, so bots can play thousands of matches before any art exists.
6. **Presentation never decides outcomes.** The client renders state and sends commands; it never calculates results (main design §14).

## 2. Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript, `strict` mode |
| Runtime | Node.js LTS for the harness, tests and later the server; modern browsers for the client |
| Packages | pnpm workspaces (monorepo) |
| Build / dev server | Vite for the client; `tsc` for libraries |
| Tests | Vitest, with fast-check for property tests |
| Data validation | Zod schemas for rulesets, maps, cards and save files |
| Lint / format | ESLint and Prettier, with custom bans for determinism (§4.4) |
| Renderer (provisional) | PixiJS, in the client package only. Confirmed or replaced after Milestone 1 (main design §14). |
| CI | GitHub Actions: lint, typecheck, tests, and a short bot-harness smoke run |

## 3. Repository layout

```
/
├─ packages/
│  ├─ core/       Rules engine: state, phases, commands, views, RNG, fixed-point math, cards
│  ├─ combat/     Combat simulation (tick-based)
│  ├─ ai/         Bots and the shared autopilot
│  ├─ harness/    Headless match runner and statistics (CLI)
│  ├─ client/     Game client (from Milestone 1)
│  └─ server/     Online server (Milestone 6)
├─ data/
│  ├─ rulesets/   Versioned tuning bundles, e.g. base-0.1/
│  ├─ maps/       Map files, e.g. basin-4p.json
│  └─ cards/      Card definitions
└─ docs/planning/
```

**Allowed dependencies:**

| Package | May depend on |
|---|---|
| core | nothing in this repo |
| combat | core |
| ai | core, combat (autopilot only) |
| harness | core, combat, ai |
| client | core, combat, ai |
| server | core, combat, ai |

Lint enforces these boundaries. In particular, **core never imports combat, ai or client**.

## 4. Determinism

### 4.1 Integer math only

All simulation values are integers. There are no floating-point numbers in core or combat.

- **Positions:** stored in milli-units. The 1000 × 1000 map is 1,000,000 × 1,000,000 internally.
- **Fractions:** stored as per-mille integers. A terrain multiplier of ×0.75 is `750`; HP is tracked in milli-HP so fractional damage carries over exactly (combat spec §4.3).
- **Trigonometry:** angles use a fixed integer scale, and sine and cosine come from a precomputed lookup table committed to the repo. `Math.sin` and similar functions are never used, because their results can differ between JavaScript engines.
- **Flight paths:** missile arcs are integer Bézier curves.

The renderer converts to floats for drawing only. Nothing calculated from those floats goes back into the simulation.

### 4.2 Random numbers

- A small seeded PRNG (xoshiro128\*\*) is implemented in core.
- **Each purpose gets its own stream**, derived from the match seed and a name: `deck`, `fuses`, `intel-shuffle`, `roll-off`, `bot:<id>`. A rule change that draws one more number in one stream then doesn't change unrelated results.
- RNG state is part of the game state, so it's saved and replayed with everything else.

### 4.3 Ordering

- Collections are always processed in a defined order: sorted by stable entity id unless a rule says otherwise.
- **Simultaneous decisions** (planning, crisis votes, global cards) are applied in player id order after everyone has submitted.
- **Same-tick combat events** are ordered by event priority, then entity id. The priorities are part of the combat ruleset.

### 4.4 Banned in core and combat

`Math.random`, `Date.now`, `performance.now`, floating-point math functions, and iterating `Object.keys` or `Set` contents without sorting. A lint rule catches each of these.

### 4.5 State hashes

A canonical hash of the full state is recorded at the end of every phase. It's used to check replays, compare client and server online, and find exactly where two runs diverge.

## 5. Rulesets and tuning

### 5.1 Ruleset bundles

A **ruleset** is a versioned folder of data files holding every tunable number:

```
data/rulesets/base-0.1/
  manifest.json   id, version, schema version
  economy.json    outputs, costs, upkeep, caps, starting resources
  units.json      HP, speeds, weapons, capacities
  defenses.json   ranges, magazines, fire rates, compatibility
  tension.json    spikes, posture points, floor cap, bands, cooling, blame, infamy
  covert.json     IP income, bureau modes, difficulties, CI thresholds
  scoring.json    score formula weights
  combat.json     window lengths, waves, cleanup limits, nuclear effects, devastation
  match.json      rounds, hand sizes, reaction points, timers
```

Cards (`data/cards/`) and maps (`data/maps/`) are versioned in the same way. Each file is validated against a Zod schema when it loads, and a bad value fails with a readable error.

### 5.2 Tuning patches

A **tuning patch** is a partial JSON file that overrides some values in a base ruleset: `base-0.1 + patch "cheaper-silos"`.

- The **effective ruleset** is the base plus any patches. Its content hash is recorded in every match.
- Published ruleset versions are **never edited**. Changes go in a new version or a patch, so old replays always run with the rules they were played under.

### 5.3 In-game tuning

- **Dev tuning panel** (client, dev builds): browse and edit any ruleset value. Changes apply to the next match, or immediately in a sandbox match, where each change is logged as a `DevTune` command so the replay stays correct.
- **The harness** accepts patches, and parameter sweeps (§13).
- Changes can be saved as a new patch file and committed.

## 6. Game state

The state is one plain, JSON-serializable object. A sketch:

```ts
interface GameState {
  meta: { matchId; rulesetId; rulesetHash; mapId; seed; formatVersion };
  clock: { round: number; phase: Phase; step: Step };
  players: Record<PlayerId, PlayerState>;
  map: { territories: Record<TerritoryId, TerritoryState>; seaZones: Record<SeaZoneId, SeaZoneState> };
  units: Record<UnitId, Unit>;
  installations: Record<InstallationId, Installation>;
  tension: { value; floor; releaseState; changeLog: TensionChange[] };
  relations: { pairs: Record<PairKey, Relation>; treaties: Treaty[]; cooldowns: Cooldown[] };
  cards: { drawPile: CardId[]; discard: CardId[]; covertDiscard: CardId[]; hands: Record<PlayerId, CardId[]> };
  chain: EventChain | null;
  covert: { shadowOps: ShadowOp[]; countermeasures: Countermeasure[] };
  modifiers: Modifier[];            // timed card and rule effects
  nuclearPlans: Record<PlayerId, NuclearPlan[]>;
  pendingOperations: Operation[];
  devastation: number;
  decisions: PendingDecision[];     // who must decide what, right now
  rng: Record<StreamName, RngState>;
}
```

- **Entity ids** are stable strings that are never reused in a match.
- **Strategic phases** use immutable updates: each step returns a new state.
- **Combat** uses its own mutable simulation state during the window and returns a result (§11), for speed.
- **Derived values** (networks, power grids, posture, forecasts, score preview) are computed from state, not stored. They are cached when it's safe.

## 7. The canonical round

This combines the order of operations from every spec into one sequence. The engine is a state machine over these steps.

| # | Phase | Steps |
|---|---|---|
| 1 | **Upkeep** | Recalculate networks and grids → collect output, minus exclave cost → population eats and drinks (shortages, hungry tokens) → military upkeep and magazine refills → advance repairs → apply reserve caps → natural cooling, blame decay, floor recalculation → bureau mode changes take effect → settle displaced population → viability check → draw 2 cards → reset reaction points → rotate initiative |
| 2 | **Planning** (everyone at once, hidden) | Development orders, repositioning, main action declaration, industry modes, shadow markers, CI allocation, accusations, defense policy, nuclear plan drafts, leaving treaties with pariahs. **Then:** resolve construction and friendly moves in player id order, apply buildup spikes, and resolve accusations. |
| 3 | **Intelligence** | Resolve due covert operations in seeded random order, then report them without attribution |
| 4 | **Events** | Main actions in initiative order. Each runs as a chain (root → response → counter → stabilization → resolve); global cards collect everyone's choice at once. Hostile operations are declared, not fought. |
| 5 | **Crisis** | Crisis check → vote or roll-off → honor calls → final commitments (nuclear plans, defense policies, reserved ammunition) → lock |
| 6 | **Combat** | One shared window for all operations, then cleanup. Skipped if there are no operations. |
| 7 | **Aftermath** | Apply damage, captures, nuclear effects and devastation; apply aftermath spikes; update ownership; recalculate networks; build the forecast and the aftermath report. Discard down to 7 cards. |
| 8 | **Match end check** | Round 12 finished, an agreed settlement, one viable country left, or none |

### 7.1 Decision points

Any step that needs player input creates **pending decisions**: who must decide, what kind of decision, the legal options and a deadline.

- The step waits until every required player has decided or the deadline passes.
- **Timeout defaults** are always safe and never create authorization: pass in chains, Hold in crisis votes, blanks in shadow slots, the default defense policy, and no nuclear commitment.
- Single-player has no deadlines for humans.

## 8. Commands

Every action by a human or bot is a **command**:

```ts
interface CommandEnvelope {
  matchId: string;
  playerId: PlayerId;
  seq: number;          // per player, strictly increasing
  at: StepRef;          // the decision point or combat tick it answers
  cmd: Command;         // discriminated union, e.g.
                        // { type: 'BuildInstallation', site, kind }
                        // { type: 'PlaceShadowMarker', marker }
                        // { type: 'PlayResponse', cardId, targets }
                        // { type: 'CastCrisisVote', vote }
                        // { type: 'FireAt', batteryId, point }  (combat)
}
```

- **Validation is a pure function** of state and command. It returns OK or an error code with a readable reason.
- A command is accepted only at a matching open decision point, or at a valid combat tick.
- **Duplicate or out-of-order `seq` values are rejected.** This is what stops late or repeated commands from duplicating cards, ammunition or launches (Milestone 6).
- Invalid commands never change state.

## 9. Events and logs

### 9.1 Domain events

Each step emits **events** that describe what happened, such as `TensionChanged { source, amount, reason }`, `InstallationDamaged`, `CovertOpResolved` or `PopulationHungry`.

Each event carries a **visibility**: public, private to listed players, or owner-only. Events drive the interface, the aftermath report and the tension change log, and each player sees only the events they are entitled to.

### 9.2 Match log

The match log is the save file and the replay file:

```
header:   formatVersion, rulesetId, rulesetHash, patches, mapId, seed, players, bot configs
commands: every accepted command, in order, with its step or tick
hashes:   state hash at the end of each phase
```

- **A replay** re-runs the commands from the start and checks every hash.
- **A save** is the log, plus an optional snapshot for fast loading.
- Before version 1.0, an old save is loaded with the ruleset it recorded, not migrated.

## 10. Hidden information

### 10.1 Views

`viewFor(state, playerId)` is a pure function that returns a **PlayerView**: everything that player is allowed to know, and nothing else.

- **Clients and bots only ever receive views.** Bots are typed to accept a `PlayerView`, so they can't be given the full state by accident.
- Online, the server keeps the full state and sends each client only its view and its events.
- Locally, the engine runs in-process, but the interface reads only the human player's view.
- A **god view** of the full state exists only in dev builds and replay debugging.

### 10.2 What's hidden

This combines the visibility rules from all the specs:

| Information | Visible to |
|---|---|
| Map ownership, terrain, features, population, installations and their condition | Everyone |
| Unit stacks on land: position and type | Everyone |
| Stack quantities; owned, loaded and committed ammunition | Owner, or whoever has revealed them |
| Hand contents **and hand size** | Owner |
| Resource reserves (P, F, W, S, IP) | Owner |
| Posture band (exact PP on hover) | Everyone; Covert Program builds are excluded until revealed |
| Nuclear breakdown | Owner, and anyone who revealed it |
| Bureau mode, CI spent, shadow markers, pending operations | Owner |
| Covert operation results | Public effect to everyone, unattributed; full details to the owner |
| Submarines and patrols at sea | Owner, defensive partners, and anyone with vision on them |
| Nuclear plans | Owner |
| Crisis votes | Secret until all are revealed together |
| Blame, infamy, pariah status, relations, treaties, tension and its log | Everyone |
| Units in flight during combat | Anyone with vision on them |

### 10.3 Leak tests

Property tests build random states and check that no view contains anything it shouldn't: other players' hands, reserves, bureau modes, pending operations or hidden units. This runs in CI.

## 11. Cards as data

A card definition:

```json
{
  "id": "sabotage-crew",
  "name": "Sabotage Crew",
  "kind": "operation",
  "tags": ["covert"],
  "cost": { "ip": 2 },
  "difficulty": 2,
  "target": { "type": "installation", "owner": "other", "kinds": ["radar", "command", "power", "depot"] },
  "effects": [
    { "op": "disable", "target": "$target", "until": "endOfCombat" }
  ],
  "tension": 0,
  "blame": 0
}
```

**Effect primitives:** `damage`, `disable`, `modify`, `reveal`, `move`, `protect`, `transfer`, `cancel` (main design §14), plus bookkeeping primitives: `draw`, `discard`, `tension`, `blame`, `hostility` and `choice`.

- **`choice`** presents options to a player, each with its own effect list. Ultimatum, Verification Mission and global cards use it.
- **Timed effects** become `modifiers` in state, with an expiry. Rules check active modifiers instead of each card having its own code.
- **Targets** use a small filter language (owner, kind, adjacency, blame threshold, pariah, and so on), checked when the card is played and again when it resolves.
- A card that genuinely can't be expressed this way may have a small named handler, but this should stay rare. Needing one is a sign a primitive is missing.

## 12. Combat interface

```ts
buildCombatInput(state): CombatInput      // frozen at the crisis lock
createCombat(input, ruleset): CombatSim
sim.step(commandsForThisTick): TickEvents  // 20 ticks per second
sim.result(): CombatResult                 // damage, losses, ammunition used, launches, captures
applyCombatResult(state, result): GameState  // during aftermath
```

- The client steps the simulation in real time and interpolates between ticks for smooth drawing. The harness steps it as fast as possible.
- Combat commands (aiming, focus, withdraw) are tagged with a tick. Online, the server assigns the tick on arrival.
- **Before Milestone 1**, the harness uses the same simulation with autopilot only, no manual input. If that's too slow for large batches, an approximate resolver with the same interface can stand in, clearly marked as approximate.

## 13. Bots and autopilot

```ts
interface Bot {
  id: string;
  decide(view: PlayerView, decision: PendingDecision): Command[];
  combatTick?(view: CombatView, tick: number): Command[];
}
```

- **The first bots are utility planners** (main design §13). Their personality weights (builder, expansionist, defender, brinkmanship, spy, "the rock") are data files.
- Each bot draws random numbers only from its own `bot:<id>` stream, so bot matches are deterministic too.
- **Autopilot** is a shared module used by bots, by human players for anything they aren't aiming, by the accessibility option, and for disconnected players.
- Bots follow the same deadlines and defaults as humans.

## 14. Headless harness

A command-line runner:

```
nukka-sim --ruleset base-0.1 --patch cheaper-silos \
          --map basin-4p --bots builder,expansionist,defender,brinkman \
          --matches 500 --seed 1 --workers 8 --out results/run-001/
```

- Writes one JSON line per match, plus a summary report.
- **Metrics** follow the risks in main design §16: score by bot style, round of first nuclear use and whether it paid off, tension curve, how often release was open but unused, covert success and exposure rates, resource curves, shortages, eliminations, and the leader's income lead against final result.
- **Sweeps:** `--sweep tension.floorCap=75,90,100` runs the same matches for each value.
- Any match can be exported as a replay and watched in the client once it exists.

## 15. Testing

| Kind | What it checks |
|---|---|
| **Unit tests** | Each rule in isolation (Vitest) |
| **Acceptance tests** | Every "Acceptance tests" list in the planning specs becomes a test file |
| **Property tests** | Invariants under random play: never more than 4 cards in a chain, reaction points never overspent, T ≥ F, reserves within caps, no view leaks, the same seed always giving the same hash |
| **Golden replays** | Saved match logs that must reproduce their recorded hashes. A ruleset change that breaks one is either a bug, or is re-approved on purpose. |
| **Harness smoke run** | 50 bot matches in CI: no crashes, no stuck decisions, no invalid commands from bots |

## 16. Later: online play (Milestone 6)

The same core runs on an authoritative server. Clients send commands over WebSocket and receive views and events. Combat commands are stamped with the server tick, with a small fixed input delay. Fair aiming under network lag (input timestamps or server rewind) is an open question for that milestone.

## 17. Milestone 0: the headless strategic game

The build order that follows from this spec:

1. Monorepo skeleton, lint rules, CI.
2. Core foundations: integer math, RNG streams, state hashing, the command and event framework.
3. Ruleset, map and card loaders with Zod schemas; the `base-0.1` ruleset and `basin-4p` map as data.
4. The strategic state machine: upkeep, planning, intelligence, events (chains), crisis, aftermath, match end.
5. `viewFor` and the leak tests.
6. Autopilot-only combat (or the marked approximate resolver).
7. Simple bots and the harness, with metrics.
8. First balance pass from harness results.

**Done when:** 4 bots play 500 complete matches on the test map without errors or stuck decisions, replays reproduce exactly, and the metrics report gives readable numbers for every §16 risk.

## 18. Decisions

| Question | Decision |
|---|---|
| Renderer | PixiJS |
| Dev tuning panel | Wanted in the client from the start of client work, not only in the harness |
| Combat speed in the harness | Unknown until measured. Start with the real autopilot simulation, and add the approximate resolver only if the harness is too slow. |
| Automation | Every check (lint, typecheck, tests, harness smoke run) runs from one command locally, in cloud sessions and in CI |
