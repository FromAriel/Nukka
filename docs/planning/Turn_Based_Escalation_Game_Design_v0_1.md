# Turn-Based Escalation Game — Working Design v0.1

## The central design

This is a turn-based command game with short, shared, real-time combat windows. Players build a country, place military assets, play political events against one another, and prepare standing military orders. When an attack resolves, the board becomes a three-quarter-view battlefield: the player aims and issues commands while the rest of her forces execute the plan she already approved.

**The cards create the situation. Placement determines the available options. The battle tests the plan. Its consequences remain on the board.**

Conventional warfare uses this combat system from the beginning. Nuclear authorization changes the weapons and consequences, not the fundamental controls.

All numerical values below are proposed starting settings, not playtested balance. Weapons and defensive effects are deliberately fictionalized game systems, not predictions of real-world military performance.

## 1. Baseline game and victory

| Element | Proposed baseline |
|---|---|
| Players | 2–4; begin development with one human and one AI |
| Map | 24 fictional territories for the four-player scenario |
| Initial ownership | Four territories per player; eight neutral territories |
| Match length | 12 strategic rounds; aim for roughly 40–60 minutes after pacing tests |
| Conventional combat | Approximately 40 seconds, followed by bounded projectile cleanup |
| Nuclear combat | Approximately 60 seconds, followed by bounded projectile cleanup |
| Perspective | Readable three-quarter presentation over a 2D simulation |
| Card hand | Start with six; draw two per round; maximum seven after cleanup |
| Reactions | Two reaction points per player per round |
| Nuclear war | Possible, consequential, and avoidable—not a mandatory ending |

The standard match ends after round 12, an agreed early settlement, or when only one country with a viable surviving population remains. A ceasefire does not itself end a match unless everyone also agrees to settlement.

Prototype scoring:

**Score = 3 × supported surviving population tokens + functioning civilian installations + 2 × controlled non-starting territories.**

A population token is supported when its connected supply network has enough current output and reserves to cover its food and water needs over the next two upkeeps. The score preview shows this calculation throughout the game. Population is abstract, not a claim about particular real-world casualty figures.

An arsenal is not victory points. A government with no viable population cannot win merely because its weapons destroyed everyone else. If no viable country remains, the result is mutual defeat.

This gives expansion, prosperity, and survival value without requiring players to launch nuclear weapons. Secret objectives can become an optional module later; they should not complicate the first ruleset.

## 2. The board is both an economy and a battlefield

Every territory has an owner, terrain, adjacency connections, any starting population or natural resource features, four development sites, and a garrison area. Installed structures occupy sites. Armies and ammunition form stacks with visible quantities and capacities.

Natural water sources and starting settlements belong to the map. Players build waterworks, farms, shelters, factories, and defenses around them. They do not buy new people instantaneously.

Placement is constrained to clear sockets or small placement zones rather than unrestricted city construction. Relative position still matters: a battery covers a particular area, a depot serves a connected network, and a ground-defense installation covers an approach.

| Asset | Strategic function | Combat and aftermath consequence |
|---|---|---|
| Population center | Supports workforce and survival score | Casualties and displacement persist |
| Industry | Produces construction capacity or military supplies | Damage limits replacement and repair |
| Farm | Produces food | Lost output draws down reserves |
| Waterworks | Makes a source usable by the supply network | Failure affects population and farming |
| Power station | Provides capacity to connected installations | Outages disable or weaken powered equipment |
| Depot / weapons cache | Stores supplies and designated ammunition | Disconnection prevents distribution; loss destroys its contents |
| Airfield | Hosts aircraft and compatible bomb stocks | Aircraft on the ground and stored weapons remain vulnerable |
| Missile silo | Houses launch capacity and loaded missiles | An empty silo cannot attack |
| Defense installation | Protects a geographic area | Range, ammunition, power, and target compatibility matter |
| Command / radar installation | Supports orders, detection, and coordination | Damage affects warning and command capabilities |
| Shelter / medical upgrade | Improves civilian resilience | Mitigates losses; does not make a district invulnerable |

