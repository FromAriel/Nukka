/**
 * Utility-planner bots (main design §13; Technical Architecture §13). A bot
 * sees only its PlayerView and returns commands in order of preference; the
 * runner submits them until one is accepted.
 */
import {
  PASS_ORDERS,
  cardDef,
  deriveStream,
  installationRules,
  markerCost,
  nextInt,
  territoryDef,
  type Command,
  type DevelopmentOrder,
  type MainAction,
  type MatchContext,
  type NuclearPlan,
  type PendingDecision,
  type PlanningOrders,
  type PlayerId,
  type PlayerView,
  type RngState,
  type ShadowMarker,
} from '@nukka/core';
import {
  capitalOf,
  foodWater,
  freeSites,
  handHas,
  hasTreaty,
  hostility,
  inCooldown,
  installationsIn,
  myInstallations,
  myTerritories,
  myUnits,
  neighbours,
  population,
  powerSpare,
  relation,
  rivals,
  supplyUpkeep,
  topRival,
  unitCount,
} from './analysis.js';
import type { Personality } from './personality.js';

export interface Bot {
  readonly player: PlayerId;
  readonly personality: Personality;
  /** Commands in order of preference; the runner falls back to the safe default if none is accepted. */
  decide(view: PlayerView, decision: PendingDecision): Command[];
}

interface Candidate<T> {
  value: T;
  score: number;
}

