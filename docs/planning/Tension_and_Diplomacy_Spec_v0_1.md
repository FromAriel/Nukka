# Tension and Diplomacy — Draft Spec v0.1

Companion to `Turn_Based_Escalation_Game_Design_v0_1.md` §5. This spec defines what moves global tension, how nuclear release is authorized, and what diplomatic actions and treaties actually do.

All numbers are starting values for playtesting, not balance.

## 1. Design goals

- **The arms race itself is destabilizing.** Building nuclear capability raises tension even if nobody is fighting. A world full of silos never feels calm.
- **Escalation is mostly a choice.** Players raise tension through visible, attributable acts: declaring war, destabilizing governments, building weapons, breaking treaties. Someone can deliberately set the world on fire, and everyone will know who did it.
- **De-escalation is real but bounded.** Diplomacy, transparency and peacemaking cool the crisis, but they can't talk away an arsenal. Only disarmament lowers the hard floor.
- **Every change is explained.** The tension track shows a log of each change: who caused it, why and how much.

## 2. The tension track

Global tension **T** runs from 0 to 100. It has a **floor F** set by the world's total nuclear posture. T can never go below F.

| Band | Effect (from main design §5) |
|---|---|
| 0–39 | Routine competition |
| 40–79 | Open crisis; aggressive cards and actions carry larger printed consequences |
| 80–99 | Crisis vote each round: a strict majority can open nuclear release |
| 100 | Release opens without a vote |

The match starts at **T = 10** unless a scenario sets otherwise.

### 2.1 Two kinds of tension change

1. **Spikes:** one-time changes from acts such as building a silo, declaring war or playing a destabilizing card. They are applied immediately and logged with the responsible player.
2. **Floor:** a standing minimum produced by the arsenals that exist. Building weapons raises it and dismantling them lowers it. Diplomacy and natural cooling cannot push T below it.

This is how arsenal size stays a lasting factor without making tension climb automatically every round.

### 2.2 Nuclear posture and the floor

Each nuclear-capable asset a player owns contributes **posture points (PP)**:

| Asset | PP each | Notes |
|---|---|---|
| Missile silo | 6 | Counts whether loaded or empty; outsiders can't verify it |
| Nuclear submarine | 6 | Equal to a silo: survivable launch capacity |
| Missile warhead (stockpiled or loaded) | 2 | |
| Nuclear-capable bomber formation | 3 | |
| Nuclear gravity bomb | 1 | |

**Floor F = total world PP ÷ number of starting players, rounded down, capped at 75.**

Dividing by player count lets the same formula work at 2–4 players. The cap at 75 means building alone can never reach the crisis vote at 80; it takes an act to get there.

Example: four players, each with 2 silos, 1 submarine, 6 warheads, 2 bombers and 4 bombs = 12 + 6 + 12 + 6 + 4 = **40 PP each**. The floor is 40, so the world is permanently in open crisis until somebody disarms.

Each player's PP total is **public** as a single number; intelligence agencies track postures. The breakdown (how many warheads, which silos are loaded) is not public; see §6 on spying.

### 2.3 Buildup spikes

Each development order that adds nuclear capability also adds a one-time spike, attributed to the builder:

| Development order | Tension spike |
|---|---|
| Build a missile silo | +8 |
| Commission a nuclear submarine | +8 |
| Deploy a warhead batch | +5 |
| Deploy a nuclear-capable bomber formation | +4 |
| Deploy a nuclear gravity bomb batch | +3 |

Loading an existing warhead into a silo or onto a bomber causes no spike; it was already counted. Drafting or committing a nuclear plan causes no spike either, because plans are hidden. Since each player gets two development orders per round, one player can add at most +16 per round from buildup.

## 3. Conflict and aggression

### 3.1 War status

Each pair of players has one relationship state:

| State | Meaning |
|---|---|
| **Peace** | Default. No hostile operations. |
| **Treaty** | At least one active treaty (§5). Hostile operations break it. |
| **Hostile** | Former belligerents, or a ceasefire is in force. Hostile operations require re-declaring war. |
| **At war** | Hostile operations are allowed without a further declaration. |

Declaring a hostile operation (ground assault, air raid, missile raid, interdiction, or a hostile card that names war as a requirement) against a player you're not at war with **automatically declares war**. You don't need a separate card or action.

### 3.2 Aggression spikes

| Act | Tension | Blame (§4) |
|---|---|---|
| Declare war (alongside the first operation) | +12 | +2 |
| Surprise attack: declare war on a player you have a treaty with | +12, plus the treaty-breach spike | +2, plus breach blame |
| Ground assault, air raid or interdiction while at war | +2 | — |
| Conventional missile raid while at war | +3 | — |
| Any operation that targets a population center or civilian installation | +3 more | +1 |
| Capture another player's starting territory | +5 | — |
| Break a treaty (§5.3) | +10 | +3 |
| Vote Authorize in a crisis vote | +0 | +1 |
| First nuclear launch in the match | Set T to 100; release becomes permanently available (§7) | +5 |