### Keep ammunition separate from delivery systems

A tank token represents a mechanized formation. A bomber token represents a formation with a defined carrying capacity. Bombs are separate stockpiled items. A silo has launch capacity and a loaded-missile inventory. Defense batteries have magazines.

A country can therefore own six bombs but only enough aircraft to carry two this exchange. An impressive-looking missile field can contain empty silos. The interface must show **owned, loaded, committed, and available** quantities separately.

### Use five economic measures

Production pays for building and repair. Food and water have output, demand, and reserves. Power is operating capacity, not a stockpile. Supplies abstract fuel, maintenance, and ordinary ammunition support.

Industry can be assigned to construction or supply production. Military units need supply, preventing unlimited maintenance-free accumulation. Weapon magazines refill only through an available supply connection, not whenever combat starts.

For the first version, adjacent friendly, uncontested territories form a supply network. Recalculate connectivity and shortages at round boundaries. Damage to a local power plant can interrupt equipment immediately, but food and water consequences enter the next upkeep. Avoid a separate simulation of every truck and power cable.

The inspection panel should say things such as: **“Food reserve: two upkeeps. This battery is powered by East Grid. No ammunition route to this depot.”**

## 3. A complete strategic round

### A. Upkeep and recovery

Collect output, consume civilian necessities and military supplies, advance repairs, apply existing shortages, and draw cards. Restore each player's two reaction points. Rotate the initiative marker so the same player does not always act first.

### B. Planning and placement

Each player receives two development orders, one friendly repositioning order, and one main action. Development constructs or upgrades an installation, deploys a purchased unit or ammunition batch, or repairs an asset. Repositioning moves an existing stack through legal friendly connections.

The main action is an event card, a conventional operation, or a diplomatic proposal. Ordinary attacks remain available as standard actions; a player does not need to draw the one card that permits her army to move.

Players also edit standing defense priorities and draft nuclear plans. Editing a draft costs no main action and does not authorize a launch.

In multiplayer, players prepare orders simultaneously. Construction and friendly movement resolve under fixed rules; main actions then resolve in rotating initiative order. Hostile operations are declarations at this stage, not instant battles.

### C. Events and bounded reactions

Resolve one main action at a time using the reaction system below. A canceled raid never reaches the combat queue. A declared raid that survives reactions becomes a scheduled operation.

### D. Crisis and final commitments

Evaluate nuclear authorization after all main actions resolve. Show the resulting crisis state, committed conventional operations, and the player's available military choices. Give every player a final preparation window before combat locks.

No missile launches while someone is still reading a card response.

### E. Shared combat

Resolve all conventional and authorized nuclear operations in one synchronized combat window. Each player can aim, select equipment, and issue allowed tactical commands. Standing orders continue automatically.

Do not reopen the political-card system during combat. This version asks players to aim, not simultaneously manage a counterspell stack.

### F. Aftermath

Apply damage, ownership changes, inventories, displacement, disruption, and score changes. Recalculate networks and forecast the next upkeep. Present a concise causal report before the next planning round.

**Plan → provoke → react → commit → fight → inherit the consequences.**

## 4. Card reactions: enough interaction, a hard stop

Each ordinary main action is one root event. It can receive at most three additional cards in prescribed slots.

| Slot | Who may act | Permitted purpose |
|---|---|---|
| Root | Active player | Event, operation, or proposal |
| Response | Affected player | Block, modify, evade, or accept an alternative consequence |
| Counter | Original initiator | Respond to the defender's reaction |
| Stabilization | Defender or one nominated, consenting eligible ally | Mitigate the remaining result; not start another attack |
| Resolve | Rules engine | Close the chain and apply the outcome |

There is no response to stabilization. Ineligible slots are skipped. Every reaction costs one reaction point and the card; the root action uses the player's main action instead. The defender may spend both of her round's reaction points on one chain, but then she is exposed to later events.

### Example chain

**Sabotage Crew:** Disable the target radar this round.

