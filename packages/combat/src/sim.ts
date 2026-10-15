/**
 * Autopilot combat simulation (Weapons and Combat spec). A fixed 20 Hz tick
 * loop over integer positions: attacks run on their plans, defenses fire on
 * autopilot with real ranges, magazines and fire rates, and every hit or miss
 * is a visible collision — no hidden rolls.
 */
import {
  EMPTY_RESULT,
  ceilDiv,
  disabledInstallations,
  floorDiv,
  installationRules,
  mulPermille,
  poweredInstallations,
  sortedEntries,
  territoryDef,
  type CombatInput,
  type CombatResult,
  type DefensePolicy,
  type DefenseRules,
  type GameState,
  type Installation,
  type MatchContext,
  type NuclearPlan,
  type PlayerId,
} from '@nukka/core';
import {
  MILLI,
  distance,
  moveToward,
  msToTicks,
  perTick,
  toMilli,
  travelTicks,
  within,
  type Vec,
} from './geometry.js';

// ------------------------------------------------------------ entities

interface Target {
  kind: 'installation' | 'population' | 'lane';
  id: string;
  territory: string;
  owner: PlayerId | null;
  pos: Vec;
  lane?: [string, string];
}

type ThreatKind = 'aircraft' | 'bomber' | 'missile' | 'strategic';

interface Threat {
  id: string;
  owner: PlayerId;
  kind: ThreatKind;
  pos: Vec;
  speed: number;
  /** Missiles: fixed per-tick velocity and impact tick. */
  vel: Vec;
  impactTick: number | null;
  launchTick: number;
  hp: number;
  target: Target;
  bombs: number;
  nuclear: boolean;
  planId: string | null;
  stack: string | null;
  alive: boolean;
  /** Ticks each battery has been tracking it in range without radar. */
  tracked: Map<string, number>;
}

interface Falling {
  owner: PlayerId;
  target: Target;
  landTick: number;
  nuclear: boolean;
  planId: string | null;
  count: number;
}

interface Battery {
  id: string;
  owner: PlayerId;
  pos: Vec;
  rules: DefenseRules;
  range: number;
  interval: number;
  readyAt: number;
  magazine: number | null;
  shots: number;
  engagementsLeft: number;
}

interface Shot {
  battery: Battery;
  arriveTick: number;
  aim: Vec;
  threat: string;
}

interface GroundUnit {
  id: string;
  owner: PlayerId | null;
  stack: string | null;
  battle: string;
  side: 'attacker' | 'defender';
  pos: Vec;
  dest: Vec;
  speed: number;
  hp: number;
  range: number;
  damage: number;
  interval: number;
  readyAt: number;
  alive: boolean;
}

interface Detector {
  owner: PlayerId;
  pos: Vec;
  range: number;
}

interface PlanLaunch {
  plan: NuclearPlan;
  owner: PlayerId;
  /** Tick at which a scheduled plan launches; null for retaliation until triggered. */
  tick: number | null;
  done: boolean;
}

// ------------------------------------------------------------ simulation

export class CombatSim {
  readonly ticksPerSecond: number;
  readonly windowTicks: number;
  readonly endTicks: number;
  tick = 0;

  private readonly threats: Threat[] = [];
  private readonly falling: Falling[] = [];
  private readonly batteries: Battery[] = [];
  private readonly shots: Shot[] = [];
  private readonly ground: GroundUnit[] = [];
  private readonly detectors: Detector[] = [];
  private readonly launches: PlanLaunch[] = [];
  private readonly subHunts: {
    owner: PlayerId;
    sub: string;
    patrols: number;
    hp: number;
    interval: number;
    damage: number;
  }[] = [];
  private readonly allies = new Map<PlayerId, Set<PlayerId>>();
  private readonly policies: Readonly<Record<PlayerId, DefensePolicy>>;
  private nextId = 1;

  // Accumulated outcome.
  private readonly installationHits = new Map<string, number>();
  private readonly ruined = new Set<string>();
  private readonly nuclearSteps = new Map<string, number>();
  private readonly populationHits = new Map<string, number>();
  private readonly populationNuclear = new Map<string, { killed: number; displaced: number }>();
  private readonly unitLosses = new Map<string, number>();
  private readonly militiaLosses = new Map<string, number>();
  private readonly ammunition = new Map<
    string,
    { player: PlayerId; kind: string; count: number; installation?: string }
  >();
  private readonly detonations: { player: PlayerId; territory: string; plan: string }[] = [];
  private readonly lanes = new Map<string, { a: string; b: string }>();
  private readonly destroyedStacks = new Set<string>();
  /** Installations and stacks that launched or fired. */
  private readonly used = new Set<string>();
  private captures: { territory: string; by: PlayerId }[] = [];
  private tiedClaims: { territory: string }[] = [];

