/**
 * Military operations: declaration, war, honor calls, nuclear commitments and
 * applying combat results (main design §7, §9; Tension spec §3; Weapons spec §9).
 */
import { sortedEntries } from '../collections.js';
import { distanceSquared } from '../fixed.js';
import type { CombatResult } from './combat-interface.js';
import { installationRules, territoryDef, type MatchContext } from './context.js';
import { breachIfProtected, relation, treatiesBetween } from './diplomacy.js';
import { transferTerritory } from './effects.js';
import type { EventSink } from './events.js';
import { revealCovertPrograms } from './hidden-assets.js';
import { activeModifiers } from './modifiers.js';
import { addUnits, newId } from './setup.js';
import { changeBlame, changeHostility, changeInfamy, changeTension, isPariah } from './tension.js';
import {
  pairKey,
  type Condition,
  type DeclaredOperation,
  type GameState,
  type MainAction,
  type NuclearPlan,
  type PlayerId,
} from './state.js';

type OperationAction = Extract<MainAction, { type: 'operation' }>;

const STEPS: readonly Condition[] = ['operational', 'impaired', 'ruined'];

export function garrisonPoint(ctx: MatchContext, territory: string): readonly [number, number] {
  return territoryDef(ctx, territory).garrison;
}

function withinRange(ctx: MatchContext, from: string, to: string, range: number): boolean {
  const [ax, ay] = garrisonPoint(ctx, from);
  const [bx, by] = garrisonPoint(ctx, to);
  return distanceSquared(ax, ay, bx, by) <= range * range;
}

/** The territory an operation's target is in, and who owns it. */
export function locateTarget(
  ctx: MatchContext,
  state: GameState,
  action: OperationAction,
): { territory: string; owner: PlayerId | null } | null {
  if (action.target.startsWith('lane:')) {
    const [a] = action.target.slice(5).split('|');
    return a && state.territories[a] ? { territory: a, owner: state.territories[a]!.owner } : null;
  }
  const inst = state.installations[action.target];
  if (inst) return { territory: inst.territory, owner: inst.owner };
  const t = state.territories[action.target];
  if (t) return { territory: action.target, owner: t.owner };
  const stack = state.units[action.target];
  if (stack) return { territory: stack.location, owner: stack.owner };
  return null;
}

function summitProtected(state: GameState, a: PlayerId, b: PlayerId | null): boolean {
  if (b === null) return false;
  return (
    activeModifiers(state, a, 'summitAttendee').length > 0 &&
    activeModifiers(state, b, 'summitAttendee').length > 0
  );
}