**Security Sweep:** Cancel that sabotage.

**Inside Agent:** Cancel Security Sweep.

**Emergency Relay:** Provide temporary backup detection if the main radar goes offline.

The final result is a disabled radar with weaker backup coverage. Four cards were involved. The interface closes the chain and shows that result. Nobody gets to counter Emergency Relay.

### Rules that prevent loops

Cards cannot manufacture additional main actions or reopen closed chains. Resolve registered effects once, in fixed reverse play order, with targeting and costs validated. Triggered consequences change state; they do not recursively open more response windows.

Drawing a card does not create another opportunity to play it. A canceled card stays spent unless it explicitly provides a refund. Aggressive attempts can still generate their printed political consequences even when the mechanical attack is stopped; the preview must state this.

Broad global events use simultaneous printed choices rather than creating a separate counter-chain for every country. For example, an inspection summit might ask every player to comply, refuse, or spend an indicated resource. Global cards are not ordinary interruptible chains in the base set.

Multiplayer response windows can begin at eight seconds per eligible slot, with immediate auto-pass when no legal reaction exists. Single-player can be untimed.

### Always allow a non-card answer

An event can force a decision, but it must not require possession of a specific card to continue. “Allow inspection, refuse and gain hostility, or play a legal response” is better than “discard this exact card or lose your turn.”

Start with roughly 24 reusable card designs across pressure, mobilization, intelligence, defense, and diplomacy. Cards modify the board and its rules; they should not be hundreds of bespoke little programs.

## 5. Escalation and hostility are different systems

Global tension determines nuclear permissions. Bilateral hostility, treaties, and public blame describe relationships and influence AI decisions. Human players retain control of whom they attack; a hostility number never silently selects their targets.

Conventional war is legal before nuclear release. Nuclear weapons remain locked even when tanks and aircraft are already fighting.

The detailed rules for tension sources, the nuclear posture floor, crisis votes, blame, and treaties are in `Tension_and_Diplomacy_Spec_v0_1.md`.

| Global tension | Proposed behavior |
|---|---|
| 0–39 | Routine competition; restrained political costs |
| 40–79 | Open crisis; aggressive actions carry greater consequences |
| 80–99 | Nuclear release can be approved by a strict majority |
| 100 | Collective restraint collapses; nuclear orders become available |

At 80 or higher, countries simultaneously choose Hold or Authorize. A strict majority opens nuclear release for the coming combat window. Reaching 100 opens release without unanimity. Thus one reckless player can force the crisis, but also acquire the blame that encourages a coalition against her.

**Opening nuclear release does not itself fire a weapon.** Players can choose to hold even after authorization becomes possible.

If no nuclear weapon launches, later de-escalation can close release again. Once the first launch occurs, the match permanently enters the nuclear aftermath state: destruction and political history do not reset. Negotiated ceasefires can still restrict new launches in later rounds.

This supports bluffing and collective restraint without giving one holdout an unlimited veto.

## 6. Combat: the same map becomes active

Do not replace the strategic board with an unrelated defense screen. Retain the same territories and structures, change the camera and overlays, and animate operations through that space.

Aircraft approach from different edges and traverse the map. Bombs separate from aircraft toward visible objectives. Missiles follow readable curved or angled paths. Ground formations advance along terrain-defined routes. Threat icons, ground shadows, and target indicators keep the three-quarter perspective understandable.

The underlying simulation can remain 2D. Height and perspective are presentation and target-class information, not a requirement for a full 3D engine.

### Aiming and controls

Click a battery or use a numbered group to select it. The cursor shows its coverage, eligible targets, ammunition, and attack preview. Click a location to fire an area weapon there; click or aim ahead of a moving object to engage with an appropriate direct-fire weapon. Holding fire can repeat shots only within the weapon's existing rate and magazine limits.

The defense selector can choose the eligible battery with the best arrival time, but must visibly identify the battery and cost before firing. Changing selected weapons changes the cursor and reticle, not the entire control scheme.

