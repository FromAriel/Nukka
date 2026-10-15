# Milestone 0 — Implementation Notes

Where the engine currently differs from, or fills gaps in, the planning specs. Each item is a deliberate simplification for the headless milestone and can be revisited when playtests say it matters.

## Simplifications

| Area | Spec | Engine today |
|---|---|---|
| Reserves and networks | Food, water and supplies are shared within a supply network | Reserves are national. Only the main (largest) network can draw on them; cut-off networks live on their own output and their surplus is lost. |
| Displaced population | Displaced tokens settle at the next upkeep and don't score until then | Displaced tokens move at once to the owner's nearest territory with housing space; with none, they are lost. |
| Stabilization by allies | A consenting defensive partner may fill the stabilization slot | Only the defender is offered the stabilization slot. |
| Proposals and cards | Proposals use the normal event tray, so cards could answer them | Proposals are answered only by Accept or Decline. |
| Emergency Relay after sabotage | The victim may play it after the intelligence step | Not offered yet; it is only playable inside a chain, where no current card makes it legal. |
| Submarine missiles | Submarines hold 2 missiles each | Submarines launch warheads drawn from the national stock, up to 2 per submarine. |
| Ammunition storage | Bombs and missiles are stored at specific installations | Ammunition is a national stockpile, except weapons loaded into silos and launchers. |
| Defense policy | Chosen before each combat | Every player uses Balanced until a command for it is added. |
| Honor decline | The partner may end the agreement without breach penalties | The partner's hostility rises; ending the agreement is left to the partner's own actions. |
| Hidden builds on the map | Covert Program hides a build from posture and tension | The installation or unit exists in state with a `hidden` flag; per-player views (step 5) will hide it from others. |

## Timing decisions

- **Cards resolve after planning,** so card effects that change planning (extra or fewer orders) always apply to the next round. *Full Mobilization* was reworded to match.
- **Round 1 has no upkeep:** the match starts at round 1 planning with the starting reserves and hands.
- **Unfilled shadow slots** are padded with blanks by the engine, identically for every player.
- **Operation tension** is applied when the operation is declared in the events phase, not when it is fought.

## Combat

The rules engine defines the combat boundary (`CombatInput`, `CombatResult`, `CombatResolver`) and applies results. The resolver comes from the combat package (Milestone 0 step 6). Tests use scripted resolvers.