/** Problems with declaring an operation now; empty means legal. */
export function operationProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  action: OperationAction,
): string[] {
  const where = locateTarget(ctx, state, action);
  if (!where) return [`operation: unknown target "${action.target}"`];
  if (where.owner === player) return ['operation: you can not attack yourself'];
  if (summitProtected(state, player, where.owner))
    return ['operation: summit attendees can not attack each other'];
  const forces = action.forces ?? [];
  const units = ctx.ruleset.units.units;
  for (const f of forces) {
    const stack = state.units[f.stack];
    if (!stack || stack.owner !== player) return [`operation: ${f.stack} is not your unit`];
    if (f.count < 1 || f.count > stack.count) return [`operation: invalid count for ${f.stack}`];
  }
  const stacks = forces.map((f) => ({
    f,
    stack: state.units[f.stack]!,
    rules: units[state.units[f.stack]!.kind]!,
  }));
  switch (action.operation) {
    case 'groundAssault': {
      if (!state.territories[action.target]) return ['groundAssault: target a territory'];
      if (stacks.length === 0) return ['groundAssault: commit at least one ground formation'];
      for (const { stack } of stacks) {
        if (stack.kind !== 'groundFormation')
          return ['groundAssault: only ground formations can assault'];
        if (!territoryDef(ctx, action.target).land.includes(stack.location))
          return [`groundAssault: ${stack.location} does not border ${action.target}`];
      }
      return [];
    }
    case 'airRaid':
    case 'interdiction': {
      if (
        action.operation === 'interdiction' &&
        !action.target.startsWith('lane:') &&
        state.installations[action.target]?.kind !== 'depot'
      ) {
        return ['interdiction: target a depot or a land border (lane:a|b)'];
      }
      if (stacks.length === 0)
        return [`${action.operation}: commit at least one aircraft formation`];
      let bombs = 0;
      for (const { stack, rules, f } of stacks) {
        if (rules.domain !== 'air') return [`${action.operation}: only aircraft can raid`];
        if (!withinRange(ctx, stack.location, where.territory, rules.operationRange ?? 0))
          return [`${action.operation}: ${stack.location} is out of range`];
        bombs +=
          f.count *
          (rules.roles?.['strike']?.conventionalBombs ?? rules.carries?.conventionalBombs ?? 0);
      }
      const have = state.players[player]!.stock['conventionalBombs'] ?? 0;
      if (bombs > have)
        return [`${action.operation}: needs ${bombs} conventional bombs; you have ${have}`];
      return [];
    }
    case 'missileRaid': {
      const launchers = action.launchers ?? [];
      if (launchers.length === 0) return ['missileRaid: choose at least one loaded launcher'];
      const range = ctx.ruleset.units.missiles['conventional']?.range ?? 0;
      for (const id of launchers) {
        const inst = state.installations[id];
        if (!inst || inst.owner !== player || inst.kind !== 'missileLauncher')
          return [`missileRaid: ${id} is not your launcher`];
        if (inst.condition !== 'operational' || (inst.loaded['conventionalMissiles'] ?? 0) < 1)
          return [`missileRaid: ${id} is not ready`];
        if (!withinRange(ctx, inst.territory, where.territory, range))
          return [`missileRaid: ${id} is out of range`];
      }
      return [];
    }
    case 'subHunt': {
      const sub = state.units[action.target];
      if (!sub || sub.kind !== 'submarine') return ['subHunt: target a submarine'];
      const zone = ctx.seaZones.get(sub.location);
      const near = (loc: string) =>
        loc === sub.location || (zone?.adjacentSea.includes(loc) ?? false);
      if (!stacks.some(({ stack }) => stack.kind === 'patrol' && near(stack.location)))
        return ['subHunt: needs a patrol in or next to its sea zone'];
      return [];
    }
  }
}

function isCivilianTarget(ctx: MatchContext, state: GameState, action: OperationAction): boolean {
  if (action.operation === 'groundAssault' || action.operation === 'subHunt') return false;
  const inst = state.installations[action.target];
  if (inst) return installationRules(ctx, inst.kind).civilian;
  return state.territories[action.target] !== undefined; // a territory target means its population center
}

/** Declares war if needed, with the right price (Tension spec §3.2, §4.2, §5.4). */
export function declareWar(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  attacker: PlayerId,
  defender: PlayerId,
): void {
  if (relation(state, attacker, defender) === 'war') return;
  const t = ctx.ruleset.tension;
  let { tension, blame } = t.aggression.declareWar;
  if (isPariah(ctx, state, defender)) ({ tension, blame } = t.pariahWar);
  if (
    activeModifiers(state, attacker, 'freeWarDeclaration').some(
      (m) => m.data['against'] === defender,
    )
  ) {
    tension = 0;
    blame = 0;
  }
  for (const m of activeModifiers(state, defender, 'warDeclarationSurcharge')) {
    tension += Number(m.data['tension'] ?? 0);
    blame += Number(m.data['blame'] ?? 0);
  }
  breachIfProtected(ctx, state, events, attacker, defender);
  state.relations[pairKey(attacker, defender)] = 'war';
  events.push({ type: 'WarDeclared', visibility: 'public', attacker, defender });
  changeTension(ctx, state, events, tension, attacker, `${attacker} declared war on ${defender}`);
  changeBlame(ctx, state, events, attacker, blame, `declared war on ${defender}`);
  for (const treaty of state.treaties.filter(
    (t) => t.kind === 'defensive' && t.parties.includes(defender),
  )) {
    for (const ally of treaty.parties) {
      if (ally !== defender && ally !== attacker && state.players[ally]?.viable) {
        state.honorCalls.push({ ally, partner: defender, aggressor: attacker });
      }
    }
  }
}