Good aiming means leading movement, placing bursts where paths converge, choosing the most urgent threat, and not wasting scarce ammunition. It is not a clicks-per-second contest.

### Equipment establishes the possibilities

More batteries provide more coverage, overlapping fire, larger total magazines, and fallback positions. Better detection supplies earlier warnings and clearer prediction aids. Certain upgrades improve projectile speed, burst size, or tracking.

A skilled player should improve the use of a prepared defense. One surviving gun should not become a universal shield because someone clicks extremely quickly.

### Automation and accessibility

All forces have a competent baseline autopilot. Manual orders take priority over the relevant unit's automatic order; they do not create a second shot, bypass cooldowns, or duplicate ammunition.

Autopilot uses the same range, inventory, targeting information, and restrictions as the player. Offer hold-to-fire, remapping, generous selection targets, shape-coded threats, adjustable cursor size, and an automatic-defense option. Single-player can additionally offer slower combat.

Before combat, each player chooses a defense policy: protect civilians, preserve retaliation capability, or balanced coverage. She can override protected assets and reserve part of a battery's ammunition for later waves. Autopilot then prioritizes threats to those assets within the information actually available. Manual shots spend the same magazine; they cannot consume reserved ammunition without an explicit override.

Visible combat should be explainable: a valid collision applies the displayed damage or interception rule. Do not add an invisible second dice roll that makes an apparently successful interception arbitrarily fail. Armor, shields, and uncertain detection must be shown as such.

Preparation should remain the strongest source of advantage. Manual play adds judgment and precision without making the game inaccessible to someone who prefers the strategic layer.

## 7. Conventional war must work as a complete game

Conventional forces should not feel like disposable practice targets before the nuclear portion.

| Operation | Purpose | Resolution |
|---|---|---|
| Ground assault | Capture adjacent territory | Requires surviving ground forces and removal of the defending garrison |
| Air raid | Damage or disable a chosen site | Aircraft must reach their release opportunity and their weapons must reach the objective |
| Missile raid | Strike a designated asset | Interceptable projectiles resolve against that object |
| Interdiction | Interrupt supply | A successful operation disrupts a route or depot for a defined duration |

Bombing a territory does not transfer ownership. If the defender's garrison survives, ownership remains unchanged. For the first version, unsuccessful surviving ground attackers withdraw after combat rather than creating a second persistent front-management game. Opposing attacks along the same border become one border engagement.

Conventional damage should frequently leave an asset impaired rather than erase it. This allows repair, economic harassment, and repeated local wars to matter.

### Give the attacker something to do

Attacking units execute their planned operation automatically, but the player can designate a tactical focus, direct a formation's fire, choose a permitted approach adjustment, or order withdrawal. A limited command budget—start testing at three major formation changes per exchange—prevents constant micromanagement.

An attacker can intercept opposing aircraft, concentrate conventional fire on the declared objective, or pull back a damaged formation. She cannot manufacture another raid or retarget an already-launched strategic weapon by clicking quickly.

A player attacked while attacking uses the same interface to switch attention. Her unattended forces keep following their standing orders.

## 8. Defense families need distinct play styles

The base game needs a few legible categories, not a catalogue of real military equipment.

| Defense family | Active behavior | Main limitation |
|---|---|---|
| Gun / flak battery | Aim and sustain fire against appropriate aircraft or light threats | Short coverage and ammunition use |
| Burst interceptor | Aim ahead to place a timed defensive burst | Projectile travel time and limited reloads |
| Precision interceptor | Engage an individual compatible fast target | Limited throughput and magazine size |
| Ground-defense formation | Direct fire at advancing mechanized units | Does not substitute for air or strategic missile defense |
| High-altitude screen | Automatically engages eligible threats before they enter the local layer | Limited geographic coverage and engagement capacity |

Show compatibility explicitly. An anti-air gun does not secretly damage every heavy ground formation; a ground gun cannot solve every missile problem.

Later modules can add power-hungry beam defenses, hazardous wide-area interceptors, decoy packages, hardened fictional delivery units, and orbital shields. Each should add a readable tradeoff rather than just a higher damage number.

