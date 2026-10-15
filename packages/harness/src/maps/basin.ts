import type { MapDef, TerritoryDef } from '@nukka/core';

/**
 * Generates the symmetric "Basin" test map described in the Map Structure
 * spec §2: a 5 × 5 land grid around an inland sea, inside a ring of ocean.
 * Shapes are placeholder squares; the connection graph is what matters.
 */

const CELL = 200;
const MARGIN = 100;
const SIZE = MARGIN * 2 + CELL * 5;

type Role = TerritoryDef['role'];

interface Cell {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly homeOf: string | null;
}

const home = (h: string, role: Role, name: string): Cell => ({
  id: `${h}-${role}`,
  name: `${h} ${name}`,
  role,
  homeOf: h,
});
const neutral = (side: string, role: Role, name: string): Cell => ({
  id: `${side}-${role}`,
  name: `${side} ${name}`,
  role,
  homeOf: null,
});

// Rows top to bottom, columns left to right; null is the inland sea.
const GRID: readonly (readonly (Cell | null)[])[] = [
  [
    home('A', 'capital', 'Capital'),
    home('A', 'port', 'Port'),
    neutral('N', 'frontier', 'Frontier'),
    home('B', 'port', 'Port'),
    home('B', 'capital', 'Capital'),
  ],
  [
    home('A', 'uplands', 'Uplands'),
    home('A', 'heartland', 'Heartland'),
    neutral('N', 'lakeshore', 'Lakeshore'),
    home('B', 'heartland', 'Heartland'),
    home('B', 'uplands', 'Uplands'),
  ],
  [
    neutral('W', 'frontier', 'Frontier'),
    neutral('W', 'lakeshore', 'Lakeshore'),
    null,
    neutral('E', 'lakeshore', 'Lakeshore'),
    neutral('E', 'frontier', 'Frontier'),
  ],
  [
    home('D', 'uplands', 'Uplands'),
    home('D', 'heartland', 'Heartland'),
    neutral('S', 'lakeshore', 'Lakeshore'),
    home('C', 'heartland', 'Heartland'),
    home('C', 'uplands', 'Uplands'),
  ],
  [
    home('D', 'capital', 'Capital'),
    home('D', 'port', 'Port'),
    neutral('S', 'frontier', 'Frontier'),
    home('C', 'port', 'Port'),
    home('C', 'capital', 'Capital'),
  ],
];

const HOME_TEMPLATE: Record<
  string,
  Pick<TerritoryDef, 'terrain' | 'population' | 'features' | 'start'>
> = {
  capital: {
    terrain: 'urban',
    population: 3,
    features: ['water'],
    start: ['command', 'industry', 'powerStation'],
  },
  port: { terrain: 'plains', population: 1, features: [], start: ['depot'] },
  uplands: { terrain: 'hills', population: 1, features: ['ore'], start: ['industry'] },
  heartland: {
    terrain: 'plains',
    population: 1,
    features: ['farmland', 'water'],
    start: ['farm:irrigation', 'waterworks:expansion'],
  },
};

// North and south frontiers are hills with ore; east and west are forest with
// timber, so every home borders exactly one of each.
const FRONTIER: Record<string, Pick<TerritoryDef, 'terrain' | 'features'>> = {
  N: { terrain: 'hills', features: ['ore'] },
  S: { terrain: 'hills', features: ['ore'] },
  E: { terrain: 'forest', features: ['timber'] },
  W: { terrain: 'forest', features: ['timber'] },
};

const SEA_COASTS: Record<string, readonly string[]> = {
  'sea-NW': ['A-capital', 'A-port', 'A-uplands'],
  'sea-N': ['N-frontier', 'A-port', 'B-port'],
  'sea-NE': ['B-capital', 'B-port', 'B-uplands'],
  'sea-E': ['E-frontier', 'B-uplands', 'C-uplands'],
  'sea-SE': ['C-capital', 'C-port', 'C-uplands'],
  'sea-S': ['S-frontier', 'C-port', 'D-port'],
  'sea-SW': ['D-capital', 'D-port', 'D-uplands'],
  'sea-W': ['W-frontier', 'A-uplands', 'D-uplands'],
  'sea-inland': [
    'N-lakeshore',
    'E-lakeshore',
    'S-lakeshore',
    'W-lakeshore',
    'A-heartland',
    'B-heartland',
    'C-heartland',
    'D-heartland',
  ],
};

const OCEAN_RING = ['sea-NW', 'sea-N', 'sea-NE', 'sea-E', 'sea-SE', 'sea-S', 'sea-SW', 'sea-W'];

type P = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

