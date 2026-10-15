# Covert Operations — Draft Spec v0.1

Replaces the spying rules in `Tension_and_Diplomacy_Spec_v0_1.md` §6 and changes the Covert cards in `Base_Deck_v0_1.md`.

All numbers are starting values for playtesting, not balance.

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

| Source | IP per upkeep |
|---|---|
| Command installation (operational) | +1 |
| **Intelligence bureau** (new installation; uses a development site; needs power) | +2 |

- Your IP reserve is capped at **8**. Anything above that is lost.
- Each player's IP reserve is **hidden**. Bureaus are visible on the board, so opponents can estimate how much a player earns but not how much they've saved.
- A damaged command installation or bureau produces nothing that upkeep. Bombing a rival's bureau is a legitimate way to blind them.

IP is spent on three things: running operations (§5), counter-intelligence (§6.1) and accusations (§7).

## 4. Shadow slots

### 4.1 Placement

During planning (main design §3B), at the same time as everyone else, each player places **one shadow marker**, or **two if they own an operational intelligence bureau**. A marker is one of:

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

### 5.1 Tension and blame

- An operation that succeeds or fails **without exposure** causes no blame. Tension changes only if the card prints **visible-effect tension** (for example, the unrest from *Arm the Insurgents*); nobody is blamed for it.
- An **exposed** operation reveals its owner to everyone and applies the exposure penalty: **+4 tension, +2 blame, +2 hostility from the target**, plus any blame printed on the card.

## 6. Defense

### 6.1 Counter-intelligence (CI)

During planning, each player secretly sets aside IP as **counter-intelligence** for this round. It is spent whether or not anything happens. An operational intelligence bureau adds +1 free CI.

Each operation has a **difficulty** (printed on the card). When it resolves against you:

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

## 12. Open questions

1. Is one shadow marker per round (two with a bureau) enough activity, or too little?
2. Should CI protect specific territories rather than the whole country?
3. Should repeated exposure make a player's later operations easier to catch, as burned spy networks would be?
4. Should allies be able to share CI, or pool IP for a joint operation?
