# Economy — Draft Spec v0.1

Defines the numbers behind main design §2: what each building produces, what everything costs, what population and armies consume, and what happens in a shortage. It uses the test map in `Map_Structure_Spec_v0_1.md` and the intelligence economy in `Covert_Operations_Spec_v0_1.md`.

All numbers are starting values for playtesting, not balance.

## 1. Design goals

- **A balanced start that's easy to break.** Each home starts exactly self-sufficient in food and water. One bombed farm or waterworks causes a shortage, so infrastructure is worth defending and worth hitting.
- **Guns vs. growth from round 1.** Industry can build or produce supplies, not both. Armies cost supplies every round, so a large military slows construction.
- **Expansion pays.** Neutral land adds output quickly, which is why it's worth fighting over.
- **Small numbers.** Most values are 1–12 so players can do the math in their heads.

## 2. The six measures

| Measure | Type | Reserve cap | Used for |
|---|---|---|---|
| **Production (P)** | Stockpile | 15 | Construction, units, ammunition, repairs |
| **Food (F)** | Output, demand and reserve | 12 | Feeding population |
| **Water (W)** | Output, demand and reserve | 12 | Supplying population |
| **Power** | Capacity per grid; not stored | — | Running installations |
| **Supplies (S)** | Stockpile | 10, plus 5 per operational depot | Military upkeep, refilling magazines |
| **Intelligence (IP)** | Stockpile | 10 | Covert operations and counter-intelligence (covert spec §3) |

Anything above a reserve cap is lost at upkeep.

## 3. Output

| Installation | Requires | Output per upkeep | Power draw |
|---|---|---|---|
| **Industry**, Construction mode | — | 3 P (+1 on ore) | 1 |
| **Industry**, Supply mode | — | 4 S (+1 on ore) | 1 |
| **Farm** | Farmland | 4 F | 0 |
| Farm with **Irrigation** upgrade | Farmland and water in the network | 6 F | 0 |
| **Waterworks** | Water source | 4 W | 1 |
| Waterworks with **Expansion** upgrade | Water source | 6 W | 1 |
| **Power station** | — | 8 power to its grid | — |
| **Government** (every country, no building) | — | 2 S, 2 IP | — |
| **Command installation** | — | 1 IP | 1 |
| **Intelligence bureau** | — | Foreign: 2 IP / Domestic: 3 CI (covert spec §3) | 1 |

Each industry's mode is set during planning and takes effect at the next upkeep.

## 4. Demand

### 4.1 Population

Each population token, including displaced ones, consumes **1 food and 1 water** per upkeep.

### 4.2 Military upkeep

Paid in supplies at each upkeep:

| Unit or installation | Supplies per upkeep |
|---|---|
| Ground formation | 1 |
| Aircraft formation (conventional or nuclear-capable) | 1 |
| Patrol group | 1 |
| Missile silo | 1 |
| Nuclear submarine | 2 |
| Refilling one defense battery's magazine to full | 1 per battery |

Warheads, bombs and missiles in storage cost nothing to keep. The silos, submarines and aircraft that carry them do.

### 4.3 Power

Each installation listed with a power draw needs that much capacity on its grid to operate. Farms, depots, shelters and silos draw nothing; a silo's launch systems are self-contained.

## 5. Costs

Each item costs one **development order** (main design §3B) and the production listed.

### 5.1 Civilian and infrastructure

| Item | P | Power | Notes |
|---|---|---|---|
| Industry | 6 | 1 | |
| Farm | 4 | 0 | Farmland only |
| Irrigation (farm upgrade) | 3 | 0 | Needs water in the network |
| Waterworks | 4 | 1 | Water source only |
| Waterworks expansion | 3 | 1 | No extra power draw |
| Power station | 5 | — | Produces 8 power |
| Depot | 3 | 0 | +5 supply reserve cap |
| Shelter / medical upgrade | 3 | 0 | |
| Command installation | 6 | 1 | |
| Radar | 4 | 1 | |
| Intelligence bureau | 5 | 1 | Max 2 per country |
| Airfield | 6 | 1 | Hosts up to 3 aircraft formations |

### 5.2 Military

