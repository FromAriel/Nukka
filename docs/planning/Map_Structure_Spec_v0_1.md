# Map Structure — Draft Spec v0.1

Defines the base map's layout, territories, sea zones, neutral territories, when a country is viable, and how the map is stored as data. Builds on main design §1–2, the patrol and submarine rules in `Tension_and_Diplomacy_Spec_v0_1.md` §6.1, and the intelligence bureau in `Covert_Operations_Spec_v0_1.md`.

All numbers are starting values for playtesting, not balance.

## 1. Design goals

- **Fair starts.** All four home countries are rotationally identical in shape, resources and access. Flavor can differ; the numbers don't.
- **Neighbors and rivals.** Each player has two nearby rivals and one distant rival across the map. Ground war happens with neighbors; the distant rival is reached by air, missile or sea.
- **A contested middle.** Neutral land sits between homes and holds the best food and water, so expansion is worth fighting over.
- **Room for submarines.** Every home has coastlines on both the open ocean and a shared inland sea.
- **Compact enough for one screen.** The whole map fits the overview camera (main design §10).

## 2. The base map

The map is a 5 × 5 grid of land with an **inland sea** in the center, surrounded by ocean. That gives **24 land territories** and **9 sea zones**.

```
              ~~ NW ~~        ~~~~ N ~~~~        ~~ NE ~~
          +-----------+-----------+-----------+-----------+-----------+
          |  A        |  A        |  N        |  B        |  B        |
  ~~ W ~~ |  Capital  |  Port     |  Frontier |  Port     |  Capital  | ~~ E ~~
          +-----------+-----------+-----------+-----------+-----------+
          |  A        |  A        |  N        |  B        |  B        |
          |  Uplands  |  Heartland|  Lakeshore|  Heartland|  Uplands  |
          +-----------+-----------+-----------+-----------+-----------+
          |  W        |  W        | ~~~~~~~~~ |  E        |  E        |
          |  Frontier |  Lakeshore| INLAND SEA|  Lakeshore|  Frontier |
          +-----------+-----------+-----------+-----------+-----------+
          |  D        |  D        |  S        |  C        |  C        |
          |  Uplands  |  Heartland|  Lakeshore|  Heartland|  Uplands  |
          +-----------+-----------+-----------+-----------+-----------+
          |  D        |  D        |  S        |  C        |  C        |
  ~~ W ~~ |  Capital  |  Port     |  Frontier |  Port     |  Capital  | ~~ E ~~
          +-----------+-----------+-----------+-----------+-----------+
              ~~ SW ~~        ~~~~ S ~~~~        ~~ SE ~~
```

The grid defines **connections**, not art. On screen, territories are irregular shapes with coastlines, rivers and mountains, drawn over this structure.

### 2.1 Homes

Each player starts with a 2 × 2 home block in a corner:

| Territory | Terrain | Starting population | Features | Starting installations | Coasts |
|---|---|---|---|---|---|
| **Capital** | Urban | 3 | Water source | Command, industry | Corner ocean zone |
| **Port** | Plains | 1 | — | Depot | Corner and side ocean zones |
| **Uplands** | Hills | 1 | Ore | Industry | Corner and side ocean zones |
| **Heartland** | Plains | 1 | Farmland, water source | Farm, waterworks | Inland sea |

Each home starts with **6 population tokens**, 2 water sources, 1 farmland and 1 ore deposit. Starting military units, defenses and any nuclear arsenal are set by the scenario, not the map.

### 2.2 Neutral territories

The 8 neutral territories form a cross between the homes:

| Territory | Count | Terrain | Population | Features | Coasts |
|---|---|---|---|---|---|
| **Frontier** (outer tip of each arm) | 4 | Hills or forest | 1 | Ore or timber | Side ocean zone |
| **Lakeshore** (inner part of each arm) | 4 | Plains | 1 | Farmland and water source | Inland sea |

Lakeshores are the richest land on the map: each has both farmland and water. Each one borders two homes, so it is contested from the start.

### 2.3 Connections

**Land:** territories connect to the territories beside them on the grid, horizontally and vertically, not diagonally.

