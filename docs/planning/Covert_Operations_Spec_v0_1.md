# Covert Operations — Draft Spec v0.1

Replaces the spying rules in `Tension_and_Diplomacy_Spec_v0_1.md` §6 and changes the Covert cards in `Base_Deck_v0_1.md`.

**Status:** design locked for the first playtest. The numbers are starting values that playtests will tune.

## 1. The problem

If a covert card is played like any other card, the timing gives away who played it: it went off on Aster's turn, so it was Aster. A human opponent knows at once, and so does everyone watching. The "nobody can prove it" rule means nothing if everyone can see it.

There are three leaks to close:
1. **Turn timing:** the effect happens during the player's own action.
2. **Visible play:** you can see someone play a card, and their hand gets smaller.
3. **Reactions:** a reaction chain is public, so answering a covert card with *Security Sweep* shows who started it.

## 2. The fix in one paragraph

Covert operations no longer use main actions or reaction chains. During planning, **every player secretly places one face-down marker each round** in their shadow slot, whether it's a real operation, a passive countermeasure, or a blank. Real operations go off after a **delay of 1–3 rounds**, at a fixed point in the round, in random order, credited to an "unknown actor." Defense is passive: hidden counter-intelligence spending and face-down countermeasures. Both sides pay for it from a new resource, **Intelligence**.

## 3. Intelligence: a small economy

**Intelligence (IP)** is a sixth economic measure, alongside production, food, water, power and supplies (main design §2).

| Source | Per upkeep |
|---|---|
| Every government (baseline) | +2 IP |
| Command installation (operational) | +1 IP |
| **Intelligence bureau** in **Foreign** mode | +2 IP |
| **Intelligence bureau** in **Domestic** mode | +3 free CI each round (§6.1), no IP |

**Intelligence bureaus** are a new installation. Each uses a development site and needs power. A country can own **at most 2**.

- **Bureau mode is hidden.** Opponents can see that you have a bureau, but not whether it's spying abroad or guarding at home. You may switch a bureau's mode during planning; the change takes effect at the next upkeep.
- Your IP reserve is capped at **10**. Anything above that is lost.
- Each player's IP reserve is **hidden**.
- A damaged command installation or bureau produces nothing that upkeep. Bombing a rival's bureau is a legitimate way to blind them, or to open them up.

IP is spent on four things: running operations (§5), boosting them (§5.1), counter-intelligence (§6.1) and accusations (§7).

### 3.1 Three ways to play

The numbers are set so that each of these styles is viable:

| Style | Setup | Income | What it can do each round |
|---|---|---|---|
| **Balanced** | 1 bureau, Foreign | 5 IP | One operation (for example Sabotage Crew, 2 IP) and still keep CI 3, which stops every unboosted operation |
| **Full spy** | 2 bureaus, Foreign | 7 IP | Two operations per round, often boosted, with little left for defense |
| **The rock ("Sweden")** | 2 bureaus, Domestic | 3 IP + 6 free CI | CI 6 at no cost, or up to 9 by spending its income. This stops almost everything. Only a maxed-out operation (§5.1) gets through, and it costs the attacker nearly a full reserve. |

The rock pays for its safety: two development sites spent on bureaus that produce no IP, and almost nothing to attack with. Since bureau modes are hidden, rivals can't tell a rock from a spy until operations start failing, or succeeding.



## 4. Shadow slots

### 4.1 Placement

During planning (main design §3B), at the same time as everyone else, each player places **one shadow marker**, or **two if they own at least one operational intelligence bureau** (in either mode). A marker is one of:

| Marker | What it is |
|---|---|
| **Operation** | A covert card from hand, with its target, the IP paid, and a chosen fuse (§4.2) |
| **Countermeasure** | A passive defensive card from hand (§6.2) |
| **Blank** | A free cover token. You have unlimited blanks. |

Placement is **mandatory**: every player places their full number of markers every round, so placing something reveals nothing. The interface treats every placement the same way, with the same animation and timing.

### 4.2 Fuse