  constructor(
    private readonly ctx: MatchContext,
    private readonly state: Readonly<GameState>,
    private readonly input: CombatInput,
  ) {
    const combat = ctx.ruleset.combat;
    this.ticksPerSecond = combat.ticksPerSecond;
    const window = input.kind === 'nuclear' ? combat.nuclear : combat.conventional;
    this.windowTicks = msToTicks(window.windowMs, this.ticksPerSecond);
    this.endTicks = this.windowTicks + msToTicks(window.cleanupMs, this.ticksPerSecond);
    this.policies = input.policies;
    for (const id of state.playerIds) {
      const set = new Set<PlayerId>([id]);
      for (const t of state.treaties)
        if (t.kind === 'defensive' && t.parties.includes(id)) for (const p of t.parties) set.add(p);
      this.allies.set(id, set);
    }
    this.setupDefenses();
    this.setupOperations();
    this.setupPlans();
  }

  private id(prefix: string): string {
    return `${prefix}${this.nextId++}`;
  }

  private ticks(ms: number): number {
    return msToTicks(ms, this.ticksPerSecond);
  }

  // ---------------------------------------------------------- setup

  private installationPos(inst: Installation): Vec {
    const def = territoryDef(this.ctx, inst.territory);
    return toMilli(def.sites[inst.site] ?? def.garrison);
  }

  private garrison(territory: string): Vec {
    return toMilli(territoryDef(this.ctx, territory).garrison);
  }

  private seaCenter(zone: string): Vec {
    const sea = this.ctx.seaZones.get(zone);
    return sea ? toMilli(sea.center) : this.garrison(zone);
  }

  private stackPos(location: string): Vec {
    return this.ctx.seaZones.has(location) ? this.seaCenter(location) : this.garrison(location);
  }

  private setupDefenses(): void {
    const { ctx, state } = this;
    const powered = poweredInstallations(ctx, state as GameState);
    const disabled = disabledInstallations(state as GameState);
    const relay = state.modifiers.filter(
      (m) =>
        m.stat === 'backupDetection' && m.fromRound <= state.round && state.round <= m.untilRound,
    );
    for (const [id, inst] of sortedEntries(state.installations)) {
      const working =
        inst.condition !== 'ruined' &&
        inst.repairCompletesRound === null &&
        powered.has(id) &&
        !disabled.has(id);
      if (inst.kind === 'radar') {
        const range = (installationRules(ctx, 'radar').economy?.visionRange ?? 0) * MILLI;
        if (working)
          this.detectors.push({ owner: inst.owner, pos: this.installationPos(inst), range });
        else if (relay.some((m) => m.data['at'] === id)) {
          const permille = ctx.ruleset.combat.emergencyRelayRangePermille;
          this.detectors.push({
            owner: inst.owner,
            pos: this.installationPos(inst),
            range: mulPermille(range, permille),
          });
        }
        continue;
      }
      const rules = ctx.ruleset.defenses.defenses[inst.kind];
      if (!rules || !working) continue;
      if (inst.magazine !== null && inst.magazine <= 0) continue;
      const base = Math.max(1, this.ticks(rules.intervalMs));
      this.batteries.push({
        id,
        owner: inst.owner,
        pos: this.installationPos(inst),
        rules,
        range: rules.range * MILLI,
        interval: inst.condition === 'impaired' ? base * 2 : base,
        readyAt: 0,
        magazine: inst.magazine,
        shots: 0,
        engagementsLeft: rules.engagementsPerWindow ?? Number.MAX_SAFE_INTEGER,
      });
    }
    const patrol = ctx.ruleset.units.units['patrol'];
    for (const [, u] of sortedEntries(state.units)) {
      if (u.kind === 'patrol' && patrol?.visionRange) {
        this.detectors.push({
          owner: u.owner,
          pos: this.seaCenter(u.location),
          range: patrol.visionRange * MILLI,
        });
      }
    }
  }

  private targetFor(target: string, owner: PlayerId | null): Target | null {
    const { state } = this;
    if (target.startsWith('lane:')) {
      const [a, b] = target.slice(5).split('|');
      if (!a || !b || !state.territories[a] || !state.territories[b]) return null;
      const pa = this.garrison(a);
      const pb = this.garrison(b);
      return {
        kind: 'lane',
        id: target,
        territory: a,
        owner,
        pos: { x: floorDiv(pa.x + pb.x, 2), y: floorDiv(pa.y + pb.y, 2) },
        lane: [a, b],
      };
    }
    const inst = state.installations[target];
    if (inst)
      return {
        kind: 'installation',
        id: target,
        territory: inst.territory,
        owner: inst.owner,
        pos: this.installationPos(inst),
      };
    const t = state.territories[target];
    if (t)
      return {
        kind: 'population',
        id: target,
        territory: target,
        owner: t.owner,
        pos: this.garrison(target),
      };
    return null;
  }