- **Homes never border each other.** Every land route between players passes through neutral territory. To fight a neighbor on the ground, you first have to take, or share a border through, a frontier or lakeshore.
- Each home borders 2 frontiers (through its port and uplands) and 2 lakeshores (through its heartland).
- Each frontier borders 2 homes and 1 lakeshore. Each lakeshore borders 2 homes and 1 frontier.

**Distances:** a neighbor's home is 2 land steps away. The opposite player is at least 4 land steps away. Air, missile and submarine reach make the opposite player a real threat anyway.

### 2.4 Sea zones

| Zone | Count | Borders |
|---|---|---|
| **Corner ocean** (NW, NE, SE, SW) | 4 | One home's capital, port and uplands |
| **Side ocean** (N, E, S, W) | 4 | One frontier and the port or uplands of the two homes on either side |
| **Inland sea** | 1 | All 4 lakeshores and all 4 heartlands |

The 8 ocean zones form a ring: each one connects to the two zones beside it. **The inland sea doesn't connect to the ocean.** Submarines and patrols built on the inland coast stay there, and ocean ones stay in the ocean.

The inland sea is the most dangerous water on the map. Every home touches it, so a submarine there is close to everyone, and so is everyone's patrol.

Sea zones aren't owned and don't count for score or supply.

## 3. Territory rules

### 3.1 What every territory has

- An **owner** (a player or neutral) and a **terrain** type.
- **Population tokens**, if any, and **features**: water source, farmland, ore or timber.
- **4 development sites** for installations. Population and features don't use sites; they are part of the map.
- A **garrison area** for stacks of military units.
- **Approach lanes**: one per land border, used by ground formations in combat (§6).

### 3.2 Terrain

| Terrain | Ground combat | Economy |
|---|---|---|
| **Plains** | No modifier; fastest approach | Farmland possible |
| **Forest** | Defender bonus; slower approach | Timber improves construction |
| **Hills** | Larger defender bonus; slower approach | Ore improves industry |
| **Urban** | Defender bonus; ground assaults cost the attacker extra supplies | Room for more population; more vulnerable to civilian casualties |

The exact combat bonuses belong to the combat spec; this table sets which way each terrain leans.

### 3.3 Features

| Feature | Lets you build | Effect |
|---|---|---|
| **Water source** | Waterworks | A waterworks supplies water to its supply network |
| **Farmland** | Farm | Farms produce food only on farmland |
| **Ore** | — | Industry in this territory produces +1 production |
| **Timber** | — | Construction in this territory and next to it costs −1 production |

## 4. Neutral territories

- **Garrison:** each neutral territory starts with **2 militia formations**. Militia defend but never attack, are never reinforced and don't belong to any player.
- **Capturing:** a ground assault from an adjacent territory you own. It doesn't declare war on anyone, and adds **+1 tension** as a minor land grab, with no blame.
- **Air raids and missile raids** on neutral territories are allowed but have no strategic purpose.
- **What you gain:** the territory, its population token and its features. It scores as a controlled non-starting territory (main design §1).
- **Two players claiming the same neutral in one round:** both assaults resolve in the same engagement against the militia. The attackers don't fight each other unless one of them has declared war on the other. Whoever has more surviving formations at the end takes the territory. On a tie, nobody captures it, and the territory stays neutral with 1 militia formation.

## 5. Capture, loss and viability

### 5.1 Capturing a player's territory

When a ground assault takes another player's territory:
- **Population tokens** stay and switch owner. Combat losses and displacement still apply first.
- **Installations** transfer to the captor one condition step worse: operational becomes impaired, impaired becomes ruined.
- **Nuclear assets are scuttled:** silos, stored warheads and gravity bombs in the territory are destroyed, not captured. Their posture points are removed from the floor.
- **Units** that can't retreat to an adjacent friendly territory are lost.
- **Capturing a capital** takes its command installation, causing the command disruption described in main design §11. It doesn't eliminate the player.

### 5.2 Viability

A country is **viable** while it controls at least one territory containing at least one of its population tokens.

- Viability is checked **at each upkeep**. A temporary food or water shortage doesn't end a country; losing all of its populated land does.
- Only viable countries vote in crisis votes (tension spec §7.2) and can win.

### 5.3 When a country stops being viable