Orbital defenses are an alternate-history game layer, not a simulation of real orbital warfare. In the initial design, they are finite-capacity automatic defenses with a coverage overlay. Active space combat is unnecessary for the first release.

## 9. Nuclear plans: draft, authorize, execute

The player should configure her arsenal before an exchange. The AI executes that policy; it does not decide on its own that nuclear war would be interesting.

Every plan has three visible states:

**Draft:** Editable, inactive, cannot launch anything.

**Committed:** Explicitly approved for the coming exchange, subject to nuclear permissions and the chosen trigger.

**Executing / complete:** Scheduled orders are firing or have finished; already-launched weapons cannot be recalled.

| Plan field | Player's choice |
|---|---|
| Delivery group | Specific silo, bomber formation, or later delivery group |
| Allocation | How much available ammunition is committed |
| Policy | Hold, scheduled launch, or retaliation-only |
| Primary objective | Known fictional board object or explicitly permitted target category |
| Fallback | Another preapproved objective, or hold |
| Wave | Opening, main, or reserve wave |
| Trigger | Always after approved release, or a defined confirmed hostile action |
| Abort condition | Stand-down order, loss of launch capability, or no valid approved target |

Opening, main, and reserve waves can initially use compressed game-time launch slots at 0, 15, and 30 seconds in a nuclear exchange. These are pacing settings, not real missile flight timings. Plans are validated so no scheduled projectile exceeds the exchange's defined cleanup limit.

A reserve weapon whose condition never triggers stays in inventory. A destroyed launcher cannot fire a later scheduled wave. A weapon already in flight continues even if its launcher is destroyed. A bomber shot down before releasing its payload never produces the planned strike.

### Retaliation rules must be explicit

In the base game, retaliation triggers use actual rule-confirmed actions, not an AI guess or a fake alert card. “Launch if Country B initiates a confirmed nuclear attack against us” is a valid policy. “Attack anyone the AI thinks looks suspicious” is not.

Later scenarios may deliberately allow unreliable-warning doctrines, but only as clearly selected, disclosed risks.

The targeting system can select among approved targets using priorities such as military installations or industry, but it cannot expand the approved target set. If the primary and fallback targets are unavailable, hold.

The commitment screen states the policy plainly: **“Commit three weapons. Retaliation only. Approved adversary: B. No valid approved target: hold.”**

A visible stand-down control cancels eligible pending launches, subject to surviving command capability. It cannot recall weapons already in flight. A disconnection never creates new authorization: autopilot continues existing committed orders and otherwise holds.

## 10. Prevent the multiple-front problem

All combat in a round shares one clock. No player receives four sequential defense minigames because four opponents or regions became involved.

Every player sees the world overview with her active theaters emphasized. Zooming provides detail, while off-screen threat markers, impact warnings, and jump-to-alert controls retain national awareness. Defenses outside the current view remain active under standing orders.

Keep the four-player board compact enough for meaningful overview play. Cap visual density, aggregate ordinary formations into representative units, and separate arriving waves rather than literally drawing thousands of projectiles.

Players not engaged can watch, inspect authorized intelligence, and draft next-round plans without changing the current locked exchange.

When the nominal timer expires, prevent new launches and finish already-valid projectiles through a bounded cleanup period. Never make a surviving missile disappear because a UI countdown hit zero. Hard limits on flight durations and launch slots prevent cleanup from extending indefinitely.

## 11. Persistent damage and postwar survival

Structures use three primary states: operational, impaired, or ruined. Temporary status effects such as jammed or out of ammunition remain separate from structural health.

Population losses, consumed ammunition, destroyed stores, and permanent ruin persist. Repair costs production and a development order. Rebuilding a ruined facility is slower or more expensive than repairing damage.

Aftermath reports should distinguish immediate losses from upcoming problems:

- Immediate: an installation is destroyed, inventory lost, or population harmed.
- Next upkeep: disconnected food, water, or supply routes create a shortfall.
- Longer term: depleted reserves, displacement, and global disruption reduce recovery.