Declaring war does not make nuclear war automatic. It moves the whole world much closer.

### 3.3 Card-driven tension

Event cards print their own tension and blame values. Guidelines for card design:

| Card weight | Tension | Examples |
|---|---|---|
| Minor pressure | +2 to +4 | Propaganda Broadcast, Border Exercise, Trade Embargo |
| Major destabilization | +6 to +10 | Destabilize Government, Arm the Insurgents, Nuclear Test |
| Setting the world on fire | +15 to +25 | Ultimatum, Full Mobilization, Doomsday Rhetoric |
| De-escalation | −3 to −8 | Peace Envoy, Hotline, Summit, Verification Mission |

The pattern for aggressive cards is **a benefit for the player, damage to a rival, and a tension spike for everyone.** Example:

> **Destabilize Government** — Main action. Target player loses one development order next round and discards one card at random. You draw one card. **+8 tension, +2 blame.** Response: Security Sweep cancels the effect; the tension and blame still apply because the attempt was public.

A canceled aggressive card still applies its printed tension unless the card says otherwise, so the attempt itself is destabilizing (main design §4).

## 4. Blame and hostility

These are separate from tension. Tension is global; blame and hostility are about specific players.

**Blame** is a public number for each player. It accumulates from the Blame column above and from card text. It falls by 1 at each upkeep in which that player gained no new blame.

Blame does not change score. It:
- weights AI target selection and its willingness to join coalitions against a high-blame player,
- unlocks cards that need a blamed target (for example, *Sanctions* requires the target to have blame 5 or more),
- is shown on the crisis screen next to each country.

**Hostility** is a directed 0–10 value per pair of players: how much A resents B. It rises when B harms A and falls through treaties and diplomacy. It mainly drives AI behavior. Humans see it but are never forced by it (main design §5).

## 5. Diplomacy

### 5.1 Diplomatic proposals

A proposal is a **main action** aimed at one player, or two for mediation. It uses the normal event tray:

- **Root:** the proposal.
- **Response:** the target must Accept or Decline, which costs no card or reaction point (the non-card answer rule), or may play a legal response card instead.
- **Counter and stabilization:** these work as normal; for example, a third party may play *Spoiler* to sabotage a treaty.

A declined proposal has no cost beyond the main action spent.

### 5.2 Diplomatic missions (no treaty)

| Mission | Effect if accepted | Tension |
|---|---|---|
| **Peace envoy** | Both players' hostility toward each other −2 | −4 |
| **Mediation** (target two players at war with each other) | Both must accept. They enter a 3-round ceasefire. The mediator's blame −2 and the mediator draws 1 card. | −8 |
| **Open verification** (invite a rival to inspect you) | The rival sees your full nuclear breakdown | −3 |

### 5.3 Treaties

Treaties last until broken or until their stated duration ends. Breaking any treaty applies **+10 tension and +3 blame**, plus **+3 hostility** from every other signatory.

| Treaty | Signed by | Effect | Tension on signing |
|---|---|---|---|
| **Non-aggression pact** | Two players at peace | No hostile operations or hostile cards between them | −3 |
| **Defensive agreement** | Two players | Each may fill the stabilization slot for the other (main design §4). Each one's defense batteries may engage threats over the partner's territory within existing coverage. When one is attacked, the other gets an **honor call** (§5.4). | 0 |
| **Trade agreement** | Two players | At each upkeep, each may transfer up to 2 food, water or supplies to the other, even without a connected supply network. Hostility −1 each round. | −2 |
| **Ceasefire** | Two players at war | No hostile operations or nuclear launches between them for 3 rounds; then they become Hostile, not At war | −8 |
| **Arms control** | Two or more players | Each signatory dismantles nuclear assets worth at least 6 PP within 2 rounds. The floor is recalculated as items are removed. | −6 |
| **Settlement** | All viable players | Ends the match (main design §1) | — |

### 5.4 Honor calls

When a defensive-agreement partner is attacked, the ally chooses during the final commitment step:

- **Honor:** declare war on the aggressor at **+4 tension and no blame**, instead of the usual +12 and +2.
- **Decline:** no war. The partner's hostility toward the ally rises by 2, and the partner may end the agreement without breach penalties.

### 5.5 Disarmament

Dismantling a nuclear asset uses one **development order**. It removes the asset's PP from the floor and applies a tension drop equal to **half that asset type's buildup spike**, rounded down (a silo gives −4). This is the only unilateral way to lower the floor.

## 6. Spying

Intelligence cards interact with the hidden nuclear breakdown:

- **Success** reveals information (warhead counts, which silos are loaded, the general location of a submarine) or applies a sabotage effect. A successful covert operation adds no tension, because nobody knows it happened.
- **Exposure:** if the spy card is canceled (for example by Security Sweep), the spying player takes **+4 tension, +2 blame, and +2 hostility from the target**.
- **Covert Program** (card): one nuclear build without its public spike or PP change. It is revealed if any spy mission inspects that player, or automatically when the asset is first used. When revealed, it applies **1.5× the original spike, plus 3 blame**.

