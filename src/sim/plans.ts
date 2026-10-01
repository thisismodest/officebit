// Plans (docs/PLANS.md): people arranging things together. Each morning some
// sociable people (and ambitious ones, for their projects) suggest something for
// later: frisbee or a picnic in the park, a get-together or a meal at the diner, working on
// a project together over laptops. They ask friends and colleagues they get on
// with; those who are free and fancy it say yes, and it's in the News. When it's
// time, they're drawn there; together, they bond. An activity says who it's for,
// how many, when, and what it needs of a place, so any park, venue or bench that
// offers that (the catalog's `gather` and `worktop`, a room's `park`) will do.
import { TICKS_PER_HOUR, formatTime, hourOf, tickAt, dayOf } from './clock.ts';
import type { Intent, Person } from './person.ts';
import { FRIENDS } from './relationships.ts';
import { kindOf } from './roles.ts';
import { phaseAt } from './schedule.ts';
import type { Item, Simulation } from './sim.ts';
import type { Place, Tile } from './world.ts';

export type ActivityId = 'catch' | 'picnic' | 'meetup' | 'meal' | 'cowork' | 'boat';

interface Activity {
  /** How it reads in the News: "for frisbee", "for a picnic"… */
  news: string;
  emoji: string;
  /** How many take part, organiser included. */
  group: [min: number, max: number];
  /** Friends and friendly colleagues, or people with a project on (co-founders, the ambitious). */
  who: 'friends' | 'makers';
  /** Partners and children come along too. */
  family?: boolean;
  /** Out in the park, in daylight; on the river (from the jetty, in daylight, April to October); otherwise at a venue's seats. */
  where: 'park' | 'river' | 'gather' | 'worktop';
  /** Game hours it lasts. */
  hours: number;
  /** Days off only (a picnic), or evenings too. */
  daysOffOnly?: boolean;
}

export const ACTIVITIES: Record<ActivityId, Activity> = {
  catch: { news: 'for frisbee', emoji: '🥏', group: [2, 4], who: 'friends', where: 'park', hours: 1 },
  picnic: { news: 'for a picnic', emoji: '🧺', group: [3, 6], who: 'friends', family: true, where: 'park', hours: 1.5, daysOffOnly: true },
  meetup: { news: 'to catch up', emoji: '☕', group: [2, 4], who: 'friends', where: 'gather', hours: 1.5 },
  meal: { news: 'for a bite to eat', emoji: '🍔', group: [3, 4], who: 'friends', where: 'gather', hours: 1.5 },
  cowork: { news: 'to work on their projects together', emoji: '💻', group: [2, 4], who: 'makers', where: 'worktop', hours: 2 },
  boat: { news: 'for a boat trip', emoji: '⛵', group: [2, 4], who: 'friends', where: 'river', hours: 1.5 },
};

/** Months the boats go out (1–12). */
const BOATING: [from: number, to: number] = [4, 10];

/** Days the town has its own do, or everyone's at home: no plans. */
const NO_PLANS = new Set(['bonfireNight', 'newYearsEve', 'christmas']);
/** When plans are made each day, and when they start: days off from late morning, weekdays after work. */
const PLAN_HOUR = 8;
const DAY_OFF_STARTS = [11, 13, 15];
const EVENING_START = 18.5;
/** Daily chance someone suggests something, by how sociable (or, for projects, ambitious) they are. */
const SUGGEST = 0.3;
/** Who's asked: friends, or colleagues someone gets on with at least this well (it can grow into a friendship). */
const FRIENDLY = 0.1;
/** How keen someone asked is: a base, and more for the sociable and for how well they get on. */
const ACCEPT = { base: 0.3, social: 0.4, affinity: 0.3 };
/** How early before the start (game hours) they set off, and how near (tiles) the place counts as there. */
const SET_OFF = 0.75;
/** The chance someone suggests the park anyway when it'll be raining or snowing. */
const WET_PARK = 0.15;
const THERE = 3;
/** Bonding while together: a share of a chat's, so days out help without running away. */
const BOND = 0.25;
/** How many in a ring for catch, and how far from its middle. */
const RING = 2;