/** Puts an operation on the combat schedule (Tension spec §3.2 for its tension). */
export function declareOperation(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  action: OperationAction,
): void {
  const problems = operationProblems(ctx, state, player, action);
  if (problems.length > 0) {
    events.push({
      type: 'ActionFizzled',
      visibility: 'public',
      player,
      operation: action.operation,
      reason: problems.join('; '),
    });
    return;
  }
  const where = locateTarget(ctx, state, action)!;
  const defender = where.owner;
  const t = ctx.ruleset.tension.aggression;
  if (defender !== null) {
    const alreadyAtWar = relation(state, player, defender) === 'war';
    declareWar(ctx, state, events, player, defender);
    if (alreadyAtWar) {
      const spike =
        action.operation === 'missileRaid' ? t.conventionalMissileRaid : t.operationWhileAtWar;
      changeTension(ctx, state, events, spike, player, `${player} ${action.operation}`);
    }
    if (isCivilianTarget(ctx, state, action)) {
      changeTension(
        ctx,
        state,
        events,
        t.civilianTarget.tension,
        player,
        `${player} targeted civilians`,
      );
      changeBlame(ctx, state, events, player, t.civilianTarget.blame, 'targeted civilians');
    }
  }
  const op: DeclaredOperation = {
    id: newId(state, 'op'),
    kind: action.operation,
    attacker: player,
    target: action.target,
    territory: where.territory,
    defender,
    forces: structuredClone(action.forces ?? []),
    launchers: [...(action.launchers ?? [])],
  };
  state.operations.push(op);
  events.push({
    type: 'OperationDeclared',
    visibility: 'public',
    operation: op.id,
    kind: op.kind,
    attacker: player,
    target: op.target,
    defender,
  });
}

export function answerHonorCall(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  ally: PlayerId,
  honor: boolean,
): void {
  for (const call of state.honorCalls.filter((c) => c.ally === ally)) {
    if (honor) {
      if (relation(state, ally, call.aggressor) !== 'war') {
        state.relations[pairKey(ally, call.aggressor)] = 'war';
        const { tension, blame } = ctx.ruleset.tension.honorCall;
        events.push({
          type: 'WarDeclared',
          visibility: 'public',
          attacker: ally,
          defender: call.aggressor,
          honor: true,
        });
        changeTension(
          ctx,
          state,
          events,
          tension,
          ally,
          `${ally} honored its alliance with ${call.partner}`,
        );
        changeBlame(ctx, state, events, ally, blame, 'honored an alliance');
      }
    } else {
      changeHostility(
        ctx,
        state,
        call.partner,
        ally,
        ctx.ruleset.tension.honorCall.declineHostility,
      );
      events.push({ type: 'HonorDeclined', visibility: 'public', ally, partner: call.partner });
    }
  }
  state.honorCalls = state.honorCalls.filter((c) => c.ally !== ally);
}

// ------------------------------------------------------------ nuclear plans

/** Whether a player could launch anything nuclear this window. */
export function hasNuclearDelivery(state: GameState, player: PlayerId): boolean {
  const p = state.players[player];
  if (!p) return false;
  const silo = sortedEntries(state.installations).some(
    ([, i]) => i.owner === player && i.kind === 'silo' && (i.loaded['warheads'] ?? 0) > 0,
  );
  const sub =
    sortedEntries(state.units).some(([, u]) => u.owner === player && u.kind === 'submarine') &&
    (p.stock['warheads'] ?? 0) > 0;
  const bomber =
    sortedEntries(state.units).some(([, u]) => u.owner === player && u.kind === 'bomber') &&
    (p.stock['gravityBombs'] ?? 0) > 0;
  return silo || sub || bomber;
}