// Placeholder ocean outlines along the margin.
const E0 = SIZE - MARGIN;
const SEA_SHAPES: Record<string, { name: string; center: P; shape: P[] }> = {
  'sea-NW': {
    name: 'Northwest Ocean',
    center: [50, 50],
    shape: [
      [0, 0],
      [300, 0],
      [300, MARGIN],
      [MARGIN, MARGIN],
      [MARGIN, 300],
      [0, 300],
    ],
  },
  'sea-N': { name: 'North Ocean', center: [600, 50], shape: rect(300, 0, 900, MARGIN) },
  'sea-NE': {
    name: 'Northeast Ocean',
    center: [1150, 50],
    shape: [
      [900, 0],
      [SIZE, 0],
      [SIZE, 300],
      [E0, 300],
      [E0, MARGIN],
      [900, MARGIN],
    ],
  },
  'sea-E': { name: 'East Ocean', center: [1150, 600], shape: rect(E0, 300, SIZE, 900) },
  'sea-SE': {
    name: 'Southeast Ocean',
    center: [1150, 1150],
    shape: [
      [E0, 900],
      [SIZE, 900],
      [SIZE, SIZE],
      [900, SIZE],
      [900, E0],
      [E0, E0],
    ],
  },
  'sea-S': { name: 'South Ocean', center: [600, 1150], shape: rect(300, E0, 900, SIZE) },
  'sea-SW': {
    name: 'Southwest Ocean',
    center: [50, 1150],
    shape: [
      [0, 900],
      [MARGIN, 900],
      [MARGIN, E0],
      [300, E0],
      [300, SIZE],
      [0, SIZE],
    ],
  },
  'sea-W': { name: 'West Ocean', center: [50, 600], shape: rect(0, 300, MARGIN, 900) },
  'sea-inland': { name: 'Inland Sea', center: [600, 600], shape: rect(500, 500, 700, 700) },
};

export function generateBasinMap(): MapDef {
  const territories: TerritoryDef[] = [];
  GRID.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === null) return;
      const x = MARGIN + c * CELL;
      const y = MARGIN + r * CELL;
      const land: string[] = [];
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const neighbour = GRID[r + dr]?.[c + dc];
        if (neighbour) land.push(neighbour.id);
      }
      const side = cell.id.split('-')[0] ?? '';
      const traits =
        cell.homeOf !== null
          ? HOME_TEMPLATE[cell.role]
          : cell.role === 'frontier'
            ? { ...FRONTIER[side]!, population: 1, start: [] }
            : {
                terrain: 'plains' as const,
                population: 1,
                features: ['farmland' as const, 'water' as const],
                start: [],
              };
      if (!traits) throw new Error(`no template for ${cell.id}`);
      territories.push({
        id: cell.id,
        name: cell.name,
        role: cell.role,
        terrain: traits.terrain,
        homeOf: cell.homeOf,
        population: traits.population,
        features: [...traits.features],
        sites: [
          [x + 50, y + 50],
          [x + 150, y + 50],
          [x + 50, y + 150],
          [x + 150, y + 150],
        ],
        garrison: [x + 100, y + 100],
        shape: rect(x, y, x + CELL, y + CELL),
        land: land.sort(),
        sea: Object.getOwnPropertyNames(SEA_COASTS)
          .filter((zone) => SEA_COASTS[zone]!.includes(cell.id))
          .sort(),
        start: [...traits.start],
      });
    });
  });

  const seaZones = Object.getOwnPropertyNames(SEA_SHAPES)
    .sort()
    .map((zoneId) => {
      const ringIndex = OCEAN_RING.indexOf(zoneId);
      const adjacentSea =
        ringIndex < 0
          ? []
          : [
              OCEAN_RING[(ringIndex + OCEAN_RING.length - 1) % OCEAN_RING.length]!,
              OCEAN_RING[(ringIndex + 1) % OCEAN_RING.length]!,
            ].sort();
      const def = SEA_SHAPES[zoneId]!;
      return {
        id: zoneId,
        name: def.name,
        kind: zoneId === 'sea-inland' ? ('inland' as const) : ('ocean' as const),
        adjacentSea,
        center: def.center,
        shape: def.shape,
      };
    });

  return {
    id: 'basin-4p',
    name: 'The Basin (test map)',
    version: '0.1',
    size: [SIZE, SIZE],
    homes: ['A', 'B', 'C', 'D'],
    territories: territories.sort((a, b) => (a.id < b.id ? -1 : 1)),
    seaZones,
    playerCounts: {
      '2': { homes: ['A', 'C'] },
      '3': { homes: ['A', 'B', 'C'] },
      '4': { homes: ['A', 'B', 'C', 'D'] },
    },
  };
}