export function createBot(
  ctx: MatchContext,
  player: PlayerId,
  personality: Personality,
  seed: number,
): Bot {
  let rng: RngState = deriveStream(seed, `bot:${player}`);
  const noise = (max: number) => {
    const [value, next] = nextInt(rng, 0, max);
    rng = next;
    return value;
  };
  const w = personality.weights;

  // ---------------------------------------------------------- planning

  function developmentCandidates(view: PlayerView): Candidate<DevelopmentOrder>[] {
    const out: Candidate<DevelopmentOrder>[] = [];
    const add = (value: DevelopmentOrder, score: number) =>
      out.push({ value, score: score + noise(3) });
    const pop = population(view);
    const { food, water } = foodWater(ctx, view);
    const spare = powerSpare(ctx, view);
    const terrs = myTerritories(view);

    // Repairs come first: broken infrastructure costs every round.
    for (const inst of myInstallations(view)) {
      if (inst.condition === 'operational' || inst.repairCompletesRound !== null) continue;
      const key = ['farm', 'waterworks', 'powerStation', 'industry', 'command'].includes(inst.kind)
        ? 30
        : 12;
      add({ type: 'repair', installation: inst.id }, key + w.economy);
    }
    // Food and water: secure the basics, with a backup waterworks.
    for (const t of terrs) {
      const def = territoryDef(ctx, t);
      const here = installationsIn(view, t);
      const sites = freeSites(view, t);
      if (sites.length === 0) continue;
      if (def.features.includes('water') && !here.some((i) => i.kind === 'waterworks')) {
        add(
          { type: 'build', kind: 'waterworks', territory: t, site: sites[0]! },
          (water <= pop ? 26 : 8) + w.economy + w.defense,
        );
      }
      if (def.features.includes('farmland') && !here.some((i) => i.kind === 'farm')) {
        add(
          { type: 'build', kind: 'farm', territory: t, site: sites[0]! },
          (food <= pop ? 26 : 10) + w.economy,
        );
      }
    }
    for (const inst of myInstallations(view)) {
      const rules = installationRules(ctx, inst.kind).economy;
      if (rules?.upgrade && !inst.upgraded && inst.condition === 'operational')
        add({ type: 'upgrade', installation: inst.id }, 8 + w.economy);
    }
    // Power before anything that needs it.
    const bestSite = (
      prefer: (t: string) => number,
    ): { territory: string; site: number } | null => {
      const ranked = terrs
        .filter(
          (t) => freeSites(view, t).length > 0 && (view.territories[t]?.contestedRounds ?? 0) === 0,
        )
        .sort((a, b) => prefer(b) - prefer(a) || (a < b ? -1 : 1));
      const t = ranked[0];
      return t ? { territory: t, site: freeSites(view, t)[0]! } : null;
    };
    const anySite = bestSite(() => 0);
    if (anySite && spare <= 1)
      add({ type: 'build', kind: 'powerStation', ...anySite }, 14 + w.economy + w.defense);
    // Industry, preferring ore and timber.
    const industrySite = bestSite((t) => (territoryDef(ctx, t).features.includes('ore') ? 2 : 0));
    if (industrySite && spare >= 1)
      add({ type: 'build', kind: 'industry', ...industrySite }, 6 + 2 * w.economy);
    // Defense: guns and interceptors near what matters, radar if missing.
    const guardSite = bestSite(
      (t) => installationsIn(view, t).filter((i) => i.owner === view.you).length,
    );
    if (guardSite && spare >= 1) {
      add({ type: 'build', kind: 'gunBattery', ...guardSite }, 2 * w.defense);
      if (w.defense >= 6)
        add({ type: 'build', kind: 'burstInterceptor', ...guardSite }, 2 * w.defense - 2);
      if (myInstallations(view, 'radar').length === 0)
        add({ type: 'build', kind: 'radar', ...guardSite }, 8 + w.defense);
      if (
        w.defense >= 8 &&
        myInstallations(view).some((i) => i.kind === 'silo' || i.kind === 'command')
      ) {
        add({ type: 'build', kind: 'precisionInterceptor', ...guardSite }, w.defense + w.nuclear);
      }
    }
    const shelterSite = bestSite((t) => view.territories[t]?.population ?? 0);
    if (shelterSite) add({ type: 'build', kind: 'shelter', ...shelterSite }, w.defense);
    // Intelligence bureaus.
    if (anySite && spare >= 1 && myInstallations(view, 'bureau').length < 2 && w.covert >= 5) {
      add(
        { type: 'build', kind: 'bureau', mode: personality.bureauMode, ...anySite },
        2 * w.covert,
      );
    }
    // Military.
    const frontier = terrs.find((t) =>
      neighbours(ctx, t).some((n) => view.territories[n]?.owner !== view.you),
    );
    if (frontier)
      add(
        { type: 'recruit', unit: 'groundFormation', location: frontier },
        2 * w.military + w.expansion,
      );
    const aircraft = unitCount(view, 'aircraft') + unitCount(view, 'bomber');
    if (aircraft > 0 && (view.me.stock['conventionalBombs'] ?? 0) < 4)
      add({ type: 'ammunition', kind: 'conventionalBombs' }, w.military + w.aggression);
    // Nuclear arsenal.
    if (w.nuclear >= 5) {
      const silos = myInstallations(view, 'silo');
      const siloSite = bestSite((t) => (territoryDef(ctx, t).role === 'uplands' ? 2 : 0));
      if (silos.length === 0 && siloSite)
        add({ type: 'build', kind: 'silo', ...siloSite }, 2 * w.nuclear);
      const capacity = silos.length * 2;
      const held =
        silos.reduce((s, i) => s + (i.loaded?.['warheads'] ?? 0), 0) +
        (view.me.stock['warheads'] ?? 0);
      if (silos.length > 0 && held < capacity)
        add({ type: 'ammunition', kind: 'warheads' }, 2 * w.nuclear);
    }
    // Supplies: a depot when the army is large.
    if (supplyUpkeep(ctx, view) >= 6 && anySite && myInstallations(view, 'depot').length < 2)
      add({ type: 'build', kind: 'depot', ...anySite }, 6 + w.military);
    return out;
  }

  function pickDevelopment(view: PlayerView): DevelopmentOrder[] {
    const modifier = view.modifiers
      .filter(
        (m) =>
          m.player === view.you &&
          m.stat === 'developmentOrders' &&
          m.fromRound <= view.round &&
          view.round <= m.untilRound,
      )
      .reduce((sum, m) => sum + m.amount, 0);
    const slots = Math.max(0, ctx.ruleset.match.orders.development + modifier);
    let budget = view.me.reserves.production;
    let power = powerSpare(ctx, view);
    const chosen: DevelopmentOrder[] = [];
    const usedSites = new Set<string>();
    const touched = new Set<string>();
    for (const { value } of developmentCandidates(view).sort((a, b) => b.score - a.score)) {
      if (chosen.length >= slots) break;
      const cost = orderCost(view, value);
      if (cost > budget) continue;
      if (value.type === 'build') {
        const key = `${value.territory}:${value.site}`;
        if (usedSites.has(key)) continue;
        const rules = installationRules(ctx, value.kind);
        if (rules.powerDraw > power) continue;
        power += rules.powerSupply - rules.powerDraw;
        usedSites.add(key);
      }
      if ('installation' in value) {
        if (touched.has(value.installation)) continue;
        touched.add(value.installation);
      }
      budget -= cost;
      chosen.push(value);
    }
    return chosen;
  }

  function orderCost(view: PlayerView, order: DevelopmentOrder): number {
    switch (order.type) {
      case 'build':
        return installationRules(ctx, order.kind).cost;
      case 'recruit':
        return ctx.ruleset.units.units[order.unit]?.cost ?? 0;
      case 'ammunition':
        return ctx.ruleset.units.ammunition[order.kind]?.cost ?? 0;
      case 'repair': {
        const inst = view.installations[order.installation];
        if (!inst) return 0;
        const base = installationRules(ctx, inst.kind).cost;
        const repair = ctx.ruleset.economy.repair;
        return inst.condition === 'ruined'
          ? base + repair.rebuildExtraCost
          : Math.ceil((base * repair.repairCostPermille) / 1000);
      }
      case 'upgrade': {
        const inst = view.installations[order.installation];
        return inst ? (installationRules(ctx, inst.kind).economy?.upgrade?.cost ?? 0) : 0;
      }
      default:
        return 0;
    }
  }

  function modes(view: PlayerView): Record<string, string> {
    const result: Record<string, string> = {};
    const industries = myInstallations(view, 'industry');
    const upkeep = supplyUpkeep(ctx, view);
    const supplies = view.me.reserves.supplies;
    const inSupply = industries.filter((i) => i.mode === 'supply');
    if (supplies < upkeep * 2 && inSupply.length === 0) {
      const pick =
        industries.find((i) => territoryDef(ctx, i.territory).features.includes('ore')) ??
        industries[0];
      if (pick) result[pick.id] = 'supply';
    } else if (supplies > upkeep * 4 && inSupply.length > 0) {
      result[inSupply[0]!.id] = 'construction';
    }
    for (const b of myInstallations(view, 'bureau'))
      if (b.mode !== personality.bureauMode) result[b.id] = personality.bureauMode;
    return result;
  }

  function loads(view: PlayerView) {
    let stock = view.me.stock['warheads'] ?? 0;
    const result: PlanningOrders['loads'] = [];
    for (const silo of myInstallations(view, 'silo')) {
      if (silo.condition !== 'operational' || stock <= 0) continue;
      const room = 2 - (silo.loaded?.['warheads'] ?? 0);
      const count = Math.min(room, stock);
      if (count > 0) {
        result.push({ installation: silo.id, ammunition: 'warheads', count });
        stock -= count;
      }
    }
    return result;
  }

  /** The best main action, plus a repositioning that sets it up. */
  function mainAction(view: PlayerView): {
    main: MainAction;
    move: PlanningOrders['repositioning'];
  } {
    const options: Candidate<{ main: MainAction; move: PlanningOrders['repositioning'] }>[] = [];
    const add = (main: MainAction, score: number, move: PlanningOrders['repositioning'] = []) =>
      options.push({ value: { main, move }, score: score + noise(4) });
    const rival = topRival(view);

    // Ground assaults from wherever our formations stand.
    for (const stack of myUnits(view, 'groundFormation')) {
      const count = stack.count ?? 0;
      for (const target of neighbours(ctx, stack.location)) {
        const t = view.territories[target];
        if (!t || t.owner === view.you) continue;
        if (t.owner === null && count >= 2) {
          const value = territoryDef(ctx, target).features.length * 2 + (t.population > 0 ? 3 : 0);
          add(
            {
              type: 'operation',
              operation: 'groundAssault',
              target,
              forces: [{ stack: stack.id, count }],
            },
            3 * w.expansion + value,
          );
        } else if (
          t.owner !== null &&
          count >= 4 &&
          w.aggression >= 6 &&
          territoryDef(ctx, target).role !== 'capital'
        ) {
          add(
            {
              type: 'operation',
              operation: 'groundAssault',
              target,
              forces: [{ stack: stack.id, count }],
            },
            2 * w.aggression + w.expansion - 4,
          );
        }
      }
    }
    // Move the main army to the frontier if it can't reach anything yet.
    const army = myUnits(view, 'groundFormation').sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0),
    )[0];
    if (army && options.length === 0) {
      const front = myTerritories(view).find(
        (t) =>
          t !== army.location &&
          neighbours(ctx, t).some((n) => view.territories[n]?.owner === null),
      );
      if (front)
        add({ type: 'pass' }, w.expansion, [{ stack: army.id, count: army.count ?? 1, to: front }]);
    }
    // Air raids on enemies we are already at war with.
    const bombs = view.me.stock['conventionalBombs'] ?? 0;
    for (const air of myUnits(view, 'aircraft')) {
      if (bombs < 2) break;
      for (const enemy of rivals(view).filter((r) => relation(view, r) === 'war')) {
        const range = ctx.ruleset.units.units['aircraft']?.operationRange ?? 0;
        const [ax, ay] = territoryDef(ctx, air.location).garrison;
        const inRange = (territory: string) => {
          const [tx, ty] = territoryDef(ctx, territory).garrison;
          return (tx - ax) * (tx - ax) + (ty - ay) * (ty - ay) <= range * range;
        };
        const target = Object.values(view.installations)
          .filter(
            (i) =>
              i.owner === enemy &&
              ['industry', 'powerStation', 'farm', 'silo'].includes(i.kind) &&
              i.condition !== 'ruined' &&
              inRange(i.territory),
          )
          .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
        if (target)
          add(
            {
              type: 'operation',
              operation: 'airRaid',
              target: target.id,
              forces: [{ stack: air.id, count: Math.min(air.count ?? 1, Math.floor(bombs / 2)) }],
            },
            2 * w.aggression + w.military,
          );
      }
    }
    // Cards.
    const card = (id: string, score: number, target?: string) => {
      if (handHas(view, id)) add({ type: 'card', card: id, ...(target ? { target } : {}) }, score);
    };
    if (rival) {
      card('propaganda-broadcast', 2 * w.aggression, rival);
      card('trade-embargo', 2 * w.aggression - 2, rival);
      card('destabilize-government', 3 * w.aggression - 4, rival);
      card('hotline', 2 * w.diplomacy - 2, rival);
      card('verification-mission', w.diplomacy, rival);
    }
    const blamed = rivals(view).find((r) => (view.players[r]?.blame ?? 0) >= 5);
    if (blamed) card('sanctions', w.diplomacy + w.aggression, blamed);
    const pariah = rivals(view).find((r) => view.players[r]?.pariah);
    if (pariah) card('global-embargo', w.diplomacy + w.aggression, pariah);
    if (view.players[view.you]!.posturePoints > 0)
      card('doomsday-rhetoric', 3 * w.nuclear + w.aggression - 12);
    if (view.tension.value >= ctx.ruleset.tension.bands.openCrisis) card('summit', 3 * w.diplomacy);
    if (w.aggression >= 6) card('full-mobilization', 2 * w.military);
    const warheads =
      (view.me.stock['warheads'] ?? 0) +
      myInstallations(view, 'silo').reduce((s, i) => s + (i.loaded?.['warheads'] ?? 0), 0);
    if (warheads > 0 && rivals(view).some((r) => relation(view, r) === 'war'))
      card('nuclear-test', 2 * w.nuclear);
    // Proposals.
    const proposal = (
      proposalKind: Extract<MainAction, { type: 'proposal' }>['proposal'],
      score: number,
      target?: PlayerId,
      second?: PlayerId,
    ) =>
      add(
        {
          type: 'proposal',
          proposal: proposalKind,
          ...(target ? { target } : {}),
          ...(second ? { second } : {}),
        },
        score,
      );
    for (const other of rivals(view)) {
      if (inCooldown(view, other)) continue;
      const friendly = hostility(view, view.you, other) < 2;
      if (relation(view, other) === 'war') proposal('ceasefire', 2 * w.diplomacy + 2, other);
      else if (friendly && !hasTreaty(view, other, 'nonAggression'))
        proposal('nonAggression', 2 * w.diplomacy, other);
      else if (
        friendly &&
        hasTreaty(view, other, 'nonAggression') &&
        !hasTreaty(view, other, 'trade')
      )
        proposal('trade', w.diplomacy + w.economy - 4, other);
      if (friendly && w.defense >= 6 && !hasTreaty(view, other, 'defensive'))
        proposal('defensive', w.defense + w.diplomacy - 6, other);
    }
    const others = rivals(view);
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i]!;
        const b = others[j]!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (view.relations[key] === 'war') proposal('mediation', 3 * w.diplomacy, a, b);
      }
    }
    if (rival && view.tension.value >= 50) proposal('peaceEnvoy', 2 * w.diplomacy, rival);

    const best = options.sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 6) return { main: { type: 'pass' }, move: best?.value.move ?? [] };
    return best.value;
  }

  function covert(
    view: PlayerView,
    devCovertCost: number,
  ): { shadow: ShadowMarker[]; counterIntel: number } {
    const shadow: ShadowMarker[] = [];
    const slots = myInstallations(view, 'bureau').some((b) => b.condition !== 'ruined')
      ? ctx.ruleset.covert.shadowSlots.withBureau
      : ctx.ruleset.covert.shadowSlots.base;
    let ip = view.me.reserves.intelligence - devCovertCost;
    const hand = [...view.me.hand];
    const take = (card: string) => {
      const i = hand.indexOf(card);
      if (i < 0) return false;
      hand.splice(i, 1);
      return true;
    };
    const rival = topRival(view);
    const tryOp = (card: string, target: string | undefined) => {
      if (!target || shadow.length >= slots || !hand.includes(card)) return;
      const marker: ShadowMarker = { type: 'operation', card, target };
      const cost = markerCost(ctx, marker);
      if (cost > ip) return;
      take(card);
      ip -= cost;
      shadow.push(marker);
    };
    if (w.covert >= 5 && rival) {
      const radar = Object.values(view.installations).find(
        (i) => i.owner === rival && i.kind === 'radar',
      );
      tryOp('sabotage-crew', radar?.id);
      tryOp('reconnaissance', rival);
      const territory = Object.keys(view.territories)
        .sort()
        .find((t) => view.territories[t]?.owner === rival);
      if (w.aggression >= 4) tryOp('arm-the-insurgents', territory);
      const between = view.treaties.find((t) => !t.parties.includes(view.you));
      tryOp('spoiler', between?.id);
    }
    if (shadow.length < slots && (w.defense >= 5 || w.covert >= 5) && take('security-sweep')) {
      shadow.push({ type: 'countermeasure', card: 'security-sweep' });
    }
    const counterIntel = Math.max(0, Math.floor((ip * personality.counterIntelShare) / 1000));
    return { shadow, counterIntel };
  }

  function planning(view: PlayerView): Command[] {
    const development = pickDevelopment(view);
    const { main, move } = mainAction(view);
    const { shadow, counterIntel } = covert(view, 0);
    const leaveTreaties = view.treaties
      .filter(
        (t) =>
          t.parties.includes(view.you) &&
          t.parties.some((p) => p !== view.you && view.players[p]?.pariah),
      )
      .map((t) => t.id);
    const full: PlanningOrders = {
      ...PASS_ORDERS,
      development,
      repositioning: move,
      loads: loads(view),
      modes: modes(view),
      counterIntel,
      shadow,
      leaveTreaties,
      main,
    };
    const plan = (orders: PlanningOrders): Command => ({ type: 'SubmitPlanning', orders });
    return [
      plan(full),
      plan({ ...full, main: { type: 'pass' }, repositioning: [] }),
      plan({ ...full, main: { type: 'pass' }, repositioning: [], shadow: [], counterIntel: 0 }),
      plan({ ...PASS_ORDERS, development }),
      plan({ ...PASS_ORDERS, modes: full.modes }),
    ];
  }

  // ---------------------------------------------------------- other decisions

  function reaction(view: PlayerView, decision: PendingDecision): Command[] {
    const slot = decision.slot;
    const root = view.chain?.links[0];
    const rootCard = root ? cardDef(ctx, root.card) : null;
    const rootOwner =
      rootCard?.target.type === 'player'
        ? root?.target
        : rootCard?.target.type === 'territory'
          ? view.territories[root?.target ?? '']?.owner
          : null;
    const answers = (id: string): boolean => {
      const card = cardDef(ctx, id);
      if (!slot || !rootCard || !card.plays.includes(slot)) return false;
      if (card.target.type !== 'chain-card')
        return (
          slot === 'stabilization' &&
          card.effects.some((e) => e['mode'] === 'stabilization') &&
          rootCard.tension > 0
        );
      const filters = card.target.filters ?? [];
      if (
        filters.includes('targets-own-territory') &&
        (rootCard.target.type !== 'territory' || rootOwner !== view.you)
      )
        return false;
      if (filters.includes('economic-or-interdiction') && !rootCard.tags.includes('economic'))
        return false;
      if (filters.includes('targets-self') && rootOwner !== view.you) return false;
      return true;
    };
    const playable = [...new Set(view.me.hand)].filter(answers).sort();
    const wanted = w.defense + w.diplomacy >= 6 ? playable : [];
    return [
      ...wanted.map((card): Command => ({ type: 'React', card })),
      { type: 'React', card: null },
    ];
  }

  function choice(view: PlayerView, decision: PendingDecision): Command[] {
    const options = decision.options ?? [];
    const root = view.chain?.links[0]?.card;
    const prefer: string[] = [];
    switch (root) {
      case 'ultimatum':
        prefer.push(
          unitCount(view, 'groundFormation') >= 3 || w.aggression >= 5 ? 'refuse' : 'yield',
        );
        break;
      case 'doomsday-rhetoric':
        if (w.aggression >= 6) prefer.push('refuse');
        prefer.push(
          view.me.reserves.supplies > view.me.reserves.production
            ? 'pay-supplies'
            : 'pay-production',
          'refuse',
        );
        break;
      case 'summit':
        prefer.push(w.aggression >= 7 ? 'refuse' : 'attend');
        break;
      case 'global-embargo':
        prefer.push(w.diplomacy + w.aggression >= 6 ? 'join' : 'abstain');
        break;
      case 'verification-mission': {
        const hiding =
          Object.values(view.me.hiddenStock).some((n) => n > 0) ||
          myInstallations(view).some((i) => i.hidden);
        prefer.push(hiding ? 'decline' : 'accept');
        break;
      }
      case 'hotline':
        prefer.push(w.aggression >= 7 ? 'decline' : 'accept');
        break;
    }
    const ordered = [...prefer.filter((o) => options.includes(o)), ...options];
    return ordered.map((option): Command => ({ type: 'Choose', option }));
  }

  function proposal(view: PlayerView): Command[] {
    const chain = view.chain;
    const from = chain?.initiator;
    const kind = chain?.proposal?.kind;
    if (!from || !kind) return [{ type: 'AnswerProposal', accept: false }];
    let accept = hostility(view, view.you, from) < 3 && w.aggression < 9;
    if (kind === 'ceasefire' || kind === 'mediation') accept = w.aggression < 8;
    if (kind === 'settlement') accept = w.diplomacy >= 8;
    if (kind === 'defensive') accept = accept && w.defense + w.diplomacy >= 8;
    return [{ type: 'AnswerProposal', accept }];
  }

  function crisisVote(view: PlayerView): Command[] {
    const armed = (view.players[view.you]?.posturePoints ?? 0) > 0;
    return [
      {
        type: 'CastCrisisVote',
        vote: personality.authorizeRelease && armed ? 'authorize' : 'hold',
      },
    ];
  }

  function honor(view: PlayerView): Command[] {
    const calls = view.honorCalls.filter((c) => c.ally === view.you);
    const resent = calls.some((c) => hostility(view, view.you, c.aggressor) >= 1);
    return [
      { type: 'AnswerHonorCall', honor: personality.honorAllies && (resent || w.defense >= 5) },
    ];
  }

  function commit(view: PlayerView): Command[] {
    const plans: NuclearPlan[] = [];
    const enemies = rivals(view).filter((r) => relation(view, r) === 'war');
    const ready = myInstallations(view, 'silo').filter(
      (s) => s.condition === 'operational' && (s.loaded?.['warheads'] ?? 0) > 0,
    );
    for (const [i, silo] of ready.entries()) {
      const enemy = enemies[i % Math.max(1, enemies.length)];
      if (!enemy) break;
      const capital = capitalOf(ctx, enemy);
      if (!capital || view.territories[capital]?.owner !== enemy) continue;
      const firstStrike =
        w.nuclear >= 9 && w.aggression >= 9 && view.tension.release === 'aftermath';
      plans.push({
        id: '',
        delivery: silo.id,
        count: 1,
        target: capital,
        fallback: null,
        wave: firstStrike ? 0 : 1,
        policy: firstStrike ? 'scheduled' : 'retaliation',
        trigger: firstStrike ? null : enemy,
      });
    }
    return [
      { type: 'CommitNuclear', plans },
      { type: 'CommitNuclear', plans: [] },
    ];
  }

  return {
    player,
    personality,
    decide(view, decision) {
      switch (decision.kind) {
        case 'planning':
          return planning(view);
        case 'reaction':
          return reaction(view, decision);
        case 'choice':
          return choice(view, decision);
        case 'proposal':
          return proposal(view);
        case 'crisis-vote':
          return crisisVote(view);
        case 'honor':
          return honor(view);
        case 'commit':
          return commit(view);
      }
    },
  };
}