export interface Plan {
  id: number;
  activity: ActivityId;
  organiser: string;
  /** Everyone going, organiser first; family along for the day too. */
  members: string[];
  start: number;
  end: number;
  /** Where: the middle of a spot in the park, or the seats (a booth, a bench) at a venue. */
  level: string;
  at: Tile;
  item?: number;
  /** In the News as under way. */
  begun?: boolean;
}

export class Plans {
  readonly list: Plan[] = [];
  private readonly sim: Simulation;
  private count = 0;
  /** Who's been called away to their plan already (a plan calls someone once: after that, it's up to them). */
  private readonly called = new Set<string>();

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** The plan someone's in, if it's today. */
  of(p: Person): Plan | undefined {
    return p.plan === undefined ? undefined : this.list.find((plan) => plan.id === p.plan);
  }

  get(id: number): Plan | undefined {
    return this.list.find((plan) => plan.id === id);
  }

  /** Their plan, if it's time to go (or they're at it). */
  due(p: Person): Plan | undefined {
    const plan = this.of(p);
    const { tick } = this.sim;
    return plan && tick >= plan.start - SET_OFF * TICKS_PER_HOUR && tick < plan.end ? plan : undefined;
  }

  /** A plan as a line for a profile: "🥏 Frisbee on the Green with Lou and Cal, 11:00". */
  describe(p: Person): string {
    const plan = this.of(p);
    if (!plan) return '';
    const { emoji } = ACTIVITIES[plan.activity];
    const what = { catch: 'Frisbee', picnic: 'A picnic', meetup: 'Catching up', meal: 'A bite to eat', cowork: 'Working on projects together', boat: 'A boat trip' }[plan.activity];
    const with_ = names(plan.members.filter((id) => id !== p.id).map((id) => this.sim.person(id)?.name ?? '').filter(Boolean));
    return `${emoji} ${what} at ${placeName(plan, this.sim)}${with_ ? ` with ${with_}` : ''}, ${formatTime(plan.start)}`;
  }

  /** Seats kept for a plan from when its people set off till it's over: nobody else takes them. */
  reserved(item: number, p: Person): boolean {
    const { tick } = this.sim;
    return this.list.some((plan) => plan.item === item && tick >= plan.start - SET_OFF * TICKS_PER_HOUR && tick < plan.end && !plan.members.includes(p.id));
  }

  /** Is it time they were off to their plan, and what they're doing isn't it? (Grown-ups with somewhere to be drop what they're doing; a chat there is fine.) */
  calls(p: Person, intent: Intent): boolean {
    const plan = this.due(p);
    if (!plan || p.species !== 'human' || this.called.has(`${plan.id}:${p.id}`)) return false;
    const off = this.away(plan, intent, p);
    if (off) this.called.add(`${plan.id}:${p.id}`);
    return off;
  }

  /** Is what they're doing something other than their plan? */
  private away(plan: Plan, intent: Intent, p: Person): boolean {
    if (intent.kind === 'play') return intent.plan !== plan.id;
    if (intent.kind === 'use' || intent.kind === 'hustle') return intent.item !== plan.item;
    if (intent.kind === 'wander') return intent.to.level !== plan.level || Math.hypot(intent.to.p[0] - plan.at[0], intent.to.p[1] - plan.at[1]) > THERE;
    // Chatting with someone there, or anything that takes them where the plan is, can carry on.
    return intent.kind !== 'chat' && intent.kind !== 'sleep' && p.level !== plan.level;
  }

  /** The level a plan takes someone to, while it's on: part of where they may go. */
  levelFor(p: Person): string | undefined {
    return this.due(p)?.level;
  }

  /** Once an hour: plans made in the morning, and old ones cleared away. */
  hourly(): void {
    const { sim } = this;
    for (const plan of [...this.list]) if (sim.tick >= plan.end) this.finish(plan);
    if (Math.round(hourOf(sim.tick)) === PLAN_HOUR) this.makePlans();
  }