Refugees become visible displaced population tokens that can settle where capacity and supplies permit. They do not vanish into an unexplained national penalty.

An abstract global devastation track can model shared post-exchange disruption. Large destructive events advance it; thresholds reduce global output or trade. Its rules are intentionally game-specific, not a scientific climate model. Even an unstruck country can suffer from the shared deterioration.

Keep this readable: **“Three population supported. One displaced. Food deficit next upkeep. East battery lacks power. Two missiles remained unlaunched.”**

Command loss should disrupt coordination rather than instantly eliminate a player with surviving territory and people. Once a player truly has no viable country, close her participation promptly; do not impose a long, hopeless cleanup phase.

## 12. Example: one round connecting the systems

Aster has an offensive arsenal but thin defenses. Brine has a strong interceptor network. Cinder has a mobile conventional army. Dara has food reserves and a defensive agreement with Brine.

Aster plays Sabotage Crew against Brine's radar. Brine uses Security Sweep, Aster counters with Inside Agent, and Dara supplies Emergency Relay in the final stabilization slot. The radar is disabled, but backup detection remains. The chain ends immediately.

Cinder declares a ground assault on Brine. Subsequent public aggression pushes the final tension to 100. The crisis screen opens nuclear release, but no weapons fire during that screen. Aster commits an opening-wave strike against Cinder. Cinder commits a strike against Brine. Brine commits retaliation against Cinder only if Cinder actually initiates that attack. Dara holds.

Combat starts on one shared clock. Brine aims her defenses at incoming conventional threats and the advancing army. Her approved retaliation becomes eligible when Cinder's committed nuclear attack triggers it. Aster's surviving bombers continue their schedule without requiring Aster to stop aiming elsewhere and repeatedly press a launch button.

The exchange ends with Cinder's assault repelled, Brine's waterworks impaired, and one of Aster's later-wave launchers destroyed before it fired. The political cards, tactical aiming, standing orders, and placement all mattered. Next round begins with those consequences, not a reset board.

## 13. Interface and AI

The main interface needs four connected views: strategic board, event tray, doctrine planner, and combat overlay. These should feel like panels and modes of one command table, not four unrelated applications.

The strategic board shows ownership, infrastructure, inventories, supply warnings, tension, and score forecasts. The event tray shows the root, remaining response slots, costs, and predicted result. The doctrine planner distinguishes draft from committed orders and explains triggers and fallback behavior. The combat overlay shows eligible weapons, coverage, magazines, target status, and off-screen alerts.

Every action needs a visible answer to: **What will this do? What will it cost? What could stop it?**

AI opponents can begin as weighted utility planners, not language-model agents. They assess survival needs, exposed assets, opportunities, hostility, available reactions, and likely benefits of restraint. Personality weights produce an industrial builder, conventional expansionist, defensive survivor, or aggressive brinkmanship player without separate rule systems.

Use the same legal information boundaries for bots and humans. A bot does not know a concealed inventory merely because the server stores it. Its autopilot is also the foundation for accessibility and disconnected-player continuity.

## 14. Implementation architecture

Use a shared TypeScript rules core with a separate rendering layer. Choose the rendering framework after testing the first combat slice; the rulebook should not depend on an engine-specific scene graph.

Separate strategic state, event resolution, combat simulation, AI policies, and presentation. Strategic state owns territory, population, inventories, relationships, and permission flags. Event resolution owns legal actions and bounded reactions. Combat owns motion, collisions, firing schedules, damage, and tactical commands. Presentation reads these systems and submits commands; it does not invent authoritative outcomes.

Cards should be data describing legal phases, target filters, costs, response slots, effect primitives, political consequences, and duration. A small effect vocabulary—damage, disable, modify, reveal, move, protect, transfer, cancel—will cover the first deck more safely than one arbitrary script per card.

For single-player, run the authoritative simulation locally. For online play, run it on the server and let clients send validated commands. Do not trust clients to report successful interceptions, inventory, or launch permissions.