  private useAmmo(player: PlayerId, kind: string, count: number, installation?: string): void {
    if (count <= 0) return;
    const key = `${player}|${kind}|${installation ?? ''}`;
    const entry = this.ammunition.get(key);
    if (entry) entry.count += count;
    else
      this.ammunition.set(key, { player, kind, count, ...(installation ? { installation } : {}) });
  }

  private setupOperations(): void {
    const { ctx, state } = this;
    const units = ctx.ruleset.units;
    const terrain = ctx.ruleset.combat.terrain;
    const battles = new Set<string>();
    for (const op of this.input.operations) {
      const target = this.targetFor(op.target, op.defender);
      switch (op.kind) {
        case 'groundAssault': {
          battles.add(op.target);
          const dest = this.garrison(op.target);
          const speedPermille =
            terrain[territoryDef(ctx, op.target).terrain]?.attackerSpeedPermille ?? 1000;
          for (const f of op.forces) {
            const stack = state.units[f.stack];
            const rules = stack ? units.units[stack.kind] : undefined;
            if (!stack || !rules?.weapon) continue;
            for (let i = 0; i < Math.min(f.count, stack.count); i++) {
              this.ground.push(
                this.groundUnit(
                  op.attacker,
                  stack.id,
                  op.target,
                  'attacker',
                  this.garrison(stack.location),
                  dest,
                  mulPermille(perTick(rules.speed, this.ticksPerSecond), speedPermille),
                  rules.hp,
                  rules.weapon,
                  stack.unsupplied > 0,
                ),
              );
            }
          }
          break;
        }
        case 'airRaid':
        case 'interdiction': {
          if (!target) break;
          for (const f of op.forces) {
            const stack = state.units[f.stack];
            const rules = stack ? units.units[stack.kind] : undefined;
            if (!stack || !rules) continue;
            const bombs =
              rules.roles?.['strike']?.conventionalBombs ?? rules.carries?.conventionalBombs ?? 0;
            if (f.count > 0) this.used.add(stack.id);
            for (let i = 0; i < Math.min(f.count, stack.count); i++) {
              this.useAmmo(op.attacker, 'conventionalBombs', bombs);
              this.threats.push(
                this.flyer(
                  op.attacker,
                  stack.kind === 'bomber' ? 'bomber' : 'aircraft',
                  stack.id,
                  this.garrison(stack.location),
                  rules.speed,
                  rules.hp,
                  target,
                  bombs,
                  false,
                  null,
                  i,
                ),
              );
            }
          }
          break;
        }
        case 'missileRaid': {
          if (!target) break;
          const missile = units.missiles['conventional']!;
          for (const launcherId of op.launchers) {
            const launcher = state.installations[launcherId];
            if (!launcher) continue;
            const count = launcher.loaded['conventionalMissiles'] ?? 0;
            this.useAmmo(op.attacker, 'conventionalMissiles', count, launcherId);
            if (count > 0) this.used.add(launcherId);
            for (let i = 0; i < count; i++)
              this.launchMissile(
                op.attacker,
                'missile',
                this.installationPos(launcher),
                target,
                missile.speed,
                missile.hp,
                false,
                null,
                i,
              );
          }
          break;
        }
        case 'subHunt': {
          const sub = state.units[op.target];
          const patrol = units.units['patrol'];
          const subRules = units.units['submarine'];
          if (!sub || !patrol?.weapon || !subRules) break;
          const patrols = op.forces.reduce(
            (s, f) =>
              s +
              (state.units[f.stack]?.kind === 'patrol'
                ? Math.min(f.count, state.units[f.stack]!.count)
                : 0),
            0,
          );
          this.subHunts.push({
            owner: op.attacker,
            sub: sub.id,
            patrols,
            hp: subRules.hp * MILLI,
            interval: this.ticks(patrol.weapon.intervalMs),
            damage: patrol.weapon.damage * MILLI,
          });
          break;
        }
      }
    }
    // Defenders of every assaulted territory.
    for (const territory of [...battles].sort()) {
      const t = state.territories[territory]!;
      const pos = this.garrison(territory);
      for (const [, stack] of sortedEntries(state.units)) {
        if (stack.location !== territory || stack.owner !== t.owner) continue;
        const rules = units.units[stack.kind];
        if (!rules?.weapon || rules.domain !== 'ground') continue;
        for (let i = 0; i < stack.count; i++)
          this.ground.push(
            this.groundUnit(
              stack.owner,
              stack.id,
              territory,
              'defender',
              pos,
              pos,
              0,
              rules.hp,
              rules.weapon,
              stack.unsupplied > 0,
            ),
          );
      }
      const militia = units.units['militia'];
      if (militia?.weapon) {
        for (let i = 0; i < t.militia; i++)
          this.ground.push(
            this.groundUnit(
              null,
              null,
              territory,
              'defender',
              pos,
              pos,
              0,
              militia.hp,
              militia.weapon,
              false,
            ),
          );
      }
    }
  }