export function nuclearPlanProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  plans: readonly NuclearPlan[],
): string[] {
  if (plans.length === 0) return [];
  if (state.tension.release !== 'open' && state.tension.release !== 'aftermath')
    return ['nuclear: release is not open'];
  const moratorium = state.treaties.some(
    (t) => t.kind === 'moratorium' && t.parties.includes(player),
  );
  if (moratorium) return ['nuclear: you signed a moratorium'];
  const p = state.players[player]!;
  const waves = ctx.ruleset.combat.nuclear.waveOffsetsMs.length;
  const used = new Map<string, number>();
  let stockWarheads = p.stock['warheads'] ?? 0;
  let stockBombs = p.stock['gravityBombs'] ?? 0;
  const problems: string[] = [];
  for (const [i, plan] of plans.entries()) {
    const at = `plans[${i}]`;
    if (plan.count < 1) problems.push(`${at}: count must be at least 1`);
    if (plan.wave < 0 || plan.wave >= waves) problems.push(`${at}: wave must be 0–${waves - 1}`);
    if (plan.policy === 'retaliation' && (!plan.trigger || plan.trigger === player))
      problems.push(`${at}: retaliation needs another player as trigger`);
    for (const target of [plan.target, plan.fallback]) {
      if (target === null) continue;
      const owner = state.installations[target]?.owner ?? state.territories[target]?.owner;
      if (owner === undefined) problems.push(`${at}: unknown target "${target}"`);
      else if (owner === player) problems.push(`${at}: can not target yourself`);
      else if (owner !== null && treatiesBetween(state, player, owner, 'ceasefire').length > 0)
        problems.push(`${at}: a ceasefire bars launches at ${owner}`);
    }
    const already = used.get(plan.delivery) ?? 0;
    used.set(plan.delivery, already + plan.count);
    const silo = state.installations[plan.delivery];
    const stack = state.units[plan.delivery];
    if (silo) {
      if (silo.owner !== player || silo.kind !== 'silo') problems.push(`${at}: not your silo`);
      else if (silo.condition !== 'operational') problems.push(`${at}: the silo can not launch`);
      else if (already + plan.count > (silo.loaded['warheads'] ?? 0))
        problems.push(`${at}: the silo holds ${silo.loaded['warheads'] ?? 0}`);
    } else if (stack && stack.owner === player && stack.kind === 'submarine') {
      const capacity = (ctx.ruleset.units.units['submarine']?.missileCapacity ?? 0) * stack.count;
      if (already + plan.count > capacity) problems.push(`${at}: the submarines carry ${capacity}`);
      stockWarheads -= plan.count;
    } else if (stack && stack.owner === player && stack.kind === 'bomber') {
      const capacity =
        (ctx.ruleset.units.units['bomber']?.carries?.nuclearBombs ?? 0) * stack.count;
      if (already + plan.count > capacity) problems.push(`${at}: the bombers carry ${capacity}`);
      stockBombs -= plan.count;
    } else problems.push(`${at}: "${plan.delivery}" is not your nuclear delivery system`);
  }
  if (stockWarheads < 0) problems.push('nuclear: not enough warheads in stock for the submarines');
  if (stockBombs < 0) problems.push('nuclear: not enough gravity bombs in stock');
  return problems;
}

// ------------------------------------------------------------ applying results

function damageInstallation(state: GameState, id: string, steps: number, events: EventSink): void {
  const inst = state.installations[id];
  if (!inst || steps <= 0) return;
  const index = Math.min(STEPS.length - 1, STEPS.indexOf(inst.condition) + steps);
  inst.condition = STEPS[index]!;
  if (inst.condition === 'ruined') {
    inst.loaded = {};
    inst.repairCompletesRound = null;
    if (inst.magazine !== null) inst.magazine = 0;
  }
  events.push({
    type: 'InstallationDamaged',
    visibility: 'public',
    installation: id,
    condition: inst.condition,
  });
}