Use a fixed simulation tick, explicit ordering for events at the same tick, controlled randomness, and an action log with seed and ruleset version. Replays and saved games are debugging tools as well as player features. Rendering frame rate must not determine game outcomes. Deterministic replay is a property to test, not something to assume merely because a seed exists.

## 15. Development milestones and acceptance gates

### Milestone 1 — One conventional battle

Build one region with one meaningful civilian asset, a targetable military structure, two defense families, one aircraft threat, and one projectile threat. Support both aiming and autopilot.

Pass only when firing is readable, target selection is reliable, magazine limits matter, and testers can explain why a threat hit or missed. Test modest hardware and the intended accessible control modes.

### Milestone 2 — Placement survives combat

Connect two countries with a small map, basic supply, construction, and persistent damage. A defense must exist on the strategic board before it exists in battle.

Pass only when changed placement or inventory measurably changes the encounter and the resulting damage changes the following strategic round. Save and reload without losing those consequences.

### Milestone 3 — Cards and finite reactions

Implement a small first deck, the four-slot event tray, reaction budgets, alternative non-card choices, and event logs.

Pass only when no legal effect can create a fourth reaction, reopen a closed event, spend a reaction point twice, or trap a player waiting for a nonexistent card. Test canceled actions and simultaneous global choices explicitly.

### Milestone 4 — Nuclear authorization and plans

Add tension, release permissions, three plan states, fixed launch waves, bounded approved targets, and retaliation triggers.

Pass only when draft plans cannot launch, destroyed launchers cannot fire later waves, already-launched weapons persist, missing targets produce hold behavior, and disconnects never create authorization. Test ceasefires, stand-down, and an exchange with no nuclear launches despite open permission.

### Milestone 5 — A complete local match

Add scoring, usable AI, four-player scenarios, coherent aftermath, onboarding, and the full base deck.

Pass only when the game supports viable conventional, defensive, and prosperous strategies; restraint can be competitive; and tactical skill does not erase an overwhelming preparation advantage. Record turn duration and downtime rather than relying on impressions alone.

### Milestone 6 — Online multiplayer

Add server authority, reconnect, clocks, command validation, state recovery, and replay inspection.

Pass only when clients agree on outcomes under latency and disconnection; late or duplicate commands cannot duplicate cards, ammunition, or launches; and all fronts resolve under the same exchange clock.

### Expansion modules

Only after the base loop works, add orbital shields, advanced countermeasures, richer logistics, hidden installations, unusual doctrines, custom decks, and long-form postwar scenarios.

## 16. Principal risks and playtest questions

| Risk | Design response | What to measure |
|---|---|---|
| Card debate consumes the match | Four slots, two reaction points, restricted global events | Median and worst-case event duration |
| Reflexes overwhelm planning | Competent autopilot; identical ammunition and rate limits | Outcomes across matched equipment and different control modes |
| Multiple fronts become unmanageable | One clock, overview, alerts, unattended automation | Missed off-screen threats and camera-switch burden |
| Nuclear planning becomes a spreadsheet | Group orders, three wave slots, explicit defaults | Time and error rate when creating a valid plan |
| The leader wins through snowballing | Upkeep, placement limits, recoverable conventional disruption | Income lead versus eventual win rate |
| Peaceful turtling dominates | Expansion and functioning infrastructure also score | Relative performance of distinct strategic styles |
| Nuclear attack becomes a mandatory final move | Survival-heavy scoring; no points for unused arsenal | First-use frequency and score benefit of last-round launches |
| Losing players linger without agency | Command disruption instead of instant elimination; prompt final defeat | Time between loss of viability and exit |

The highest-risk part is integrating attention, pacing, and fairness across the three layers—not merely drawing missile trajectories. A successful local vertical slice would provide evidence for expanding the design; this document alone does not establish a reliable probability of commercial success or prove the balance.

**The first deliverable should be one complete, enjoyable round that flows from a card, to a placement consequence, to an actively defended attack, to a changed board. Everything else should earn its place around that loop.**