The player leaves promptly (main design §11):
- Their territories become neutral, each with 1 militia formation.
- Their units and stockpiles are removed. Their nuclear assets are removed from the floor.
- Weapons already in flight continue (main design §9).
- Their treaties end with no cooldown or penalty for anyone.
- Their final score is recorded for the results screen.

## 6. Map space in combat

The strategic map and the combat battlefield use the same 2D coordinates (main design §6).

- The map is **1000 × 1000 simulation units**. Each grid cell is about 200 × 200, before territory shapes are made irregular.
- **Development sites** are fixed points inside each territory. Placement uses these points, not free building (main design §2).
- **Approach lanes** run across each land border. Ground formations advance along them, and terrain sets their speed.
- **Aircraft** enter from the map edges or from sea zones, depending on where they are based.
- **Missiles** launch from the silo's or submarine's position and follow readable arcs to their target.
- **Vision ranges** (radar and patrols) are circles in the same coordinates, shown as overlays (covert spec §6; tension spec §6.1).

## 7. Visibility on the map

| What | Who can see it |
|---|---|
| Territory owners, terrain, features, population tokens | Everyone |
| Installations and their condition | Everyone |
| Bureau mode (Foreign or Domestic) | Owner only |
| Stacks of units on land: position and type | Everyone |
| Stack quantities, and owned vs. loaded vs. committed ammunition | Owner only, unless revealed |
| Submarines and patrols at sea | Owner and defensive partners, plus anyone whose patrol or radar can see them |
| Units in flight during combat | Anyone with vision covering them |

## 8. Player counts

The same map is used for every player count:

| Players | Homes used | The other homes become |
|---|---|---|
| 4 | A, B, C, D | — |
| 3 | A, B, C | D's home: 4 neutral territories with 2 militia each |
| 2 | A, C (opposite corners) | B's and D's homes: neutral, with 2 militia each |

In 2-player games there are 16 neutral territories, so there is much more to expand into. This needs a pacing check in playtests; if games run long, a smaller 2-player map is the fallback.

## 9. Map data format

A map file is data, not code (main design §14). A sketch:

```json
{
  "id": "basin-4p",
  "size": [1000, 1000],
  "territories": [
    {
      "id": "A-capital",
      "name": "Aster Capital",
      "terrain": "urban",
      "homeOf": "A",
      "population": 3,
      "features": ["water"],
      "sites": [[90, 70], [140, 60], [110, 130], [160, 120]],
      "garrison": [120, 100],
      "shape": [[0, 0], [200, 0], [200, 200], [0, 200]],
      "land": ["A-port", "A-uplands"],
      "sea": ["sea-NW"],
      "start": ["command", "industry"]
    }
  ],
  "seaZones": [
    { "id": "sea-NW", "adjacentSea": ["sea-N", "sea-W"], "shape": [] },
    { "id": "sea-inland", "adjacentSea": [], "shape": [] }
  ],
  "playerCounts": {
    "2": { "homes": ["A", "C"] },
    "3": { "homes": ["A", "B", "C"] },
    "4": { "homes": ["A", "B", "C", "D"] }
  }
}
```

Loading a map should check that:
- every connection is listed on both sides,
- every home has the same counts of population, features and coasts,
- every territory has exactly 4 sites,
- every territory and sea zone can be reached from every other.

## 10. Acceptance tests

- The map loads and passes every check in §9.
- A ground assault is only legal from an adjacent territory you own.
- Capturing a neutral never declares war; capturing a player's territory requires being at war with them.
- Captured installations drop one condition step, and captured nuclear assets are destroyed and removed from the floor.
- A country with no populated territory at upkeep stops being viable, leaves promptly, and loses its vote.
- Submarines and patrols can't cross between the inland sea and the ocean.

## 11. Open questions

1. **Homes never border each other.** This makes early neutral expansion matter, and gives every war a front line. Is that too slow, or should neighbors share one direct border?
2. Should the inland sea connect to the ocean through a strait, so submarines can move between them?
3. Is 6 starting population per home the right scale for scoring (3 points each)?
4. Should captured silos be scuttled, as proposed, or captured intact? Capturing a nuclear arsenal would be dramatic but hard to balance.
5. Should there be amphibious landings, or does ground war stay land-only in the base game?
6. Does the 2-player game on the full map run too long?