Each operation has a **fuse of 1–3 rounds** that sets when it goes off:
- **By default the fuse is random:** the engine rolls 1–3 using the match's seed when the operation is placed. Not even the owner knows the exact round.
- **Precise timing:** pay **+1 IP** to choose the exact round yourself. This is how you line up a radar sabotage with your own raid. It costs extra and still has a delay.

### 4.3 What stays hidden

- **Hand sizes are hidden** from opponents, so playing a card into the shadow slot can't be counted.
- No queue is shown. Players never see how many operations are pending anywhere in the world, only their own.
- Covert cards are never discarded face up. Spent and foiled covert cards go to a separate face-down discard pile.

## 5. Resolution: the intelligence step

The **intelligence step** happens at the start of the event phase (main design §3C), before any main actions:

1. Collect every operation whose fuse runs out this round, from all players.
2. **Shuffle them** with the seed and resolve them one at a time.
3. Check each against the target's defenses (§6). It then **succeeds**, **fails**, or **fails and is exposed**.
4. Report the result:
   - **The target and every other player** see the public effect, credited to "unknown actor": "East Radar disabled by an unknown actor." Only effects visible on the board are public; a successful *Reconnaissance* has no public effect at all.
   - **The owner** privately sees the full outcome.
   - An operation that fizzles because its target no longer exists or is no longer valid refunds nothing. Only its owner is told.

Once the intelligence step is over, the victim may play an ordinary defensive response to the *effect*, for example *Emergency Relay* after a radar is disabled. This doesn't reveal anything about who did it.

### 5.1 Boosting operations

When placing an operation, you may pay extra IP to make it harder to stop. **Each extra IP adds +1 to its difficulty, up to +5.** *Inside Agent* adds +2 more.

The strongest possible operation is difficulty 3, plus Inside Agent (+2), plus a full boost (+5), for a difficulty of 10. It costs 3 + 1 + 5 = **9 IP**. That beats a rock running its normal CI of 9, but not a rock that has also emptied its reserve into CI that round.

### 5.2 Tension and blame

- An operation that succeeds or fails **without exposure** causes no blame. Tension changes only if the card prints **visible-effect tension** (for example, the unrest from *Arm the Insurgents*); nobody is blamed for it.
- An **exposed** operation reveals its owner to everyone and applies the exposure penalty: **+4 tension, +2 blame, +2 hostility from the target**, plus any blame printed on the card.

## 6. Defense

### 6.1 Counter-intelligence (CI)

During planning, each player secretly sets aside IP as **counter-intelligence** for this round. It is spent whether or not anything happens. Each operational bureau in Domestic mode adds +3 free CI.

**CI protects your whole country.** One number covers every territory, treaty and asset you own.

Each operation has a **difficulty**: the number printed on the card, plus any boost and Inside Agent. When it resolves against you:

| Comparison | Result |
|---|---|
| Your CI is below the difficulty | The operation **succeeds** |
| Your CI is at or above the difficulty | The operation **fails**; you learn that it happened and its type, but not who did it |
| Your CI is at least the difficulty + 2 | The operation **fails and its owner is exposed** |

This is deterministic, with no dice. The uncertainty comes from the fact that nobody knows anyone else's CI. Every IP spent on defense is IP not spent on operations, and that is the economy.

### 6.2 Countermeasures

A countermeasure card sits face down in your shadow slot until it triggers or expires after **3 rounds**. The first operation against you while it is active is **canceled and its owner is exposed**, whatever your CI is. The countermeasure is then discarded.

Countermeasures are the passive, invisible cards that let you set a trap.

## 7. Accusations

Players will still suspect someone; only Brine gains from Cinder's radar going down. Suspicion is fine. An accusation lets you act on it:

- **Once per round**, during planning, for **1 IP**, publicly accuse one player of one specific covert effect against you from the last 3 rounds.
- **If you're right:** the accused is exposed for that operation and takes the full exposure penalties.
- **If you're wrong:** you gain **+2 blame**, and the accused's hostility toward you rises by 2.