  /** Every step: the picnic blanket laid out when the organiser gets there; it's in the News once two are there; they bond. */
  step(): void {
    const { sim } = this;
    for (const plan of this.list) {
      if (sim.tick < plan.start - SET_OFF * TICKS_PER_HOUR || sim.tick >= plan.end) continue;
      const there = plan.members.map((id) => sim.person(id)).filter((p): p is Person => !!p && this.at(p, plan));
      if (plan.activity === 'picnic' && plan.item === undefined && there.some((p) => p.id === plan.organiser)) this.layOut(plan);
      if (!plan.begun && there.filter((p) => p.species === 'human').length >= 2) {
        plan.begun = true;
        sim.log(`${ACTIVITIES[plan.activity].emoji} ${names(there.map((p) => p.name))} ${gathered(plan, sim)}`, there.map((p) => p.id));
      }
      // Time together, doing something: friendships grow a little.
      for (const [i, a] of there.entries()) for (const b of there.slice(i + 1)) sim.social.together(a, b, sim.dt * BOND);
    }
  }

  /** Where someone at a game in the park stands: their place in the ring round its middle. */
  spotFor(plan: Plan, p: Person): Place {
    const i = Math.max(0, plan.members.indexOf(p.id));
    const angle = (i / Math.max(2, plan.members.length)) * Math.PI * 2;
    const grid = this.sim.grids.get(plan.level);
    const spot: Tile = [Math.round(plan.at[0] + Math.cos(angle) * RING), Math.round(plan.at[1] + Math.sin(angle) * RING)];
    return { level: plan.level, p: grid?.free(...spot) ? spot : plan.at };
  }

  // ── Making plans ──────────────────────────────────────────────────────────

  private makePlans(): void {
    const { sim } = this;
    const day = dayOf(sim.tick);
    const dayOff = sim.dayOff();
    if (NO_PLANS.has(sim.holiday()?.id ?? '')) return;
    for (const p of sim.people) {
      if (!this.planner(p) || p.plan !== undefined) continue;
      const maker = sim.ventures.wantsToHustle(p);
      const keen = maker ? Math.max(p.traits.ambition, p.traits.social) : p.traits.social;
      if (sim.rng.next() >= SUGGEST * keen) continue;
      const start = dayOff ? tickAt(day, DAY_OFF_STARTS[sim.rng.int(0, DAY_OFF_STARTS.length - 1)]!) : tickAt(day, EVENING_START);
      const activity = this.choose(maker, dayOff, start);
      if (activity) this.propose(p, activity, start);
    }
  }

  /** Someone who might make or join plans: a grown-up who lives in town. */
  private planner(p: Person): boolean {
    return p.species === 'human' && !!p.home && p.role !== 'child' && !p.leaving && ['employee', 'family', 'staff'].includes(kindOf(p));
  }

  /** What they'd suggest: their project, if they have one on; otherwise something fun, outdoors only in daylight. */
  private choose(maker: boolean, dayOff: boolean, start: number): ActivityId | undefined {
    const { sim } = this;
    if (maker && sim.rng.next() < 0.5) return 'cowork';
    const light = (id: ActivityId) => sim.daylight(start) > 0.6 && sim.daylight(start + ACTIVITIES[id].hours * TICKS_PER_HOUR) > 0.6;
    const outdoors = (id: ActivityId) => ACTIVITIES[id].where === 'park' || ACTIVITIES[id].where === 'river';
    // In the wet, the park's mostly off (now and then someone suggests it anyway); the river's off altogether, and out of season.
    const { month } = sim.dateOf(start);
    const dry = (id: ActivityId) =>
      ACTIVITIES[id].where === 'river'
        ? sim.weather.wet(start) === 0 && month >= BOATING[0] && month <= BOATING[1]
        : ACTIVITIES[id].where !== 'park' || sim.weather.wet(start) === 0 || sim.rng.next() < WET_PARK;
    // On a day off, a picnic's the likeliest thing to suggest; on an evening, something to eat.
    const likely: ActivityId[] = dayOff ? ['catch', 'picnic', 'picnic', 'picnic', 'meetup', 'meal', 'boat', 'boat'] : ['catch', 'meetup', 'meal', 'meal', 'boat'];
    const options = likely.filter((id) => (!ACTIVITIES[id].daysOffOnly || dayOff) && (!outdoors(id) || light(id)) && dry(id));
    return options[sim.rng.int(0, options.length - 1)];
  }