  private groundUnit(
    owner: PlayerId | null,
    stack: string | null,
    battle: string,
    side: 'attacker' | 'defender',
    pos: Vec,
    dest: Vec,
    speed: number,
    hp: number,
    weapon: { range: number; damage: number; intervalMs: number },
    halfRate: boolean,
  ): GroundUnit {
    const interval = Math.max(1, this.ticks(weapon.intervalMs)) * (halfRate ? 2 : 1);
    return {
      id: this.id('g'),
      owner,
      stack,
      battle,
      side,
      pos: { ...pos },
      dest,
      speed,
      hp: hp * MILLI,
      range: weapon.range * MILLI,
      damage: weapon.damage * MILLI,
      interval,
      readyAt: 0,
      alive: true,
    };
  }

  private flyer(
    owner: PlayerId,
    kind: ThreatKind,
    stack: string | null,
    from: Vec,
    speed: number,
    hp: number,
    target: Target,
    bombs: number,
    nuclear: boolean,
    planId: string | null,
    stagger: number,
  ): Threat {
    return {
      id: this.id('t'),
      owner,
      kind,
      // Formations fly spread out, so one burst can't hit a whole raid.
      pos: { x: from.x, y: from.y + stagger * this.ctx.ruleset.combat.formationSpacing * MILLI },
      speed: perTick(speed, this.ticksPerSecond),
      vel: { x: 0, y: 0 },
      impactTick: null,
      launchTick: this.tick,
      hp: hp * MILLI,
      target,
      bombs,
      nuclear,
      planId,
      stack,
      alive: true,
      tracked: new Map(),
    };
  }

  private launchMissile(
    owner: PlayerId,
    kind: 'missile' | 'strategic',
    from: Vec,
    target: Target,
    speed: number,
    hp: number,
    nuclear: boolean,
    planId: string | null,
    stagger: number,
  ): void {
    const strategic = this.ctx.ruleset.units.missiles['strategic']!;
    let flight = travelTicks(distance(from, target.pos), speed, this.ticksPerSecond);
    if (kind === 'strategic') {
      flight = Math.min(
        this.ticks(strategic.maxFlightMs ?? 25_000),
        Math.max(this.ticks(strategic.minFlightMs ?? 10_000), flight),
      );
    }
    const launch = this.tick + stagger;
    this.threats.push({
      id: this.id('t'),
      owner,
      kind,
      pos: { ...from },
      speed: 0,
      vel: {
        x: floorDiv(target.pos.x - from.x, flight),
        y: floorDiv(target.pos.y - from.y, flight),
      },
      impactTick: launch + flight,
      launchTick: launch,
      hp: hp * MILLI,
      target,
      bombs: 0,
      nuclear,
      planId,
      stack: null,
      alive: true,
      tracked: new Map(),
    });
  }

  private setupPlans(): void {
    const waves = this.ctx.ruleset.combat.nuclear.waveOffsetsMs;
    for (const [owner, plans] of sortedEntries(this.input.plans)) {
      for (const plan of plans) {
        this.launches.push({
          plan,
          owner,
          tick: plan.policy === 'scheduled' ? this.ticks(waves[plan.wave] ?? 0) : null,
          done: false,
        });
      }
    }
  }

  // ---------------------------------------------------------- per tick

  done(): boolean {
    if (this.tick >= this.endTicks) return true;
    if (this.tick < this.windowTicks) return false;
    return (
      !this.threats.some((t) => t.alive) && this.falling.length === 0 && this.shots.length === 0
    );
  }

  run(): CombatResult {
    while (!this.done()) this.step();
    return this.result();
  }

  step(): void {
    const inWindow = this.tick < this.windowTicks;
    if (inWindow) this.runLaunches();
    this.moveThreats();
    this.landFalling();
    this.runScreens();
    this.fireBatteries();
    this.resolveShots();
    if (inWindow) {
      this.runGround();
      this.runSubHunts();
    }
    this.tick++;
  }