Being able to see an opponent's breakdown matters because it supports bluffing: a high posture number may hide empty silos.

## 7. Nuclear release

### 7.1 Crisis check

This happens at step D of each round, after all main actions are resolved:

| Tension | Result |
|---|---|
| Below 80 | Release locked for this combat window |
| 80–99 | Crisis vote |
| 100 | Release open; no vote |

Release is opened **for the coming combat window only** and is checked again every round. Opening release never fires a weapon.

### 7.2 Crisis vote rules

- **Eligible voters:** every player with a viable country.
- **Voting:** simultaneous and secret, then all votes are revealed together. Each Authorize vote adds +1 blame.
- **Threshold:** strictly more than half of eligible voters. **Ties fail.**
- **Two-player games:** at 80–99, both players must authorize. This is intentional: either player alone can hold release until tension reaches 100.
- **Disconnected or timed-out players vote Hold.** A disconnect never creates authorization.
- **AI** players vote according to their personality weights and current threats.

### 7.3 Nuclear aftermath state

After the first launch:
- The match is permanently in the aftermath state. Release is open every round regardless of tension; tension stays at 100 and natural cooling stops.
- **Ceasefire** treaties still bar launches between their signatories.
- **Global moratorium:** a treaty signed by every viable player that closes release for all of them. Breaking it applies **+10 blame**, and every other signatory's hostility toward the breaker goes to 10.

## 8. Natural cooling

At each upkeep, tension above the floor falls by:

| Previous combat window | Cooling |
|---|---|
| No combat | −4 |
| Conventional combat only | −1 |
| Any nuclear launch | 0 (and the aftermath state applies anyway) |

## 9. Order of operations in a round

1. **Upkeep:** natural cooling, blame decay, and the floor recalculated from current inventories.
2. **Planning:** buildup and dismantling spikes are applied when development orders resolve.
3. **Events:** card, operation and diplomatic spikes are applied as each chain closes, in initiative order.
4. **Crisis:** crisis check, vote if needed, honor calls, final commitments.
5. **Combat:** launches and in-combat triggers (first launch → aftermath state).
6. **Aftermath:** spikes for captures and civilian strikes are applied; the log is summarized.

After every change, T is set to max(T, F) and then capped at 100.

## 10. Interface requirements

- The tension track shows **T, F, the band thresholds and a change log for this round**: "+8 Aster built a silo · +12 Cinder declared war on Brine · −4 cooling."
- Before any action, the preview shows its **tension change, blame change, and whether it would cross a band threshold**. Example: "This will raise tension to 83. A crisis vote will be held this round."
- The relationship panel shows each pair's state, active treaties, and hostility in both directions.
- The posture panel shows each player's public PP and whatever breakdown you have verified.

## 11. Example round

Tension starts at 52 with a floor of 34. Aster builds a silo (+8, giving 60; the floor rises to 35). Cinder declares a ground assault on Brine, who has a non-aggression pact with Cinder. That is a surprise attack: +12 for declaring war and +10 for the breach, giving 82, with blame +5 for Cinder. Dara, Brine's defensive partner, honors the call (+4, giving 86).

At the crisis check, tension is 86, so a vote is held. Aster and Cinder authorize; Brine and Dara hold. That is a 2–2 tie, which fails, so release stays locked. The fighting is conventional. Next upkeep cools tension by only 1, to 85, so another vote will come next round unless someone de-escalates.

## 12. Dependencies on the main design

- **Submarines need sea zones.** The current map is territories only. Proposal: add sea zones next to coastal territories, with submarine positions hidden by default.
- **Viability** must be precisely defined (main design §1) because it sets who can vote.
- Milestone 4 should include this spec: the tension track, floor, crisis vote, treaties that affect launches, and the aftermath state.

## 13. Acceptance tests (for Milestone 4)

- Building and dismantling update both the spike and the floor, and T never falls below F.
- Floor alone never exceeds 75, so it can never trigger a crisis vote by itself.
- A canceled aggressive card still applies its printed tension.
- Ties and disconnected players never authorize release; in 2-player games at 80–99, one Hold blocks release.
- Release reverts to locked when T drops below 80 and no launch has occurred.
- After the first launch, release stays available and ceasefires still block launches between signatories.
- Every tension change appears in the log with a source and an amount.

## 14. Open questions

1. Should high blame affect score, or stay purely political? (Current answer: political only.)
2. Is a floor cap of 75 right, or should a big enough arms race reach the crisis band by itself?
3. Should public PP be exact, or a rounded band ("low / moderate / high")?
4. Does mediation need a stronger reward to be worth spending a main action on?
5. Do submarines need an anti-submarine counter in the base game, or only in a later module?
6. What should 2-player games use instead of a majority vote? Is the "both must authorize" rule fun or just a stalemate?
