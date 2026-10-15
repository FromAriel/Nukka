# Weapons and Combat — Draft Spec v0.1

Defines the starting weapons, threats and defenses, and the numbers the combat simulation needs: speeds, ranges, magazines, damage, terrain and what happens on a hit. It builds on main design §6–10, the map coordinates in `Map_Structure_Spec_v0_1.md` §6 and the costs in `Economy_Spec_v0_1.md` §5.

All numbers are starting values for playtesting, not balance. Weapons are deliberately fictional game systems, not models of real equipment.

## 1. Simulation basics

| Setting | Value |
|---|---|
| Map space | 1200 × 1200 units: the 1000 × 1000 land area plus a 100-unit ocean margin (one test-map grid cell = 200 units) |
| Simulation rate | 20 ticks per second, fixed, independent of frame rate |
| Conventional window | 40 s, then up to 20 s of cleanup |
| Nuclear window | 60 s, then up to 25 s of cleanup |
| Nuclear launch waves | 0 s, 15 s, 30 s (main design §9) |

**Cleanup:** when the window ends, nothing new can launch or fire, except defenses engaging threats already in flight. Every projectile already in flight finishes. Flight times are capped (§4) so cleanup always ends within its limit.

**No hidden rolls.** A hit applies the damage shown; a miss is a visible miss. This draft has no randomness in combat at all.

## 2. Threat classes

Every threat belongs to one class. A defense can only engage the classes listed for it (§5), and the interface shows this.

| Class | Shape on screen | Examples |
|---|---|---|
| **Air** | Triangle | Aircraft formations, bombers |
| **Missile** | Diamond | Conventional missiles |
| **Strategic** | Star | Nuclear missiles |
| **Ground** | Square | Ground formations, militia |
| **Sea** | Circle | Submarines, patrols |

## 3. Damage model

### 3.1 Installations

Installations have three conditions: **operational → impaired → ruined** (main design §11).

| Hit | Normal installation | Hardened installation (silo, command) |
|---|---|---|
| Conventional bomb or missile | 1 step | 1 step per **2** hits |
| Nuclear detonation in the blast zone | Ruined | Ruined |

- **Impaired** installations produce half their output, rounded down, and fire at half rate. An impaired silo can't launch.
- **Ruined** installations do nothing until rebuilt.
- Stored contents (ammunition, warheads, bombs) are **lost when the installation is ruined**, not when it's impaired.

### 3.2 Population centers

A population center is a target like an installation. Each conventional hit on it displaces 1 token; a second hit in the same window kills 1 token instead. Shelters (+1 per shelter in the territory) absorb hits first. Nuclear effects are in §7.

### 3.3 Units

Units have **hit points (HP)**. A formation token stands for a group, so damage is shown as a bar, and at 0 HP the token is destroyed.

## 4. Attackers

### 4.1 Aircraft

| Unit | HP | Speed (units/s) | Carries | Notes |
|---|---|---|---|---|
| **Aircraft formation** | 3 | 40 | Strike: 2 conventional bombs; or Escort: air-to-air guns | Chooses Strike or Escort when the operation is planned |
| **Nuclear-capable bomber formation** | 4 | 30 | 1 nuclear gravity bomb, or 4 conventional bombs | |

- **Range:** an aircraft operation's target must be within **600 units** of the airfield.
- **Entry:** aircraft enter from the map edge or sea zone nearest their airfield, and fly a route set at planning. The player can make one approach adjustment per formation (counts against the command budget, §8).
- **Bombs** release within 20 units of the target and fall for 3 s. **Bombs can't be intercepted**; the defense has to stop the aircraft before release.
- **Escort guns:** range 60, 1 damage every 2 s, against Air only.
- After releasing, aircraft leave the map. They return to base for the next round if they survive.

### 4.2 Missiles

| Missile | Class | HP | Speed | Range | Launched from |
|---|---|---|---|---|---|
| **Conventional missile** | Missile | 1 | 80 | 600 | Conventional missile launcher (2 per launcher) |
| **Nuclear missile (silo)** | Strategic | 1 | 60 | Whole map | Missile silo (2 per silo) |
| **Nuclear missile (submarine)** | Strategic | 1 | 60 | 700 from the submarine | Submarine (2 per submarine) |

