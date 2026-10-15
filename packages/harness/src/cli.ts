#!/usr/bin/env -S npx tsx
import { runSmoke } from './smoke.js';

const args = process.argv.slice(2);

if (args.includes('--smoke')) {
  const result = runSmoke();
  console.log(`smoke ok: ${result.checks} check(s), hash ${result.hash}`);
} else {
  console.error('nukka-sim: match running is not built yet. Use --smoke.');
  process.exitCode = 1;
}