  /** Ask round; if enough say yes and there's somewhere to do it, it's on. */
  private propose(organiser: Person, activity: ActivityId, start: number): void {
    const { sim } = this;
    const { group, who, family } = ACTIVITIES[activity];
    const asked = sim.people
      .filter((q) => q !== organiser && this.planner(q) && q.plan === undefined && this.free(q, start) && this.wouldAsk(organiser, q, who))
      .sort((a, b) => sim.affinity(organiser, b) - sim.affinity(organiser, a));
    const going = [organiser];
    for (const q of asked) {
      if (going.length >= group[1]) break;
      const keen = ACCEPT.base + ACCEPT.social * q.traits.social + ACCEPT.affinity * sim.affinity(organiser, q) + (who === 'makers' ? 0.2 * q.traits.ambition : 0);
      if (sim.rng.next() < keen) going.push(q);
    }
    // Partners and children come along to a picnic (and count towards the numbers, up to the most it takes).
    const along = family
      ? sim.people
          .filter((q) => q.species === 'human' && q.npc && q.plan === undefined && !going.includes(q) && going.some((g) => g.home && g.home === q.home) && q.role !== 'staff')
          .slice(0, Math.max(0, group[1] - going.length))
      : [];
    if (going.length < 2 || going.length + along.length < group[0]) return;
    const end = start + ACTIVITIES[activity].hours * TICKS_PER_HOUR;
    const place = this.placeFor(activity, going.length + along.length, start, end);
    if (!place) return;
    const plan: Plan = { id: ++this.count, activity, organiser: organiser.id, members: [...going, ...along].map((q) => q.id), start, end, ...place };
    for (const id of plan.members) sim.person(id)!.plan = plan.id;
    this.list.push(plan);
    const spot = placeName(plan, sim);
    sim.log(`${ACTIVITIES[activity].emoji} ${names(going.map((q) => q.name))} are meeting at ${spot} ${ACTIVITIES[activity].news} at ${formatTime(start)}`, going.map((q) => q.id));
  }

  /** Who'd be asked: friends, or colleagues they get on with; for a project, their venture's team or others with ideas on the go. */
  private wouldAsk(p: Person, q: Person, who: Activity['who']): boolean {
    const { sim } = this;
    const affinity = sim.affinity(p, q);
    if (who === 'makers') return (!!p.venture && p.venture === q.venture) || (sim.ventures.wantsToHustle(q) && affinity >= 0);
    const colleague = !!p.company && p.company === q.company;
    return affinity >= FRIENDS || (colleague && affinity >= FRIENDLY);
  }

  /** Free then: at home, as their day has it (not at work or on shift, not asleep), and not on a date. */
  private free(q: Person, start: number): boolean {
    const hour = hourOf(start);
    const off = this.sim.dayOff(start);
    const phase = phaseAt(q.routine, hour, off && !q.shift);
    return phase === 'home' && !(q.date && q.date.until > start);
  }

  /** Somewhere for it: a clear spot in a park, or seats enough (a booth, a bench) at a venue that nobody's using for a plan. */
  private placeFor(activity: ActivityId, size: number, start: number, end: number): { level: string; at: Tile; item?: number } | undefined {
    const { sim } = this;
    const { where } = ACTIVITIES[activity];
    if (where === 'park') return this.parkSpot();
    if (where === 'river') return this.jetty(start, end);
    const taken = new Set(this.list.filter((plan) => plan.start < end && start < plan.end).map((plan) => plan.item));
    const seats = sim
      .activeItems()
      .filter((i) => !taken.has(i.index) && i.type.spots.length >= size && (where === 'gather' ? i.type.gather : i.type.worktop) && this.canMeetAt(i, start, end));
    const seat = seats[sim.rng.int(0, seats.length - 1)];
    return seat ? { level: seat.level, at: seat.def.p, item: seat.index } : undefined;
  }

  /** A venue open for the whole of it (or a bench out in the park, in daylight). */
  private canMeetAt(item: Item, start: number, end: number): boolean {
    const { sim } = this;
    const level = sim.levels.get(item.level);
    if (level?.kind === 'venue') return true;
    const inPark = level?.kind === 'outside' && level.rooms.some((r) => r.park && inRect(r.rect, item.def.p));
    return inPark && sim.daylight(start) > 0.6 && sim.daylight(end) > 0.6;
  }