**Strategic flight phases:**

| Phase | Duration | Can be engaged by |
|---|---|---|
| **Boost** | First 3 s | Nothing |
| **Midcourse** | Until the last 5 s | High-altitude screen only |
| **Terminal** | Last 5 s before impact | Burst and precision interceptors |

Strategic flight time is set by distance, between **10 and 25 s**. A wave launched at 30 s therefore always lands before the nuclear window's cleanup limit.

### 4.3 Ground

| Unit | HP | Speed (units/s) | Weapon |
|---|---|---|---|
| **Ground formation** | 6 | 10 on plains | Range 40, 1 damage every 2 s, against Ground |
| **Militia** (neutral) | 4 | Doesn't move | Range 40, 1 damage every 2 s, against Ground |

Ground formations advance along **approach lanes** across a land border into the target territory's garrison area.

**Terrain** (map spec §3.2):

| Terrain | Attacker speed | Damage taken by defenders |
|---|---|---|
| Plains | ×1 | ×1 |
| Forest | ×0.7 | ×0.75 |
| Hills | ×0.7 | ×0.5 |
| Urban | ×0.8 | ×0.75; each assault also costs the attacker 1 extra supply |

Fractions of damage carry over between hits, so a ×0.5 defender takes 1 HP every second hit. Nothing is rounded away.

### 4.4 Sea

| Unit | HP | Speed | Weapon | Vision |
|---|---|---|---|---|
| **Submarine** | 3 | Moves between rounds only | Launches its 2 nuclear missiles | None |
| **Patrol group** | 3 | Moves between rounds only | Sub hunt: range 100, 1 damage every 10 s against a revealed submarine | Radius 250 in combat; its own and adjacent sea zones between rounds |

A **sub hunt** against a revealed submarine takes about 30 s to sink it, which fits a conventional window. The submarine can't fight back; the defense is to strike the patrol.

## 5. Defenses

| Defense | Engages | Range | How it fires | Damage | Magazine | Notes |
|---|---|---|---|---|---|---|
| **Gun / flak battery** | Air, Missile | 120 | Hold to fire at the cursor: 2 shots/s; shells travel at 300 and burst with radius 10 | 1 | 40 | Cheap, short reach, eats ammunition |
| **Burst interceptor** | Air, Missile, Strategic (terminal) | 250 | Click a point; the interceptor flies at 150 and bursts there with radius 30 | 2 | 6 | 2 s between shots; you have to aim ahead |
| **Precision interceptor** | Missile, Strategic (terminal) | 300 | Click a target; it homes at 200 and destroys it on contact | Destroys | 4 | 3 s between shots; can't engage aircraft |
| **Ground-defense formation** | Ground | 60 | Automatic, or directed at a formation | 2 every 2 s | — | A unit, 6 HP; doesn't stop air or missiles |
| **High-altitude screen** | Strategic (midcourse) | 400 | Automatic only | Destroys | 2 per combat window | Can't be aimed; covers a wide area |

- **Magazines** refill only at upkeep, and only with a supply connection (economy spec §4.2). Nothing reloads during combat.
- **Power:** an unpowered defense doesn't fire; one that loses power mid-combat stops at once.
- **Impaired** defenses fire at half rate.
- **Unsupplied** units fire at half rate and can't attack.
- **Reserved ammunition:** a battery can hold back part of its magazine for later waves. Neither manual fire nor autopilot can use it without an explicit override (main design §6).

## 6. Detection

| Source | Range | Effect |
|---|---|---|
| **Radar installation** | 350 | Reveals threats in range and shows their predicted paths and impact points |
| **Patrol group** | 250 | The same at sea, including submarines |
| **A battery's own sensor** | Its weapon range | Sees threats only once they are in range: no early warning or path prediction |

- Detection is the same rule everywhere (covert spec §6; tension spec §6.1). Vision circles are shown on the map.
- Without radar or patrol coverage, a battery can still fire, but sees threats late and with no prediction aids. **Detection makes a difference to how well you aim; it doesn't change the numbers.**
- A disabled radar (for example by *Sabotage Crew*) stops detecting at once. *Emergency Relay* restores it at half range (175).

## 7. Nuclear effects

Nuclear missiles and gravity bombs have the same fictional yield.

