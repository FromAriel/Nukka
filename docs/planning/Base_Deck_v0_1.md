# Base Deck — Draft v0.1

The first 24 card designs, following main design §4 (event chains) and §14 (cards as data), and the tension rules in `Tension_and_Diplomacy_Spec_v0_1.md`.

All numbers are starting values for playtesting, not balance.

## 1. How to read a card

| Field | Meaning |
|---|---|
| **Slot** | Where the card can be played: **Root** (uses your main action), **Response** (affected player), **Counter** (the original initiator), **Stabilization** (defender or a consenting ally), or **Global** (a root whose effect asks every player to make a simultaneous choice and can't be interrupted) |
| **Tags** | Used by other cards to decide what they can answer: *Covert, Economic, Military, Political, Nuclear, Diplomatic* |
| **Target** | What the card must name. Targets are checked when the card is played and again when it resolves. |
| **Effect** | What happens if the card resolves |
| **Tension / Blame** | Applied when the chain closes. **For aggressive cards these apply even if the card is canceled**, except for Covert cards (see below). |
| **Answered by** | Cards in this deck that can respond to it. Every root also has a non-card answer (accept the effect, or the choice printed on the card). |
| **Primitives** | The effect vocabulary the card uses (main design §14): damage, disable, modify, reveal, move, protect, transfer, cancel |

Every reaction costs 1 reaction point plus the card itself (main design §4).

### Covert cards

Covert cards follow the spying rules (tension spec §6):
- If a Covert card **resolves**, it adds no tension or blame, because nobody can prove who did it. The target knows what happened, but not who did it.
- If it is **canceled**, the player who played it is **exposed**: +4 tension, +2 blame and +2 hostility from the target. Any tension or blame printed on the card applies too.

### Crisis band rule

While tension is **40 or higher** (open crisis), every positive tension value printed on a card increases by **+2**. This puts into practice the "larger consequences" in the open-crisis band.

## 2. The 24 cards

### Pressure (6)

**1. Propaganda Broadcast** — Root · *Political*
- **Target:** one player.
- **Effect:** every *other* player's hostility toward the target rises by 1. Your blame falls by 1.
- **Tension** +2 · **Blame** 0
- **Answered by:** Hotline (stabilization).
- **Primitives:** modify.

**2. Trade Embargo** — Root · *Economic*
- **Target:** one player.
- **Effect:** the target can't send or receive trade transfers for 2 rounds and loses 2 supplies at the next upkeep. Any trade agreement between you ends without breach penalties, and the re-signing cooldown applies.
- **Tension** +3 · **Blame** +1
- **Answered by:** Smuggling Network.
- **Primitives:** modify, damage.

**3. Sanctions** — Root · *Economic*
- **Target:** a player with blame 5 or higher.
- **Effect:** the target loses 2 production at each of the next 2 upkeeps.
- **Tension** +2 · **Blame** 0 (sanctioning a blamed player is seen as justified)
- **Answered by:** Smuggling Network.
- **Primitives:** damage.

**4. Global Embargo** — Global · *Economic*
- **Target:** a pariah (blame 10 or higher).
- **Effect:** every other player chooses **Join** or **Abstain**. For each player who joins, the pariah loses 1 production and 1 supplies at each of the next 2 upkeeps. Joiners can't trade with the pariah during that time. Your blame falls by 1.
- **Tension** +3 · **Blame** 0
- **Answered by:** none (global cards can't be interrupted).
- **Primitives:** damage, modify.

**5. Ultimatum** — Root · *Political, Military*
- **Target:** a player who owns a non-starting territory adjacent to yours. Name that territory.
- **Effect:** the target chooses:
  - **Yield:** the territory becomes yours. Its garrison moves to an adjacent friendly territory, or is lost if there is none. The target's hostility toward you rises by 3.
  - **Refuse:** you may declare war on the target this round **without the usual declaration tension or blame**; this card already paid for it. Your first ground assault on the named territory this round gets **+1 formation command**.
- **Tension** +15 · **Blame** +3
- **Answered by:** Hotline (stabilization).
- **Primitives:** transfer, modify.

**6. Doomsday Rhetoric** — Global · *Political, Nuclear*
- **Requires:** you own at least one nuclear-capable asset.
- **Effect:** every other player chooses: **pay you 2 production or 2 supplies**, or **refuse** (their hostility toward you rises by 2). You draw 1 card.
- **Tension** +20 · **Blame** +3
- **Answered by:** none.
- **Primitives:** transfer, modify.

### Subversion and intelligence (7)

**7. Destabilize Government** — Root · *Political*
- **Target:** one player.
- **Effect:** the target loses one development order next round and discards one card at random. You draw 1 card.
- **Tension** +8 · **Blame** +2
- **Answered by:** Security Sweep (cancels the effect; the tension and blame still apply).
- **Primitives:** modify, damage.
- *Not Covert:* the attempt is public, so it always costs tension and blame.

**8. Arm the Insurgents** — Root · *Covert, Military*
- **Target:** one territory owned by another player.
- **Effect:** the territory becomes **contested** for 2 rounds: it is cut out of its owner's supply network, and its garrison immediately loses 1 formation.
- **Tension** +8 · **Blame** +2. The tension applies either way, because the unrest is visible. The blame applies only if the card is exposed.
- **Answered by:** Security Sweep.
- **Primitives:** disable, damage.

**9. Sabotage Crew** — Root · *Covert*
- **Target:** one radar, command, power or depot installation owned by another player.
- **Effect:** the installation is disabled until the end of this round's combat window.
- **Tension** 0 · **Blame** 0 (exposure penalties if canceled)
- **Answered by:** Security Sweep; Emergency Relay (stabilization) if the target was radar or command.
- **Primitives:** disable.

**10. Reconnaissance** — Root · *Covert*
- **Target:** one player.
- **Effect:** until the next upkeep, you see the target's full nuclear breakdown and the positions of all their submarines and patrols. This also reveals any *Covert Program* assets they have, which triggers that card's reveal penalty for them.
- **Tension** 0 · **Blame** 0 (exposure penalties if canceled)
- **Answered by:** Security Sweep.
- **Primitives:** reveal.

**11. Covert Program** — Root · *Covert, Nuclear*
- **Target:** none (it affects only you).
- **Effect:** immediately carry out one nuclear build, paying its normal cost and using a development order. It causes **no tension spike and no change to your public posture** until it is revealed. It is revealed by *Reconnaissance*, by accepting *Verification Mission*, or automatically when the asset is first used. When revealed, it applies **1.5× its normal spike (rounded down) and +3 blame**.
- **Tension** 0 until revealed · **Blame** 0 until revealed
- **Answered by:** none (no target, so the response slots are skipped).
- **Primitives:** modify.

**12. Security Sweep** — Response · *Covert*
- **Target:** a Covert card (or *Destabilize Government*) aimed at you, your territory or a treaty you are part of.
- **Effect:** cancel that card. If it was Covert, its player is exposed.
- **Tension** 0 · **Blame** 0
- **Answered by:** Inside Agent (counter).
- **Primitives:** cancel.

**13. Inside Agent** — Counter · *Covert*
- **Target:** a response card played against your root.
- **Effect:** cancel that response card.
- **Tension** 0 · **Blame** 0
- **Answered by:** nothing directly. The defender may still use the stabilization slot.
- **Primitives:** cancel.

### Mobilization (4)

**14. Full Mobilization** — Root · *Military*
- **Target:** none.
- **Effect:** this round you get **+1 repositioning order** and **+1 development order** (military units or ammunition only), and your military units pay **no supply upkeep** at the next upkeep.
- **Tension** +18 · **Blame** +2
- **Answered by:** none.
- **Primitives:** modify.

**15. Border Exercise** — Root · *Military*
- **Target:** a player whose territory borders yours.
- **Effect:** move up to two of your stacks into one of your territories bordering the target, without using your repositioning order. The target's hostility toward you rises by 1.
- **Tension** +3 · **Blame** 0
- **Answered by:** Hotline (stabilization).
- **Primitives:** move, modify.

**16. Nuclear Test** — Root · *Nuclear*
- **Requires:** you own at least one warhead. **Destroy one of your warheads** (−2 posture points).
- **Effect:** until the end of the next round, any player who declares war on you takes **+6 extra tension and +1 extra blame**.
- **Tension** +8 · **Blame** +1
- **Answered by:** none.
- **Primitives:** damage (your own warhead), modify.

**17. Rapid Resupply** — Response or Stabilization · *Military*
- **Target:** a hostile operation or card aimed at one of your territories.
- **Effect:** refill the magazines of up to 2 defense batteries in that territory, even without a supply connection.
- **Tension** 0 · **Blame** 0
- **Answered by:** Inside Agent (only when played as a response).
- **Primitives:** transfer.

### Defense and resilience (3)

**18. Emergency Relay** — Stabilization · *Military*
- **Target:** your own, or a defensive partner's, radar or command installation that has been disabled this round.
- **Effect:** a backup provides detection in that territory at **half range** for this round's combat.
- **Tension** 0 · **Blame** 0
- **Answered by:** none (stabilization is final).
- **Primitives:** protect.

**19. Hardened Shelters** — Response or Stabilization · *Military*
- **Target:** a hostile operation or card aimed at one of your territories.
- **Effect:** each population center in that territory **loses at most 1 population token** from this round's combat.
- **Tension** 0 · **Blame** 0
- **Answered by:** Inside Agent (only when played as a response).
- **Primitives:** protect.

**20. Smuggling Network** — Response or Stabilization · *Economic*
- **Target:** an Economic card aimed at you, or an interdiction operation against you.
- **Effect:** halve every resource loss it causes, rounding the loss down.
- **Tension** 0 · **Blame** 0
- **Answered by:** Inside Agent (only when played as a response).
- **Primitives:** protect.

### Diplomacy (4)

**21. Summit** — Global · *Diplomatic*
- **Effect:** every player chooses **Attend** or **Refuse**. You attend automatically.
  - Tension −3 for each attending player, including you.
  - Attendees can't declare hostile operations or play hostile root cards against other attendees until the end of the next round.
  - Each player who refuses gains +1 blame.
  - You draw 1 card.
- **Tension** −3 per attendee · **Blame** 0 for you
- **Answered by:** none.
- **Primitives:** modify.

**22. Hotline** — Root or Stabilization · *Diplomatic*
- **As a root:**
  - **Target:** one player, who may accept or decline.
  - **If accepted:** tension −5, and both players' hostility toward each other falls by 2.
  - **If declined:** nothing happens and the card is spent.
- **As a stabilization:** in a chain with a positive tension change, **halve that tension change** (rounded down), and the chain causes **no hostility changes**. Blame still applies.
- **Answered by:** none.
- **Primitives:** modify.

**23. Verification Mission** — Root · *Diplomatic*
- **Target:** one player, who chooses:
  - **Accept:** you each see the other's full nuclear breakdown, which reveals any *Covert Program* assets. Tension −4, and both players' blame falls by 1.
  - **Decline:** the target gains +1 blame.
- **Answered by:** none (the choice is the answer).
- **Primitives:** reveal, modify.

**24. Spoiler** — Root · *Covert, Diplomatic*
- **Target:** one treaty between two other players.
- **Effect:** the treaty ends **without breach penalties** to either signatory, and the re-signing cooldown applies. The two signatories' hostility toward each other rises by 1.
- **Tension** +4 · **Blame** +2 (the blame applies only if exposed)
- **Answered by:** Security Sweep (either signatory may respond).
- **Primitives:** cancel, modify.

## 3. Answer coverage

Every root has at least the non-card answer. This table shows which cards can answer which:

| Answer card | Slot | Answers |
|---|---|---|
| Security Sweep | Response | All Covert roots, and Destabilize Government |
| Inside Agent | Counter | Any response card |
| Smuggling Network | Response / Stabilization | Trade Embargo, Sanctions, interdiction operations |
| Rapid Resupply | Response / Stabilization | Hostile operations and cards against your territory |
| Hardened Shelters | Response / Stabilization | Hostile operations and cards against your territory |
| Emergency Relay | Stabilization | Sabotage Crew on radar or command; any disabled detection |
| Hotline | Stabilization | Any chain that raises tension |

Global cards (Global Embargo, Doomsday Rhetoric, Summit) are answered only by their printed choices, as main design §4 requires.

## 4. Proposed deck composition

| Card | Copies | | Card | Copies |
|---|---|---|---|---|
| Propaganda Broadcast | 3 | | Inside Agent | 3 |
| Trade Embargo | 2 | | Full Mobilization | 1 |
| Sanctions | 2 | | Border Exercise | 3 |
| Global Embargo | 1 | | Nuclear Test | 2 |
| Ultimatum | 2 | | Rapid Resupply | 3 |
| Doomsday Rhetoric | 1 | | Emergency Relay | 3 |
| Destabilize Government | 2 | | Hardened Shelters | 3 |
| Arm the Insurgents | 2 | | Smuggling Network | 3 |
| Sabotage Crew | 3 | | Summit | 2 |
| Reconnaissance | 3 | | Hotline | 3 |
| Covert Program | 2 | | Verification Mission | 2 |
| Security Sweep | 4 | | Spoiler | 2 |

**Total: 57 cards.** 22 of them (about 40%) can be played as reactions. When the draw pile runs out, shuffle the discard pile to form a new one.

## 5. Things to watch in playtests

- **Ultimatum vs. Doomsday Rhetoric:** are the "world on fire" cards worth their tension and blame, or does nobody play them?
- **Covert cards:** is the exposure risk enough to stop players from spamming Sabotage Crew and Reconnaissance? Security Sweep is the most common card (4 copies) for that reason.
- **Summit:** does it end wars too easily? Attendees are protected from each other only until the end of the next round.
- **Nuclear Test:** does giving up a warhead make it a real trade-off?
- **Economic cards** depend on economy numbers that don't exist yet. Their values will move once production and supply rates are set.

## 6. Gaps for the next draft

- No cards yet for capturing **neutral territories**, **sea zones**, or **patrols** and **submarines**.
- No cards that interact with **nuclear plans** (for example, delaying a launch wave). This is deliberately left out until Milestone 4 rules exist.
- No **ceasefire or treaty** cards beyond the diplomatic missions and treaties in the tension spec.