  private runLaunches(): void {
    const { state } = this;
    for (const launch of this.launches) {
      if (launch.done) continue;
      if (launch.tick === null) {
        const trigger = launch.plan.trigger;
        const attacked = this.threats.some(
          (t) => t.nuclear && t.owner === trigger && t.target.owner === launch.owner,
        );
        if (!attacked) continue;
        launch.tick = this.tick;
      }
      if (this.tick < launch.tick) continue;
      launch.done = true;
      const plan = launch.plan;
      const target =
        this.validTarget(plan.target, launch.owner) ??
        (plan.fallback ? this.validTarget(plan.fallback, launch.owner) : null);
      if (!target) continue; // no valid approved target: hold
      const strategic = this.ctx.ruleset.units.missiles['strategic']!;
      const silo = state.installations[plan.delivery];
      const stack = state.units[plan.delivery];
      if (silo) {
        if (this.ruined.has(silo.id) || silo.condition !== 'operational') continue; // destroyed launchers can't fire later waves
        this.useAmmo(launch.owner, 'warheads', plan.count, silo.id);
        this.used.add(silo.id);
        for (let i = 0; i < plan.count; i++)
          this.launchMissile(
            launch.owner,
            'strategic',
            this.installationPos(silo),
            target,
            strategic.speed,
            strategic.hp,
            true,
            plan.id,
            i,
          );
      } else if (stack?.kind === 'submarine') {
        if (this.destroyedStacks.has(stack.id)) continue;
        this.useAmmo(launch.owner, 'warheads', plan.count);
        this.used.add(stack.id);
        for (let i = 0; i < plan.count; i++)
          this.launchMissile(
            launch.owner,
            'strategic',
            this.seaCenter(stack.location),
            target,
            strategic.speed,
            strategic.hp,
            true,
            plan.id,
            i,
          );
      } else if (stack?.kind === 'bomber') {
        const rules = this.ctx.ruleset.units.units['bomber']!;
        this.useAmmo(launch.owner, 'gravityBombs', plan.count);
        this.used.add(stack.id);
        for (let i = 0; i < plan.count; i++)
          this.threats.push(
            this.flyer(
              launch.owner,
              'bomber',
              stack.id,
              this.garrison(stack.location),
              rules.speed,
              rules.hp,
              target,
              1,
              true,
              plan.id,
              i,
            ),
          );
      }
    }
  }

  private validTarget(id: string, owner: PlayerId): Target | null {
    if (this.ruined.has(id)) return null;
    const target = this.targetFor(id, null);
    if (!target || target.owner === owner) return null;
    return target;
  }

  private moveThreats(): void {
    const bombs = this.ctx.ruleset.combat.bombs;
    const release = bombs.releaseRadius * MILLI;
    for (const t of this.threats) {
      if (!t.alive || this.tick < t.launchTick) continue;
      if (t.kind === 'aircraft' || t.kind === 'bomber') {
        t.pos = moveToward(t.pos, t.target.pos, t.speed);
        if (within(t.pos, t.target.pos, release)) {
          this.falling.push({
            owner: t.owner,
            target: t.target,
            landTick: this.tick + this.ticks(bombs.fallMs),
            nuclear: t.nuclear,
            planId: t.planId,
            count: t.bombs,
          });
          t.alive = false; // released and leaving the map
        }
        continue;
      }
      t.pos = { x: t.pos.x + t.vel.x, y: t.pos.y + t.vel.y };
      if (t.impactTick !== null && this.tick >= t.impactTick) {
        t.alive = false;
        t.pos = { ...t.target.pos };
        this.impact(t.owner, t.target, t.nuclear, t.planId, 1);
      }
    }
  }