| Item | P | Supplies per upkeep | Notes |
|---|---|---|---|
| Ground formation | 3 | 1 | |
| Ground-defense formation | 3 | 1 | Fights advancing ground units only |
| Aircraft formation | 4 | 1 | Needs an airfield |
| Nuclear-capable bomber formation | 6 | 1 | Needs an airfield |
| Patrol group | 4 | 1 | Needs a coastal territory you own |
| Gun / flak battery | 3 | refill only | 1 power |
| Burst interceptor | 5 | refill only | 1 power |
| Precision interceptor | 6 | refill only | 1 power |
| High-altitude screen | 8 | refill only | 2 power |
| Missile launcher (conventional) | 5 | — | 1 power; holds 2 conventional missiles; no nuclear posture |
| Conventional bomb batch (4 bombs) | 2 | — | Stored at an airfield or depot |
| Conventional missile batch (2 missiles) | 3 | — | |

### 5.3 Nuclear

| Item | P | Supplies per upkeep | Tension spike | Posture |
|---|---|---|---|---|
| Missile silo (holds 2 missiles) | 10 | 1 | +8 | 6 |
| Nuclear submarine (holds 2 missiles) | 12 | 2 | +8 | 6 |
| Warhead batch (2) | 6 | — | +5 | 2 each |
| Gravity bomb batch (2) | 4 | — | +3 | 1 each |
| Nuclear-capable bomber formation | 6 | 1 | +4 | 3 |

Tension and posture values are from the tension spec §2. Submarines must be built in a coastal territory you own, and launch into an adjacent sea zone.

### 5.4 Repair and rebuilding

| Job | Cost | Time |
|---|---|---|
| **Repair** (impaired → operational) | Half the build cost, rounded up | Done at the next upkeep |
| **Rebuild** (ruined → operational) | Full build cost + 2 P | Done after 2 upkeeps |

Both use a development order. Clearing a ruined site to build something else costs 1 P.

## 6. Starting position (test map, per home)

| Territory | Installations |
|---|---|
| Capital | Command, industry, power station |
| Port | Depot |
| Uplands | Industry (on ore) |
| Heartland | Irrigated farm, expanded waterworks |

### 6.1 Starting balance sheet

| Measure | Income | Demand | Net per round |
|---|---|---|---|
| Production | 3 + 4 = 7 | — | **+7** |
| Food | 6 | 6 | **0** |
| Water | 6 | 6 | **0** |
| Supplies | 2 (government) | 4 (3 ground + 1 aircraft formation, standard scenario) | **−2** |
| Power | 8 | 4 (command, 2 industry, waterworks) + 3 (radar, 2 gun batteries) | **1 spare** |
| Intelligence | 2 + 1 = 3 | — | **+3** |

**Starting reserves:** 6 P, 6 F, 6 W, 8 S, 2 IP.

Read the starting position this way:
- **Food and water are exactly balanced.** The capital's water source is unused, so building a second waterworks there is the obvious insurance against a strike on the Heartland.
- **Supplies run down.** The standard starting military drains 2 per round. After about 4 rounds the player must move an industry to Supply mode, build more industry, or cut the army. Supply mode is deliberately more efficient: switching the Uplands industry gives +5 supplies for −4 production.
- **Power is nearly full.** Almost any new powered building needs a second power station first.

### 6.2 Starting score

6 population × 3 = 18, plus 6 functioning civilian installations (2 industry, farm, waterworks, power station, depot) = **24**.

For scoring, **civilian installations** are industry, farms, waterworks, power stations, depots and shelters.

## 7. Upkeep

### 7.1 Order

1. **Networks:** recalculate supply networks and power grids.
2. **Output:** collect production, food, water, supplies and IP from operational, powered installations, then subtract the exclave cost (§7.2).
3. **Population:** consume food and water.
4. **Military:** pay supply upkeep; refill magazines in connected territories.
5. **Repairs:** advance repairs and rebuilds.
6. **Caps:** discard anything above reserve caps.
7. Continue with the rest of upkeep in main design §3A: cards, reaction points, initiative.

### 7.2 Networks

- **Supply network:** territories you own that connect to each other over land and aren't contested (main design §2). Food, water and supplies are shared within a network. Production and IP are national and aren't tied to networks.
- **Power grid:** the same set of territories. Each grid has its own power capacity.
- **Cut off:** a territory that is separated from the rest of your network forms its own network, and can't use reserves or output from the main one.
- **Exclaves:** a country split into several networks keeps going. Every network still adds its production and IP to the national total, but **each network beyond the largest costs −1 P per upkeep** in administration. This lets isolated pieces of a country, such as a Kaliningrad-style exclave, survive at a cost.