The engine checks accusations against the true record, so they can't be bluffed. Bots use the same rule and only know what a human in their position would know.

## 8. Covert cards under these rules

These replace the matching entries in `Base_Deck_v0_1.md`.

| Card | Kind | IP cost | Difficulty | Effect when it succeeds | Visible-effect tension |
|---|---|---|---|---|---|
| **Sabotage Crew** | Operation | 2 | 2 | Disable one radar, command, power or depot installation until the end of that round's combat | 0 |
| **Reconnaissance** | Operation | 1 | 1 | Privately see the target's nuclear breakdown and submarine and patrol positions until the next upkeep; reveals *Covert Program* assets | 0 |
| **Arm the Insurgents** | Operation | 3 | 3 | Target territory is contested for 2 rounds (out of supply; garrison −1 formation) | +8 (unrest is public; the source isn't) |
| **Spoiler** | Operation | 2 | 3 | End one treaty between two other players with no breach penalty; the cooldown applies; hostility between them +1 | +2 |
| **Inside Agent** | Placed with an operation (doesn't use a shadow slot) | 1 | — | That operation ignores countermeasures, and its difficulty counts as 2 higher against CI | — |
| **Security Sweep** | Countermeasure | 0 | — | Cancels and exposes the first operation against you within 3 rounds | — |
| **Covert Program** | Played with your own nuclear build (not a shadow marker) | 2 | — | Unchanged: the build has no spike or posture change until revealed | — |

*Inside Agent* gives an attacker a way to play around defenses they can't see: the target needs 2 more CI to foil the operation.

*Destabilize Government* stays a **public** card. It is a political act done openly, so it uses the normal chain. Since Security Sweep is now a countermeasure, Destabilize is answered by *Hotline* (stabilization) or by accepting it.

## 9. What players can still work out

The design doesn't stop players from reasoning about motive, and it shouldn't:
- Motive and benefit are still visible. Players can suspect, and the accusation rule lets them act on it at a cost.
- A player who sets precise timing to line up with their own raid gives a clue. That's a tradeoff they chose.
- An intelligence bureau shows on the board that a player can run operations, but not whether they are doing so.

## 10. Interface

- Planning shows the shadow slot as a fixed number of positions that must be filled. "Fill with blanks" is one click.
- A private "Operations desk" panel shows your own pending operations, fuses, countermeasures and IP.
- Intelligence step reports use unattributed wording: "Unknown actor sabotaged East Radar · Foiled: an attempt to arm insurgents in Westmarch."
- An accusation preview shows the cost and the risk if you're wrong before you confirm.

## 11. Acceptance tests

- Every player places the same number of shadow markers per round as their bureau ownership allows, and no placement can be told apart from another in the state sent to other clients.
- Hand sizes, IP reserves, CI and pending operations never reach opponents' clients or bot inputs.
- Operations resolve only during the intelligence step, in seeded random order, and never during the owner's action.
- Random fuses are reproduced exactly in replays.
- CI results match the threshold table exactly; there is no hidden roll.
- A wrong accusation always costs the accuser; a correct one always exposes the accused.

## 12. Decisions so far

| Question | Decision |
|---|---|
| Shadow markers per round | One, or two with an intelligence bureau |
| Where CI applies | The whole country |
| Viable styles | Balanced, full spy and "the rock" are all supported by the numbers (§3.1) |
| Intelligence economy | Locked for the first playtest: baseline +2 IP, command +1, up to 2 bureaus with hidden Foreign (+2 IP) or Domestic (+3 CI) mode, boosts up to +5, reserve cap 10 |

## 13. Later ideas (not in the base game)

- **Territory-level pressure campaigns.** Focusing covert pressure on one territory over many rounds to prepare a war there, like the unmarked "little green men" before a real invasion. Tactically interesting, but held back until we know how much complexity the base game can carry.
- **Burned networks:** repeated exposure makes a player's later operations easier to catch.
- **Allied intelligence sharing:** pooled CI or joint operations.