  private landFalling(): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]!;
      if (this.tick < f.landTick) continue;
      this.falling.splice(i, 1);
      this.impact(f.owner, f.target, f.nuclear, f.planId, f.count);
    }
  }

  private impact(
    owner: PlayerId,
    target: Target,
    nuclear: boolean,
    planId: string | null,
    count: number,
  ): void {
    if (nuclear) {
      this.detonate(owner, target, planId ?? '');
      return;
    }
    switch (target.kind) {
      case 'installation':
        this.installationHits.set(target.id, (this.installationHits.get(target.id) ?? 0) + count);
        break;
      case 'population':
        this.populationHits.set(target.id, (this.populationHits.get(target.id) ?? 0) + count);
        break;
      case 'lane':
        if (target.lane) this.lanes.set(target.id, { a: target.lane[0], b: target.lane[1] });
        break;
    }
  }

  private detonate(owner: PlayerId, target: Target, planId: string): void {
    const { ctx, state } = this;
    const fx = ctx.ruleset.combat.nuclearEffects;
    const blast = fx.blastRadius * MILLI;
    const outer = fx.outerRadius * MILLI;
    this.detonations.push({ player: owner, territory: target.territory, plan: planId });
    for (const [id, inst] of sortedEntries(state.installations)) {
      const pos = this.installationPos(inst);
      if (within(pos, target.pos, blast)) {
        this.ruined.add(id);
        this.nuclearSteps.set(id, 2);
      } else if (within(pos, target.pos, outer)) {
        this.nuclearSteps.set(id, Math.max(this.nuclearSteps.get(id) ?? 0, 1));
      }
    }
    for (const territory of this.ctx.territoryIds) {
      const pos = this.garrison(territory);
      const t = state.territories[territory]!;
      const prior = this.populationNuclear.get(territory) ?? { killed: 0, displaced: 0 };
      const remaining = t.population - prior.killed - prior.displaced;
      if (within(pos, target.pos, blast)) {
        const shelters = sortedEntries(state.installations).filter(
          ([, i]) => i.territory === territory && i.kind === 'shelter' && !this.ruined.has(i.id),
        ).length;
        const killed = Math.max(
          0,
          Math.min(remaining, ceilDiv(remaining * fx.blastKillPermille, 1000)) - shelters,
        );
        const displaced = Math.min(
          remaining - killed,
          ceilDiv(remaining * fx.blastDisplacePermille, 1000),
        );
        this.populationNuclear.set(territory, {
          killed: prior.killed + killed,
          displaced: prior.displaced + displaced,
        });
        for (const [id, stack] of sortedEntries(state.units)) {
          if (stack.location === territory && !this.destroyedStacks.has(id)) {
            this.destroyedStacks.add(id);
            this.unitLosses.set(id, stack.count);
          }
        }
        if (t.militia > 0) this.militiaLosses.set(territory, t.militia);
        for (const g of this.ground) if (g.battle === territory) g.alive = false;
      } else if (within(pos, target.pos, outer) && remaining > 0) {
        this.populationNuclear.set(territory, {
          killed: prior.killed,
          displaced: prior.displaced + Math.min(remaining, fx.outerDisplace),
        });
      }
    }
  }

  // ---------------------------------------------------------- defenses

  private enemies(battery: Battery, t: Threat): boolean {
    if (t.owner === battery.owner || !t.alive) return false;
    return (
      t.target.owner !== null && (this.allies.get(battery.owner)?.has(t.target.owner) ?? false)
    );
  }

  private phase(
    t: Threat,
  ): 'air' | 'missile' | 'strategic-boost' | 'strategic-midcourse' | 'strategic-terminal' {
    if (t.kind === 'aircraft' || t.kind === 'bomber') return 'air';
    if (t.kind === 'missile') return 'missile';
    const strategic = this.ctx.ruleset.units.missiles['strategic']!;
    if (this.tick - t.launchTick < this.ticks(strategic.boostMs ?? 0)) return 'strategic-boost';
    if ((t.impactTick ?? 0) - this.tick <= this.ticks(strategic.terminalMs ?? 0))
      return 'strategic-terminal';
    return 'strategic-midcourse';
  }

  private detected(owner: PlayerId, pos: Vec): boolean {
    const allies = this.allies.get(owner);
    return this.detectors.some((d) => allies?.has(d.owner) && within(d.pos, pos, d.range));
  }

  private ticksToImpact(t: Threat): number {
    if (t.impactTick !== null) return t.impactTick - this.tick;
    return ceilDiv(distance(t.pos, t.target.pos), Math.max(1, t.speed));
  }

  private velocity(t: Threat): Vec {
    if (t.kind === 'missile' || t.kind === 'strategic') return t.vel;
    const d = distance(t.pos, t.target.pos);
    if (d === 0) return { x: 0, y: 0 };
    return {
      x: floorDiv((t.target.pos.x - t.pos.x) * t.speed, d),
      y: floorDiv((t.target.pos.y - t.pos.y) * t.speed, d),
    };
  }

  private priority(owner: PlayerId, t: Threat): number {
    const policy = this.policies[owner] ?? 'balanced';
    if (policy === 'balanced') return 0;
    const inst =
      t.target.kind === 'installation' ? this.state.installations[t.target.id] : undefined;
    if (policy === 'protectCivilians') {
      const civilian =
        t.target.kind === 'population' ||
        (inst !== undefined && installationRules(this.ctx, inst.kind).civilian);
      return civilian ? 0 : 1;
    }
    return inst !== undefined && ['silo', 'command', 'airfield'].includes(inst.kind) ? 0 : 1;
  }

  private runScreens(): void {
    for (const b of this.batteries) {
      if (b.rules.firing !== 'automatic' || b.engagementsLeft <= 0) continue;
      const target = this.threats.find(
        (t) =>
          this.enemies(b, t) &&
          b.rules.engages.includes(this.phase(t) as never) &&
          within(b.pos, t.pos, b.range),
      );
      if (!target) continue;
      target.alive = false;
      b.engagementsLeft--;
      b.shots++;
    }
  }

  private fireBatteries(): void {
    const acquisition = this.ticks(this.ctx.ruleset.combat.autopilotAcquisitionMs);
    for (const b of this.batteries) {
      if (
        b.rules.firing === 'automatic' ||
        this.tick < b.readyAt ||
        (b.magazine !== null && b.magazine <= 0)
      )
        continue;
      const pending = new Map<string, number>();
      for (const s of this.shots)
        if (s.battery.owner === b.owner) pending.set(s.threat, (pending.get(s.threat) ?? 0) + 1);
      let best: { t: Threat; key: [number, number, string]; radar: boolean } | null = null;
      for (const t of this.threats) {
        if (!this.enemies(b, t) || this.tick < t.launchTick) continue;
        const phase = this.phase(t);
        if (!b.rules.engages.includes(phase as never)) continue;
        if (!within(b.pos, t.pos, b.range)) {
          t.tracked.delete(b.id);
          continue;
        }
        const radar = this.detected(b.owner, t.pos);
        const tracked = (t.tracked.get(b.id) ?? 0) + 1;
        t.tracked.set(b.id, tracked);
        if (!radar && tracked < acquisition) continue;
        const needed = b.rules.destroysOnHit
          ? 1
          : ceilDiv(t.hp, Math.max(1, b.rules.damage * MILLI));
        if ((pending.get(t.id) ?? 0) >= needed) continue;
        const key: [number, number, string] = [
          this.priority(b.owner, t),
          this.ticksToImpact(t),
          t.id,
        ];
        if (
          !best ||
          key[0] < best.key[0] ||
          (key[0] === best.key[0] &&
            (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))
        ) {
          best = { t, key, radar };
        }
      }
      if (!best) continue;
      const t = best.t;
      const speed = Math.max(1, perTick(b.rules.projectileSpeed, this.ticksPerSecond));
      let aim = { ...t.pos };
      let flight = Math.max(1, ceilDiv(distance(b.pos, aim), speed));
      if (best.radar && b.rules.firing !== 'homing') {
        // Lead the target: aim where it will be when the shell arrives.
        for (let i = 0; i < 2; i++) {
          const v = this.velocity(t);
          aim = { x: t.pos.x + v.x * flight, y: t.pos.y + v.y * flight };
          flight = Math.max(1, ceilDiv(distance(b.pos, aim), speed));
        }
      }
      this.shots.push({ battery: b, arriveTick: this.tick + flight, aim, threat: t.id });
      b.readyAt = this.tick + b.interval;
      b.shots++;
      if (b.magazine !== null) b.magazine--;
    }
  }

  private resolveShots(): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      if (this.tick < s.arriveTick) continue;
      this.shots.splice(i, 1);
      const b = s.battery;
      if (b.rules.firing === 'homing') {
        const t = this.threats.find((x) => x.id === s.threat);
        if (t && t.alive && b.rules.engages.includes(this.phase(t) as never)) this.kill(t);
        continue;
      }
      const radius = b.rules.burstRadius * MILLI;
      for (const t of this.threats) {
        if (!this.enemies(b, t) || !b.rules.engages.includes(this.phase(t) as never)) continue;
        if (!within(t.pos, s.aim, radius)) continue;
        if (b.rules.destroysOnHit) this.kill(t);
        else {
          t.hp -= b.rules.damage * MILLI;
          if (t.hp <= 0) this.kill(t);
        }
      }
    }
  }

  private kill(t: Threat): void {
    t.alive = false;
    if (t.stack) this.unitLosses.set(t.stack, (this.unitLosses.get(t.stack) ?? 0) + 1);
  }

  // ---------------------------------------------------------- ground

  private hostile(a: GroundUnit, b: GroundUnit): boolean {
    if (a.battle !== b.battle || !b.alive) return false;
    if (a.side !== b.side) return true;
    if (a.side === 'attacker' && a.owner !== null && b.owner !== null && a.owner !== b.owner) {
      return (
        this.state.relations[
          a.owner < b.owner ? `${a.owner}|${b.owner}` : `${b.owner}|${a.owner}`
        ] === 'war'
      );
    }
    return false;
  }

  private runGround(): void {
    const terrain = this.ctx.ruleset.combat.terrain;
    for (const g of this.ground) {
      if (!g.alive) continue;
      let nearest: GroundUnit | null = null;
      let best = Number.MAX_SAFE_INTEGER;
      for (const other of this.ground) {
        if (other === g || !this.hostile(g, other)) continue;
        const d = distance(g.pos, other.pos);
        if (d < best || (d === best && nearest !== null && other.id < nearest.id)) {
          best = d;
          nearest = other;
        }
      }
      if (nearest && best <= g.range) {
        if (this.tick >= g.readyAt) {
          const permille =
            nearest.side === 'defender'
              ? (terrain[territoryDef(this.ctx, g.battle).terrain]?.defenderDamageTakenPermille ??
                1000)
              : 1000;
          nearest.hp -= mulPermille(g.damage, permille);
          g.readyAt = this.tick + g.interval;
          if (nearest.hp <= 0) {
            nearest.alive = false;
            if (nearest.stack)
              this.unitLosses.set(nearest.stack, (this.unitLosses.get(nearest.stack) ?? 0) + 1);
            else
              this.militiaLosses.set(
                nearest.battle,
                (this.militiaLosses.get(nearest.battle) ?? 0) + 1,
              );
          }
        }
      } else if (g.side === 'attacker') {
        g.pos = moveToward(g.pos, g.dest, g.speed);
      }
    }
  }

  private runSubHunts(): void {
    for (const hunt of this.subHunts) {
      if (hunt.hp <= 0 || hunt.patrols === 0 || this.tick === 0 || this.tick % hunt.interval !== 0)
        continue;
      hunt.hp -= hunt.damage * hunt.patrols;
      if (hunt.hp <= 0) this.unitLosses.set(hunt.sub, (this.unitLosses.get(hunt.sub) ?? 0) + 1);
    }
  }

  // ---------------------------------------------------------- result

  result(): CombatResult {
    const { ctx, state } = this;
    const radius = ctx.ruleset.combat.garrisonRadius * MILLI;
    this.captures = [];
    this.tiedClaims = [];
    for (const battle of [...new Set(this.ground.map((g) => g.battle))].sort()) {
      const defendersLeft = this.ground.some(
        (g) => g.battle === battle && g.side === 'defender' && g.alive,
      );
      if (defendersLeft) continue;
      const holding = new Map<PlayerId, number>();
      for (const g of this.ground) {
        if (
          g.battle === battle &&
          g.side === 'attacker' &&
          g.alive &&
          g.owner &&
          within(g.pos, g.dest, radius)
        ) {
          holding.set(g.owner, (holding.get(g.owner) ?? 0) + 1);
        }
      }
      const ranked = [...holding.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      if (ranked.length > 0 && (ranked.length === 1 || ranked[0]![1] > ranked[1]![1]))
        this.captures.push({ territory: battle, by: ranked[0]![0] });
      else if (ranked.length > 1 && state.territories[battle]?.owner === null)
        this.tiedClaims.push({ territory: battle });
    }

    const hardened = ctx.ruleset.combat.hardenedHitsPerStep;
    const steps = new Map<string, number>(this.nuclearSteps);
    const hardHits: { installation: string; hits: number }[] = [];
    for (const [id, hits] of [...this.installationHits.entries()].sort()) {
      const inst = state.installations[id];
      if (!inst) continue;
      let n = hits;
      if (installationRules(ctx, inst.kind).hardened) {
        const total = inst.hardHits + hits;
        n = floorDiv(total, hardened);
        hardHits.push({ installation: id, hits: total - n * hardened });
      }
      steps.set(id, Math.min(2, (steps.get(id) ?? 0) + n));
    }
    for (const b of this.batteries) if (b.shots > 0) this.used.add(b.id);

    const population = new Map<string, { killed: number; displaced: number }>();
    for (const [territory, hits] of [...this.populationHits.entries()].sort()) {
      const t = state.territories[territory];
      if (!t) continue;
      const shelters = sortedEntries(state.installations).filter(
        ([, i]) => i.territory === territory && i.kind === 'shelter' && i.condition !== 'ruined',
      ).length;
      let effective = Math.max(0, hits - shelters);
      const cap = state.modifiers
        .filter(
          (m) =>
            m.stat === 'maxPopulationLoss' &&
            m.data['at'] === territory &&
            m.fromRound <= state.round &&
            state.round <= m.untilRound,
        )
        .reduce((min, m) => Math.min(min, m.amount), Number.MAX_SAFE_INTEGER);
      effective = Math.min(effective, cap, t.population);
      const displaced = Math.min(effective, 1);
      population.set(territory, { killed: effective - displaced, displaced });
    }
    for (const [territory, n] of this.populationNuclear) {
      const prior = population.get(territory) ?? { killed: 0, displaced: 0 };
      population.set(territory, {
        killed: prior.killed + n.killed,
        displaced: prior.displaced + n.displaced,
      });
    }

    const magazines = this.batteries
      .filter((b) => b.shots > 0 && b.magazine !== null)
      .map((b) => ({ installation: b.id, shots: b.shots }));

    return {
      ...EMPTY_RESULT,
      installationHits: [...steps.entries()]
        .filter(([, n]) => n > 0)
        .sort()
        .map(([installation, n]) => ({ installation, steps: n })),
      hardHits,
      unitLosses: [...this.unitLosses.entries()].sort().map(([stack, count]) => ({ stack, count })),
      militiaLosses: [...this.militiaLosses.entries()]
        .sort()
        .map(([territory, count]) => ({ territory, count })),
      population: [...population.entries()].sort().map(([territory, p]) => ({ territory, ...p })),
      captures: this.captures,
      tiedClaims: this.tiedClaims,
      assetsUsed: [...this.used].sort(),
      ammunitionUsed: [...this.ammunition.values()],
      magazinesUsed: magazines,
      detonations: this.detonations,
      disruptedLanes: [...this.lanes.values()],
    };
  }

  /** A compact picture of the battlefield for clients and debugging. */
  snapshot() {
    return {
      tick: this.tick,
      threats: this.threats
        .filter((t) => t.alive && this.tick >= t.launchTick)
        .map((t) => ({ id: t.id, owner: t.owner, kind: t.kind, x: t.pos.x, y: t.pos.y })),
      ground: this.ground
        .filter((g) => g.alive)
        .map((g) => ({ id: g.id, owner: g.owner, side: g.side, x: g.pos.x, y: g.pos.y, hp: g.hp })),
      shots: this.shots.length,
    };
  }
}

export function createCombat(
  ctx: MatchContext,
  state: Readonly<GameState>,
  input: CombatInput,
): CombatSim {
  return new CombatSim(ctx, state, input);
}