  /** The bank at the root of the jetty, where a boat trip meets: if there's a jetty and boats, and no other trip then. */
  private jetty(start: number, end: number): { level: string; at: Tile } | undefined {
    const { sim } = this;
    const outside = sim.traffic.level;
    const jetty = outside ? sim.levels.get(outside)?.rooms.find((r) => r.floor === 'jetty') : undefined;
    if (!outside || !jetty || !sim.activeItems().some((i) => i.type.boat)) return undefined;
    if (this.list.some((plan) => plan.activity === 'boat' && plan.start < end && start < plan.end)) return undefined;
    return { level: outside, at: [jetty.rect[0], jetty.rect[1] - 1] };
  }

  /** A clear bit of park: grass, free, with room round it for a ring or a blanket. */
  private parkSpot(): { level: string; at: Tile } | undefined {
    const { sim } = this;
    const outside = sim.traffic.level;
    const level = outside ? sim.levels.get(outside) : undefined;
    const grid = outside ? sim.grids.get(outside) : undefined;
    const parks = level?.rooms.filter((r) => r.park) ?? [];
    if (!level || !grid || !outside || parks.length === 0) return undefined;
    const taken = this.list.filter((plan) => plan.level === outside).map((plan) => plan.at);
    for (let tries = 0; tries < 40; tries++) {
      const park = parks[sim.rng.int(0, parks.length - 1)]!;
      const [x, y, w, h] = park.rect;
      const at: Tile = [sim.rng.int(x + RING, x + w - 1 - RING), sim.rng.int(y + RING, y + h - 1 - RING)];
      const around = Array.from({ length: RING * 2 + 1 }, (_, i) => i - RING);
      const clear = around.every((dy) => around.every((dx) => grid.free(at[0] + dx, at[1] + dy) && level.rooms[grid.roomAt(at[0] + dx, at[1] + dy)]?.floor === 'grass'));
      if (clear && !taken.some((t) => Math.hypot(t[0] - at[0], t[1] - at[1]) < RING * 3)) return { level: outside, at };
    }
    return undefined;
  }

  // ── On the day ────────────────────────────────────────────────────────────

  private at(p: Person, plan: Plan): boolean {
    return p.level === plan.level && this.sim.present(p) && Math.hypot(p.x - plan.at[0], p.y - plan.at[1]) <= THERE;
  }

  /** The organiser lays the picnic out: a blanket on the grass, where they are. */
  private layOut(plan: Plan): void {
    const { sim } = this;
    const blanket = sim.addItem(plan.level, { t: 'picnicBlanket', p: [plan.at[0] - 1, plan.at[1] - 1] });
    if (!blanket) return;
    plan.item = blanket.index;
    const organiser = sim.person(plan.organiser);
    if (organiser) sim.log(`🧺 ${organiser.name} laid out a picnic`, [organiser.id]);
  }

  /** Over: the picnic packed up, and everyone free of it. */
  private finish(plan: Plan): void {
    const { sim } = this;
    if (plan.activity === 'picnic' && plan.item !== undefined) {
      const blanket = sim.items[plan.item];
      if (blanket && !blanket.gone) sim.removeItem(blanket);
    }
    for (const id of plan.members) {
      const p = sim.person(id);
      if (p?.plan === plan.id) p.plan = undefined;
      this.called.delete(`${plan.id}:${id}`);
    }
    this.list.splice(this.list.indexOf(plan), 1);
  }
}

/** "Bea", "Bea and Lou", "Bea, Lou and Cal". */
function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/** Where a plan is, by name: the park it's in (the Green), or the venue (the diner). */
function placeName(plan: Plan, sim: Simulation): string {
  if (plan.activity === 'boat') return 'the jetty';
  const level = sim.levels.get(plan.level);
  return level?.rooms.find((r) => r.park && inRect(r.rect, plan.at))?.name ?? level?.name ?? 'town';
}

/** What the News says once a plan's under way. */
function gathered(plan: Plan, sim: Simulation): string {
  const place = placeName(plan, sim);
  switch (plan.activity) {
    case 'catch':
      return 'are throwing a frisbee about in the park';
    case 'picnic':
      return 'are having a picnic in the park';
    case 'meetup':
      return `are catching up at ${place}`;
    case 'meal':
      return `are having a bite to eat together at ${place}`;
    case 'cowork':
      return `are working on their projects together at ${place}`;
    case 'boat':
      return 'are down at the jetty for a boat trip';
  }
}

function inRect([x, y, w, h]: [number, number, number, number], [px, py]: Tile): boolean {
  return px >= x && py >= y && px < x + w && py < y + h;
}
