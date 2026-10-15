# Milestone 0 — First Harness Results

The first bot run of the complete headless game. It's evidence about **the rules and the current bots together**: the bots are simple utility planners, so a strategy that looks weak may simply be played badly. Treat these as leads to investigate, not balance verdicts.

## The run

```
pnpm sim -- --matches 500 --bots builder,expansionist,defender,brinkman,spy,rock,peacemaker --seed 1 --out results/m0-acceptance
```

- Ruleset `base-0.1`, map `basin-4p`, scenario `cold-start`, 4 players.
- The 7 personalities rotate through the 4 seats, so each plays about 285 matches against varied opponents.
- Combat is resolved by the autopilot simulation.

**Milestone 0 acceptance:** all 500 matches finished with no errors and no stuck decisions. Bots averaged 0.01 rejected commands per match, and no decision fell back to the default. Command logs replay to identical hashes. About 145 ms per match.

## Results

| Personality | Win rate | Average score |
|---|---|---|
| Expansionist | 65% | 51.1 |
| Brinkman | 41% | 42.9 |
| Rock | 35% | 37.8 |
| Peacemaker | 17% | 35.1 |
| Spy | 13% | 28.5 |
| Builder | 12% | 32.7 |
| Defender | 4% | 27.5 |

Win rates add up to more than 100% because tied top scores all count as wins.

| Measure (main design §16) | Value |
|---|---|
| Average peak tension | 61 |
| Matches where release opened | 22% |
| Matches with nuclear use | 0% |
| Captures per match | 10.6 |
| Wars declared per match | 2.8 |
| Treaties signed per match | 9.7 |
| Cards played per match | 10.2 |
| Covert outcomes (all matches) | 613 succeeded, 712 foiled, 317 exposed |
| Matches with an elimination | 29% |
| Round-7 leader goes on to win | 46% |

## What it suggests

1. **Expansion is dominant.** Taking neutral land is cheap: 2 formations beat 2 militia, and each capture is worth +2 score, plus +3 per population token and the territory's resources. Levers to try: stronger militia, a higher capture cost, or less score per non-starting territory.
2. **Pure defense doesn't score.** Defensive spending protects score but doesn't create any. The Defender bot also never expands. Score for "supported population" may need to reward resilience more, or the bot needs to expand too.
3. **No one uses nuclear weapons.** The bots only commit retaliation-only plans, and the Brinkman bot only strikes first once the world is already in the aftermath state. Survival-weighted scoring is doing its job; the open question is whether a smarter first-strike bot would profit.
4. **Eliminations happen in nearly a third of matches.** That's worth checking against the "losing players linger" and snowballing risks.
5. **The round-7 leader wins about half the time,** so leads are not runaway yet.
6. **Covert operations work as designed:** roughly a third succeed, 43% are foiled, and 19% are exposed.

## Next steps for balance work

- Use `--sweep` to test single levers, for example `--sweep match.neutral.militiaPerTerritory=2,3,4`.
- Improve the bots where they're clearly naive (the Defender never expands; nobody plays a calculated first strike) before drawing firm conclusions.
