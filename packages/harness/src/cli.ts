#!/usr/bin/env -S npx tsx
import { PASS_ORDERS, expandDeck, rulesetHash, startMatch, stateHash, submit } from '@nukka/core';
import { standardMatch } from './fixtures.js';
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
  const { ctx, state: created } = standardMatch({ seed: 1 });
  let state = startMatch(created);
  while (state.phase !== 'ended') {
    for (const decision of [...state.decisions]) {
      const result = submit(ctx, state, {
        matchId: state.meta.matchId,
        playerId: decision.player,
        seq: (state.lastSeq[decision.player] ?? 0) + 1,
        cmd: { type: 'SubmitPlanning', orders: PASS_ORDERS },
      });
      if (!result.ok) throw new Error(`smoke match: ${result.problems.join('; ')}`);
      state = result.state;
    }
  }
  console.log(
    `match ok: ${state.round} rounds, ${state.result?.reason}, scores ${JSON.stringify(state.result?.scores)}, hash ${stateHash(state)}`,
  );
} else {
  console.error('nukka-sim: match running is not built yet. Use --smoke.');
  process.exitCode = 1;
}