### 7.3 Shortages

**Food and water:** if a network can't feed all its population from output plus reserves, the shortfall is assigned to population tokens, one token per missing unit:
- A token with a shortfall becomes **hungry**. Hungry tokens don't count as supported for score.
- A token that is hungry at **two upkeeps in a row is lost**.
- A fed upkeep clears the hungry status.
- Displaced tokens go hungry first; after that, the owner chooses.

**Power:** if a grid's demand exceeds capacity, installations shut down in the owner's priority order. The default order keeps waterworks, command and defenses running first, and shuts down industry, bureaus and airfields first. This applies **immediately**, including during combat when a power station is hit.

**Supplies:** for each unit the player can't pay for:
- The unit becomes **unsupplied**: it can't attack, and fights at reduced effectiveness (combat spec).
- A unit unsupplied at two upkeeps in a row is **disbanded**.
- Batteries that can't be refilled stay at their current magazine.

## 8. Population

| Terrain | Housing capacity (population tokens) |
|---|---|
| Urban | 5 |
| Plains, hills, forest | 2 |
| A shelter adds | +1 |

- **Displaced population** (main design §11) comes from tokens whose territory is captured or whose housing is destroyed. Displaced tokens move to your nearest territory with spare capacity, if any, and settle at the next upkeep.
- Displaced tokens still eat and drink, but **don't count for score until they settle**.
- A displaced token that can't find capacity for 2 upkeeps is lost.

**Supported population** (for score): a token that isn't hungry or unsettled, in a network whose output plus reserves cover the food and water needs of all its tokens for the next 2 upkeeps.

## 9. Pacing check

- Starting production is 7 per round, or about **84 over 12 rounds** without growth. One frontier territory with an industry on ore adds +4 per round for a one-time cost of 6.
- A minimal nuclear capability (silo plus one warhead batch) costs **16 P**, a little over 2 rounds of starting income. The tension spikes (+13) are the real price.
- A submarine plus warheads costs 18 P, plus 2 supplies every round: roughly the upkeep of two ground formations, for as long as you keep it.
- Production rather than development orders limits most rounds: 2 orders per round, and most items cost 3–6.
- The cards' economic effects fit this scale. Losing 2 production from *Sanctions* is about 30% of starting income; *Smuggling Network* halves that.

## 10. Scenarios

| Scenario | Starting military | Starting nuclear |
|---|---|---|
| **Cold start** (default for testing) | 3 ground formations, 1 aircraft formation, 1 radar, 2 gun batteries | None |
| **Standoff** | As Cold start, plus 1 airfield | 1 silo with 2 warheads loaded. Starting tension and floor are calculated from this. |

## 11. Interface

- The national panel shows each measure's **income, demand, net and reserve**, with warnings: "Food reserve: two upkeeps."
- The power panel shows each grid's capacity, draw and shutdown order.
- Each development option shows its cost, power draw, supply upkeep and any tension spike before the player confirms.
- The forecast shows the next 2 upkeeps, including which tokens would go hungry and which units would be unsupplied.

## 12. Acceptance tests

- The test map's starting position produces the balance sheet in §6.1 exactly.
- Destroying the Heartland farm uses up the 6-food starting reserve at the next upkeep. At the upkeep after that, if food hasn't been restored, all 6 tokens go hungry, displaced tokens first.
- A territory cut off from its network uses only its own output and reserves.
- A power station destroyed in combat shuts down installations immediately, in priority order.
- Unsupplied units can't attack, and are disbanded after a second unpaid upkeep.
- Nothing ever exceeds its reserve cap after upkeep.

## 13. Decisions so far

| Question | Decision |
|---|---|
| Supply mode efficiency | Supply mode produces 4 (+1 on ore) against 3 for construction. |
| Starting supply drain | −2 per round as a starting value. |
| Split countries | Allowed. Production stays national, with −1 P per upkeep for each extra network. |
| Production cap | 15 for now. It may be too low; watch it in playtests and try 20 if players hit it often. |

Every number here is a starting value to tune once the game can be played.

## 14. Open questions

1. Should the exclave cost grow with distance or the number of territories, or stay a flat −1 per network?