function housingSpace(ctx: MatchContext, state: GameState, territory: string): number {
  const def = territoryDef(ctx, territory);
  let capacity = ctx.ruleset.economy.housing[def.terrain] ?? 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.territory === territory && inst.condition !== 'ruined')
      capacity += installationRules(ctx, inst.kind).economy?.housingBonus ?? 0;
  }
  return capacity - (state.territories[territory]?.population ?? 0);
}

/** Displaced tokens move to the owner's nearest territory with room; with no room they are lost. */
function displace(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  from: string,
  count: number,
): void {
  const owner = state.territories[from]?.owner;
  let left = count;
  if (owner) {
    const [fx, fy] = garrisonPoint(ctx, from);
    const options = ctx.territoryIds
      .filter((id) => id !== from && state.territories[id]?.owner === owner)
      .map((id) => {
        const [x, y] = garrisonPoint(ctx, id);
        return { id, d: distanceSquared(fx, fy, x, y) };
      })
      .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
    for (const { id } of options) {
      if (left === 0) break;
      const move = Math.min(left, Math.max(0, housingSpace(ctx, state, id)));
      if (move > 0) {
        state.territories[id]!.population += move;
        left -= move;
        events.push({
          type: 'PopulationDisplaced',
          visibility: 'public',
          from,
          to: id,
          amount: move,
        });
      }
    }
  }
  if (left > 0)
    events.push({
      type: 'PopulationLost',
      visibility: 'public',
      territory: from,
      amount: left,
      cause: 'displacement',
    });
}

/** Applies a combat result to state (aftermath, main design §3F). */
export function applyCombatResult(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  result: CombatResult,
): void {
  // A hidden Covert Program asset that launches or fires gives the program away (Covert spec §8).
  const revealed = new Set<PlayerId>();
  for (const id of result.assetsUsed) {
    const asset = state.installations[id] ?? state.units[id];
    if (asset?.hidden) revealed.add(asset.owner);
  }
  for (const player of [...revealed].sort())
    revealCovertPrograms(ctx, state, events, player, 'used in combat');

  for (const hit of result.installationHits)
    damageInstallation(state, hit.installation, hit.steps, events);
  for (const partial of result.hardHits) {
    const inst = state.installations[partial.installation];
    if (inst) inst.hardHits = inst.condition === 'ruined' ? 0 : partial.hits;
  }
  for (const loss of result.unitLosses) {
    const stack = state.units[loss.stack];
    if (!stack) continue;
    stack.count -= Math.min(stack.count, loss.count);
    if (stack.count === 0) delete state.units[loss.stack];
  }
  for (const loss of result.militiaLosses) {
    const t = state.territories[loss.territory];
    if (t) t.militia = Math.max(0, t.militia - loss.count);
  }
  for (const tie of result.tiedClaims) {
    const t = state.territories[tie.territory];
    if (t && t.owner === null) {
      t.militia = ctx.ruleset.match.neutral.militiaAfterTiedClaim;
      events.push({ type: 'NeutralClaimTied', visibility: 'public', territory: tie.territory });
    }
  }
  for (const use of result.ammunitionUsed) {
    const p = state.players[use.player];
    const inst = use.installation ? state.installations[use.installation] : undefined;
    if (inst) inst.loaded[use.kind] = Math.max(0, (inst.loaded[use.kind] ?? 0) - use.count);
    else if (p) p.stock[use.kind] = Math.max(0, (p.stock[use.kind] ?? 0) - use.count);
  }
  for (const use of result.magazinesUsed) {
    const inst = state.installations[use.installation];
    if (inst && inst.magazine !== null) inst.magazine = Math.max(0, inst.magazine - use.shots);
  }
  for (const lane of result.disruptedLanes) {
    const [a, b] = lane.a < lane.b ? [lane.a, lane.b] : [lane.b, lane.a];
    state.disruptedLanes.push({
      a,
      b,
      untilRound: state.round + ctx.ruleset.combat.interdictionDisruptRounds,
    });
  }

  // Nuclear detonations.
  const fx = ctx.ruleset.combat.nuclearEffects;
  for (const d of result.detonations) {
    if (state.tension.release !== 'aftermath') {
      state.tension.release = 'aftermath';
      const first = ctx.ruleset.tension.aggression.firstNuclearLaunch;
      changeBlame(ctx, state, events, d.player, first.blame, 'first nuclear use');
      changeInfamy(state, d.player, first.infamy);
      events.push({ type: 'FirstNuclearUse', visibility: 'public', player: d.player });
    }
    const t = state.territories[d.territory];
    if (t) {
      if (t.population > 0 && t.owner !== null && t.owner !== d.player) {
        changeBlame(
          ctx,
          state,
          events,
          d.player,
          ctx.ruleset.tension.aggression.laterNuclearPopulationStrikeBlame,
          'nuclear strike on a population',
        );
      }
      t.contaminationRounds = Math.max(t.contaminationRounds, fx.contaminationRounds + 1);
    }
    state.devastation += fx.devastationPerDetonation;
    events.push({
      type: 'NuclearDetonation',
      visibility: 'public',
      player: d.player,
      territory: d.territory,
      devastation: state.devastation,
    });
  }

  for (const pop of result.population) {
    const t = state.territories[pop.territory];
    if (!t) continue;
    const killed = Math.min(t.population, pop.killed);
    t.population -= killed;
    t.hungry = Math.min(t.hungry, t.population);
    if (killed > 0)
      events.push({
        type: 'PopulationLost',
        visibility: 'public',
        territory: pop.territory,
        amount: killed,
        cause: 'combat',
      });
    const displaced = Math.min(t.population, pop.displaced);
    t.population -= displaced;
    t.hungry = Math.min(t.hungry, t.population);
    if (displaced > 0) displace(ctx, state, events, pop.territory, displaced);
  }

  for (const capture of result.captures)
    captureTerritory(ctx, state, events, capture.territory, capture.by);

  if (state.tension.release === 'aftermath') state.tension.value = ctx.ruleset.tension.max;
  state.lastCombat = result.detonations.length > 0 ? 'nuclear' : 'conventional';
}

