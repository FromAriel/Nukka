#!/usr/bin/env -S npx tsx
import { expandDeck, rulesetHash } from '@nukka/core';
import { loadDeck, loadMap, loadRuleset } from './data.js';
import { runSmoke } from './smoke.js';

const args = process.argv.slice(2);

if (args.includes('--smoke')) {
  const result = runSmoke();
  const ruleset = loadRuleset('base-0.1');
  const map = loadMap('basin-4p', ruleset);
  const deck = loadDeck('base-0.1');
  console.log(`smoke ok: ${result.checks} check(s), hash ${result.hash}`);
  console.log(
    `data ok: ruleset base-0.1 (${rulesetHash(ruleset)}), map ${map.id} ` +
      `(${map.territories.length} territories, ${map.seaZones.length} sea zones), ` +
      `deck ${deck.id} (${deck.cards.length} designs, ${expandDeck(deck).length} cards)`,
  );
} else {
  console.error('nukka-sim: match running is not built yet. Use --smoke.');
  process.exitCode = 1;
}