| Zone | Radius | Effect |
|---|---|---|
| **Blast** | 120 | Every installation and unit is destroyed (installations ruined). In each territory the blast reaches: half of the population tokens (rounded up) are killed and a quarter (rounded up) are displaced. Each shelter saves 1 token. |
| **Outer ring** | 120–200 | Installations drop one condition step. 1 population token per territory is displaced. |
| **Contamination** | The target territory | Farm and waterworks output is halved for 3 rounds |

Each nuclear detonation advances the **global devastation track** by **3** (main design §11):

| Devastation | Effect for everyone |
|---|---|
| 9+ | Every farm produces 1 less food |
| 18+ | Every farm produces 1 less again, and trade transfers are halved |
| 27+ | Every waterworks produces 1 less water |

Countries that were never struck still suffer these effects.

## 8. Commands and autopilot

**Defender:** aim any defense in range manually at any time, limited only by its rate and magazine. Everything not being aimed manually follows autopilot.

**Attacker:** operations run automatically, with a budget of **3 major commands per window** (main design §7):
- **Focus:** a formation's fire on one target.
- **Approach adjustment:** switch to another legal lane or route before arrival.
- **Withdraw:** pull a formation out; it leaves along its lane and survives if it gets out.

**Autopilot** uses the same ranges, magazines and detection as the player. Before combat, each player picks a **defense policy**:

| Policy | Autopilot priority |
|---|---|
| **Protect civilians** | Threats to population centers, farms and waterworks |
| **Preserve retaliation** | Threats to silos, submarines' ports, command and airfields |
| **Balanced** (default) | Earliest impact first |

Within a policy, autopilot engages the threat that will hit soonest, using the cheapest compatible weapon that can reach it in time.

## 9. Operations, resolved

| Operation | Success condition at the end of the window |
|---|---|
| **Ground assault** | Attacker has surviving formations in the garrison area, and the defender has no ground formations or militia there. The territory is captured (map spec §5.1). Otherwise surviving attackers withdraw. |
| **Air raid** | Each bomb released on the target applies its damage (§3) |
| **Missile raid** | Each missile that reaches its target applies its damage |
| **Interdiction** | An air raid on a depot or a land border lane. A hit depot is impaired; a hit lane is **disrupted** for 2 rounds (supply can't cross it). |
| **Sub hunt** | The revealed submarine reaches 0 HP |

Attacks from two sides on the same border become one border engagement (main design §7). Captures of neutral territory follow map spec §4.

## 10. Combat pacing check

- An aircraft formation starting 600 units out reaches its target in 15 s. A gun sitting at the target gets only about 3 s of shooting before release; a burst interceptor gets about 6 s. Guns placed forward along the approach, or radar to see it coming, buy more time.
- A conventional missile from 600 units arrives in 7.5 s, so interceptors need detection to have a chance.
- A ground formation crossing 200 units of plains takes 20 s, or about 29 s in hills. A ground assault usually reaches the garrison area well within the 40 s window.
- A strategic missile has 5 s in terminal phase. One burst interceptor fires at most 3 shots in that time, and a precision interceptor 2. **Two missiles arriving together saturate a single battery.** That's intentional: layered and overlapping defenses matter.

## 11. Acceptance tests

- With the same seed and inputs, a combat window produces the same outcome every time, regardless of frame rate.
- No defense engages a class it isn't compatible with, manually or on autopilot.
- Manual fire and autopilot draw from the same magazine and rate limits, and neither uses reserved ammunition without an override.
- Bombs can't be intercepted; strategic missiles can't be engaged during boost.
- Every projectile launched before the window ends finishes during cleanup, and cleanup never exceeds its limit.
- Cutting power mid-combat stops affected defenses immediately.
- A ground assault captures only under the condition in §9.

## 12. Open questions

1. Should aircraft be able to be shot down after releasing their bombs, so they can be lost on the way out?
2. Is it right that bombs can't be intercepted, or should flak be able to hit falling bombs?
3. Are 2 high-altitude screen engagements per window enough to matter without making nuclear attacks hopeless?
4. Should gravity bombs have a smaller yield than missile warheads, to make bombers a different choice?
5. One formation loses to 2 militia, but two formations reliably win. Is that the right price for a neutral territory?