function captureTerritory(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  territory: string,
  by: PlayerId,
): void {
  const t = state.territories[territory];
  if (!t || t.owner === by) return;
  const previous = t.owner;
  for (const [id, inst] of sortedEntries(state.installations)) {
    if (inst.territory !== territory) continue;
    if ((ctx.ruleset.tension.posturePoints[inst.kind] ?? 0) > 0) {
      delete state.installations[id]; // nuclear assets are scuttled, not captured
      events.push({
        type: 'InstallationScuttled',
        visibility: 'public',
        installation: id,
        kind: inst.kind,
      });
      continue;
    }
    damageInstallation(state, id, 1, events);
  }
  for (const [id, stack] of sortedEntries(state.units)) {
    if (
      stack.location === territory &&
      stack.owner !== by &&
      ctx.ruleset.units.units[stack.kind]?.domain !== 'air'
    )
      delete state.units[id];
  }
  transferTerritory(ctx, state, territory, by);
  // The surviving assault forces move in.
  for (const op of state.operations) {
    if (op.kind !== 'groundAssault' || op.target !== territory || op.attacker !== by) continue;
    for (const f of op.forces) {
      const stack = state.units[f.stack];
      if (!stack) continue;
      const count = Math.min(f.count, stack.count);
      stack.count -= count;
      addUnits(state, by, stack.kind, territory, count);
      if (stack.count === 0) delete state.units[f.stack];
    }
  }
  events.push({ type: 'TerritoryCaptured', visibility: 'public', territory, by, from: previous });
  const aggression = ctx.ruleset.tension.aggression;
  if (previous === null)
    changeTension(
      ctx,
      state,
      events,
      ctx.ruleset.match.neutral.captureTension,
      by,
      `${by} took neutral ${territory}`,
    );
  else if (t.startingOwner === previous)
    changeTension(
      ctx,
      state,
      events,
      aggression.captureStartingTerritory,
      by,
      `${by} captured ${territory}`,
    );
}
