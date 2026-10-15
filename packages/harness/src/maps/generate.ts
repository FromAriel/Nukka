import { writeFileSync } from 'node:fs';
import { mapPath } from '../data.js';
import { generateBasinMap } from './basin.js';

/** Writes generated maps to data/maps/. Run with `pnpm gen:maps`. */
export function renderMapJson(): string {
  return `${JSON.stringify(generateBasinMap(), null, 2)}\n`;
}

if (process.argv[1]?.endsWith('generate.ts')) {
  writeFileSync(mapPath('basin-4p'), renderMapJson());
  console.log(`wrote ${mapPath('basin-4p')}`);
}
