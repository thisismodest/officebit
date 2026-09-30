// The simulation (docs/ARCHITECTURE.md): fixed-step, deterministic, DOM-free.
// Brains choose intents; this file walks people to them and runs them (what
// each intent does is in intents.ts; each kind of person, in roles.ts), across
// every level of the world. The world can also change as it runs: ventures
// open offices, hire people, move into bigger ones.
import { mergeStatus, type FeedMessage } from '../feeds/protocol.ts';
import { PersonalityBrain } from './brain.ts';
import { CATALOG, type FurnitureType } from './catalog.ts';
import { TICKS_PER_HOUR, between, hourOf, isWeekend } from './clock.ts';
import { Grid } from './grid.ts';
import { Navigator, PORTAL_TICKS } from './navigation.ts';
import { Emitter } from './emitter.ts';
import { rulesFor } from './intents.ts';
import { NEEDS, PANTRY_FULL, drain, restore, type Need } from './needs.ts';
import { asleep, atDesk, faceTowards, seatedAtDesk, type Intent, type Person } from './person.ts';
import { resolveTraits, type Traits } from './personality.ts';
import { Housing } from './housing.ts';
import { Interactions } from './interactions.ts';
import { Love } from './love.ts';
import { DISLIKE, Relationships } from './relationships.ts';
import { Rng, hashOf } from './rng.ts';
import { ROLES, dailyRoutine, kindOf, roleOf, type Kind } from './roles.ts';
import { phaseAt, wakeHour, type DayPhase } from './schedule.ts';
import { Social } from './social.ts';
import { Traffic } from './traffic.ts';
import { Visitors } from './visitors.ts';
import { Arrivals } from './arrivals.ts';
import { Careers } from './careers.ts';
import { Construction } from './construction.ts';
import { Ventures } from './ventures.ts';
import type { CompanyDef, FurnitureDef, LevelDef, NpcDef, PersonDef, Place, PortalDef, Tile, WorldDef } from './world.ts';

/** Tiles per tick. */
const SPEED = 0.2;
/** A crawling baby's pace, as a share of walking. */
const CRAWL = 0.3;
/** How often (ticks) people reconsider what they're doing. */
const RETHINK_EVERY = 20;
const PET_TRAITS: Traits = { social: 0.9, diligence: 0, chaos: 0.7, charisma: 0.9, ambition: 0 };
/** How close (tiles) someone they dislike must come before they walk off. */
const AVOID_RADIUS = 2;
/** Events kept in the town-wide log, and in each person's own history. */
const EVENTS_KEPT = 100;
const HISTORY_KEPT = 40;
/** Feed activities that put someone at work whatever the time. */
const WORKING_STATUSES = new Set(['working', 'focus', 'meeting']);

/** Activities the periodic rethink leaves alone. */
const NO_INTERRUPT = new Set<Intent['kind']>(['meeting', 'retreat', 'sleep']);

/** Decides what a person does next. Personality today; an LLM or remote controller tomorrow. */
export interface Brain {
  decide(person: Person, sim: Simulation): Intent;
}

/** A piece of furniture, with its level and its index into sim.items. */
export interface Item {
  index: number;
  level: string;
  def: FurnitureDef;
  type: FurnitureType;
  /** Removed from the world (items are never re-indexed). */
  gone?: boolean;
  /** How many times someone has started using it. */
  uses: number;
}

export interface SimEvent {
  tick: number;
  text: string;
  /** Ids of everyone it involved, for their personal history. */
  who: string[];
}

/** What can be changed about someone from their profile. */
export interface PersonChanges {
  name?: string;
  look?: readonly number[];
  /** A department id, or '' for none. */
  dept?: string;
  preset?: string;
}

type Spawn = Pick<Person, 'id' | 'name' | 'species' | 'npc' | 'look' | 'dept' | 'company' | 'home' | 'role' | 'works' | 'shift' | 'preset' | 'traits' | 'routine'>;

export class Simulation {
  readonly world: WorldDef;
  readonly rng: Rng;
  readonly levels = new Map<string, LevelDef>();
  readonly grids = new Map<string, Grid>();
  readonly companies = new Map<string, CompanyDef>();
  readonly items: Item[] = [];
  readonly people: Person[] = [];
  readonly events: SimEvent[] = [];
  readonly ventures: Ventures;
  readonly construction: Construction;
  readonly careers: Careers;
  readonly relationships: Relationships;
  readonly housing: Housing;
  readonly love: Love;
  readonly interactions: Interactions;
  readonly social: Social;
  readonly traffic: Traffic;
  readonly visitors: Visitors;
  readonly arrivals: Arrivals;
  nav: Navigator;
  /** The game clock, in ticks (6 game seconds each; see clock.ts). Fractional in live mode. */
  tick = 0;
  /** Steps taken. Walking and decisions go per step; everything else per game time. */
  steps = 0;
  /** How much game time the current step covers, in ticks: 1 normally, much less in live mode. */
  dt = 1;
  /** The day (as `dayOf` counts them) the story began on, so its days are numbered from 1: a live town started on a Saturday is on Day 1 that Saturday. */
  firstDay = 0;

  private readonly byId = new Map<string, Person>();
  private readonly brains = new Map<string, Brain>();
  private readonly personBrain: Brain;
  /** One brain per kind of person that has its own (roles.ts), made when first needed. */
  private readonly kindBrains = new Map<Kind, Brain>();
  /** Per item, per spot: id of the person using it. */
  private readonly occupied: (string | null)[][] = [];
  private readonly histories = new Map<string, SimEvent[]>();
  private active: Item[] | null = null;
  private readonly logged = new Emitter<[SimEvent]>();
  private readonly changes = new Emitter<[string[]]>();
  private readonly uses = new Emitter<[Person, Item]>();
  /** Venues with staff of their own, and whether one's in, minding it, right now. */
  private readonly minded = new Map<string, boolean>();

  constructor(world: WorldDef, brain: Brain = new PersonalityBrain()) {
    this.world = world;
    this.rng = new Rng(world.seed);
    this.personBrain = brain;
    this.ventures = new Ventures(this);
    this.construction = new Construction(this);
    this.careers = new Careers(this);
    this.relationships = new Relationships(world.seed);
    this.housing = new Housing(this);
    this.love = new Love(this);
    this.interactions = new Interactions(this);
    this.social = new Social(this);
    this.traffic = new Traffic(this);

    for (const company of world.companies) this.companies.set(company.id, company);
    for (const level of world.levels) this.register(level);
    // Every kitchen starts with something in it.
    world.pantries ??= {};
    for (const level of world.levels) if (level.kind === 'home' && !level.floorOf) world.pantries[level.id] ??= this.rng.int(2, PANTRY_FULL);
    this.nav = new Navigator(this.grids, world.portals);

    for (const def of world.people) this.spawnPerson(def);
    for (const def of world.npcs) this.spawnNpc(def);
    this.visitors = new Visitors(this);
    this.arrivals = new Arrivals(this);
    this.mindVenues(false);
    // Households start out close.
    const humans = this.people.filter((p) => p.species === 'human' && p.home);
    for (const [i, a] of humans.entries()) for (const b of humans.slice(i + 1)) if (a.home === b.home) this.relationships.household(a, b);
  }

  // ── Queries (used by brains and the renderer) ─────────────────────────────

  person(id: string): Person | undefined {
    return this.byId.get(id);
  }

  /** Furniture still in the world. */
  activeItems(): Item[] {
    this.active ??= this.items.filter((item) => !item.gone);
    return this.active;
  }

  placeOf(p: Person): Place {
    return { level: p.level, p: [Math.round(p.x), Math.round(p.y)] };
  }

  /** On screen right now: not offstage or mid-stairs. */
  present(p: Person): boolean {
    return !p.hidden && p.transit === 0;
  }

  spotTile(item: Item, spot: number): Tile {
    const [dx, dy] = item.type.spots[spot]!;
    return [item.def.p[0] + dx, item.def.p[1] + dy];
  }

  freeSpots(index: number): number {
    return this.occupied[index]?.filter((id) => id === null).length ?? 0;
  }

  /** Who is using an item, if anyone. */
  usersOf(index: number): string[] {
    return (this.occupied[index] ?? []).filter((id): id is string => id !== null);
  }

  roomOf(item: Item): number {
    return this.grids.get(item.level)!.roomAt(item.def.p[0], item.def.p[1]);
  }

  /** Is it open right now: within its hours, and (in a venue with staff) with someone minding it? */
  isOpen(item: Item): boolean {
    return this.withinHours(item) && this.venueOpen(item.level);
  }

  /** Within its opening hours? (The shop keeps daily hours; food trucks weekday lunches.) */
  withinHours(item: Item): boolean {
    const { hours, weekdaysOnly } = item.type;
    return !hours || (!(weekdaysOnly && isWeekend(this.tick)) && between(hourOf(this.tick), hours[0], hours[1]));
  }

  /** Is it a venue's opening hours? (Those without hours are always open.) */
  inHours(level: string): boolean {
    const timed = this.activeItems().filter((item) => item.level === level && item.type.hours);
    return timed.length === 0 || timed.some((item) => this.withinHours(item));
  }

  /** Is someone minding this venue? Venues without staff of their own are always open; anywhere else isn't a venue. */
  venueOpen(level: string): boolean {
    return this.minded.get(level) ?? true;
  }

  /** The people who staff a venue: its company's employees, or staff who work there. */
  staffOf(level: string): Person[] {
    return this.people.filter((p) => p.works === level || !!this.companies.get(p.company ?? '')?.levels.includes(level));
  }

  /** Is one of a venue's staff on shift but not in yet, or due in later today (so it's worth waiting for it to open)? */
  staffDueSoon(level: string): boolean {
    const hour = hourOf(this.tick);
    const workingDay = (p: Person) => !!p.shift || !roleOf(p).weekends || !isWeekend(this.tick);
    return this.staffOf(level).some((p) => workingDay(p) && (this.phaseOf(p) === 'work' || hour < p.routine.commute));
  }

  /** Could `p` use this item during `phase`? Their area, or street food at lunch; and at home, only with ingredients in. */
  canUse(p: Person, item: Item, phase: DayPhase): boolean {
    if (item.gone || !this.isOpen(item)) return false;
    const needs = item.type.usesPantry ?? 0;
    if (needs > 0 && this.levels.get(item.level)?.kind === 'home' && this.pantry(this.baseOf(item.level)) < needs) return false;
    return this.areaOf(p, phase).includes(item.level) || (phase === 'work' && !!item.type.street);
  }

  /** Meals' worth of ingredients in a home's kitchen. */
  pantry(home: string): number {
    return this.world.pantries?.[home] ?? PANTRY_FULL;
  }

  /** How well two people get on, −1 to 1 (see relationships.ts). */
  affinity(a: Person, b: Person): number {
    return this.relationships.affinity(a, b);
  }

  /** How much `p` dislikes the people within `radius` of a point: the sum of their negative affinities, for those they don't get on with. */
  dislikeNear(p: Person, level: string, x: number, y: number, radius: number): number {
    return this.near(level, x, y, radius, p)
      .map((q) => (q.species === 'human' ? this.affinity(p, q) : 0))
      .reduce((sum, a) => sum + (a <= DISLIKE ? -a : 0), 0);
  }

  /** People standing around within `radius` tiles (desk workers and pets don't count), excluding `except`. */
  crowdAt(level: string, x: number, y: number, radius: number, except?: Person): number {
    return this.near(level, x, y, radius, except).filter((p) => p.species === 'human' && !atDesk(p)).length;
  }

  /** Total charisma nearby — how much of a draw a spot is. */
  pullAt(level: string, x: number, y: number, radius: number, except?: Person): number {
    return this.near(level, x, y, radius, except).reduce((sum, p) => sum + p.traits.charisma, 0);
  }

  randomWalkable(level: string, room = -1): Place | null {
    const grid = this.grids.get(level);
    if (!grid) return null;
    for (let tries = 0; tries < 60; tries++) {
      const p: Tile = [this.rng.int(0, grid.w - 1), this.rng.int(0, grid.h - 1)];
      if (!grid.walkable(p[0], p[1]) || this.isClaimed({ level, p })) continue;
      if (room >= 0 && grid.roomAt(p[0], p[1]) !== room) continue;
      return { level, p };
    }
    return null;
  }

  /** A room by id, anywhere in the world. */
  findRoom(id: string | undefined): { level: string; room: number } | null {
    for (const level of this.world.levels) {
      const room = level.rooms.findIndex((r) => r.id === id);
      if (room >= 0) return { level: level.id, room };
    }
    return null;
  }

  /** Where someone is in their day: their routine, as their kind of person keeps it (roles.ts). Feed status overrides it. */
  phaseOf(p: Person): DayPhase {
    const role = roleOf(p);
    // Offices, crews and schools keep office weeks; anyone on shifts works them every day.
    const weekend = ((role.weekends && !p.shift) || this.levels.get(p.works ?? '')?.kind === 'school') && isWeekend(this.tick);
    const natural = phaseAt(p.routine, hourOf(this.tick), weekend);
    switch (role.day) {
      case 'errand':
        return 'work';
      case 'routine':
        return natural;
      case 'homebody':
        return natural === 'sleep' ? 'sleep' : 'home';
      case 'employee':
        if (p.status.presence === 'away') return natural === 'sleep' ? 'sleep' : 'home';
        if (p.status.presence === 'here' || WORKING_STATUSES.has(p.status.activity ?? '')) return 'work';
        if (natural === 'work' && !this.companies.get(p.company ?? '')) return 'home';
        return natural;
    }
  }

  /** Levels someone may pick things from during a phase: work or home first, then (for those who go out) any public venue. */
  areaOf(p: Person, phase: DayPhase): string[] {
    const work = p.works ? [p.works] : (this.companies.get(p.company ?? '')?.levels ?? []);
    const base = phase === 'work' ? work : p.home ? this.floorsOf(p.home) : [];
    if (!roleOf(p).goesOut || phase === 'sleep' || base.length === 0) return base;
    return [...base, ...this.publicPlaces()];
  }

  /** Every floor of the building whose ground floor is `level`: it, then any you've added above it. */
  floorsOf(level: string): string[] {
    return [level, ...this.world.levels.filter((l) => l.floorOf === level).map((l) => l.id)];
  }

  /** The ground floor of the building a level's in (itself, unless it's a floor you added). */
  baseOf(level: string): string {
    return this.levels.get(level)?.floorOf ?? level;
  }

  /** Venues anyone can walk into right now: the open ones. */
  publicPlaces(): string[] {
    return this.world.levels.filter((l) => l.kind === 'venue' && this.venueOpen(this.baseOf(l.id))).map((l) => l.id);
  }

  /** The tick of this person's next wake-up. */
  nextWake(p: Person): number {
    const now = hourOf(this.tick);
    // Tomorrow if today's wake-up has passed; weekends get a lie-in.
    const ahead = (h: number) => (h - now + 24) % 24;
    const weekday = this.tick + Math.round(ahead(p.routine.wake) * TICKS_PER_HOUR);
    const hours = ahead(wakeHour(p.routine, isWeekend(weekday)));
    return this.tick + Math.max(1, Math.round(hours * TICKS_PER_HOUR));
  }

  // ── Control ───────────────────────────────────────────────────────────────

  setBrain(personId: string, brain: Brain): void {
    this.brains.set(personId, brain);
  }

  /** Back to the brain their role gives them. */
  clearBrain(personId: string): void {
    this.brains.delete(personId);
  }

  /** Stop whatever someone's doing, so they decide afresh (their brain may have changed its mind for them). */
  interrupt(p: Person): void {
    this.stop(p);
  }

  /** Someone has started using a piece of furniture (for sound effects; listeners mustn't change the story). */
  onUse(listener: (p: Person, item: Item) => void): () => void {
    return this.uses.on(listener);
  }

  onEvent(listener: (event: SimEvent) => void): () => void {
    return this.logged.on(listener);
  }

  /** Called when the world changes: with the ids of levels whose layout changed (new buildings, new offices), or none if only the cast did. */
  onChange(listener: (levels: string[]) => void): () => void {
    return this.changes.on(listener);
  }

  /** Record something that happened, and to whom. */
  log(text: string, who: string[] = []): void {
    const event: SimEvent = { tick: this.tick, text, who };
    this.events.push(event);
    if (this.events.length > EVENTS_KEPT) this.events.shift();
    for (const id of who) {
      const history = this.histories.get(id) ?? [];
      history.push(event);
      if (history.length > HISTORY_KEPT) history.shift();
      this.histories.set(id, history);
    }
    this.logged.emit(event);
  }

  /** What's happened to someone lately, oldest first. */
  historyOf(id: string): readonly SimEvent[] {
    return this.histories.get(id) ?? [];
  }

  /**
   * Run a read-only query that may draw random numbers (like asking a brain for
   * its options), then put the random state back, so looking never changes the story.
   */
  peek<T>(query: () => T): T {
    const state = this.rng.state;
    try {
      return query();
    } finally {
      this.rng.state = state;
    }
  }

  /** Apply a feed update. Returns false if the id didn't match anyone. */
  applyFeed(message: FeedMessage): boolean {
    const id = this.world.feed?.ids?.[message.id] ?? message.id;
    const p = this.byId.get(id);
    if (!p || p.npc) return false;
    const before = p.status;
    p.status = mergeStatus(p.status, message);
    const changed = before.presence !== p.status.presence || before.activity !== p.status.activity || before.room !== p.status.room;
    if (changed) {
      this.stop(p);
      if (p.status.presence === 'away') this.log(`${p.name} is heading home`, [p.id]);
      else if (p.status.activity === 'focus') this.log(`${p.name} put their headphones on`, [p.id]);
      else if (p.status.activity === 'meeting') this.log(`${p.name} is off to a meeting`, [p.id]);
    }
    return true;
  }

  /**
   * Advance one step covering `dt` ticks of game time. People walk the same
   * distance whatever `dt` is; needs, timers and work scale with it.
   */
  step(dt = 1): void {
    const hourBefore = Math.floor(this.tick / TICKS_PER_HOUR);
    this.dt = dt;
    this.tick += dt;
    this.steps++;
    if (Math.floor(this.tick / TICKS_PER_HOUR) !== hourBefore) {
      this.ventures.hourly();
      this.careers.hourly();
      this.love.hourly();
    }
    this.mindVenues(true);
    this.construction.step();
    this.interactions.step();
    this.traffic.step();
    this.visitors.step();
    this.arrivals.step();
    const gone: Person[] = [];
    for (const [i, p] of this.people.entries()) {
      p.px = p.x;
      p.py = p.y;
      drain(p.needs, p.traits, asleep(p) ? 'asleep' : seatedAtDesk(p) ? 'working' : 'awake', dt);
      // Pets are fed by their humans.
      if (p.species !== 'human') p.needs.hunger = 1;
      if (!atDesk(p)) p.focus = Math.max(0, p.focus - 0.002 * dt);
      if (p.distracted > 0) p.distracted = Math.max(0, p.distracted - dt);
      if (p.date && this.tick >= p.date.until) delete p.date;

      // Leaving town: once they're off the edge of it, they're gone.
      if (p.leaving && p.hidden) {
        gone.push(p);
        continue;
      }
      if (p.hidden) {
        if (this.phaseOf(p) !== 'work') continue;
        p.hidden = false;
      }
      if (p.transit > 0) {
        p.transit--;
        continue;
      }
      if (!p.intent) this.begin(p, p.leaving ? { kind: 'leave' } : this.brainOf(p).decide(p, this));
      if ((this.steps + i) % RETHINK_EVERY === 0 && this.rethink(p)) continue;

      if (p.phase === 'moving') this.move(p);
      else this.act(p);
    }
    for (const p of gone) this.gone(p);
  }

  /**
   * Which venues have someone minding them: a member of staff there and on
   * shift. One that's just shut (or opened) is news; customers leave, because
   * it's no longer anywhere they may be.
   */
  private mindVenues(news: boolean): void {
    for (const level of this.world.levels) {
      if (level.kind !== 'venue') continue;
      const staff = this.staffOf(level.id);
      if (staff.length === 0) continue;
      const open = staff.some((p) => p.level === level.id && this.present(p) && this.phaseOf(p) === 'work');
      const was = this.minded.get(level.id);
      this.minded.set(level.id, open);
      // Closing time isn't news; staff not being there in opening hours is.
      if (news && this.inHours(level.id) && was !== undefined && was !== open) this.log(open ? `🔓 ${level.name} is open` : `🔒 ${level.name} is shut: nobody's minding it`, []);
    }
  }

  // ── World editing (ventures use these) ────────────────────────────────────

  addLevel(level: LevelDef): void {
    this.arranged(level);
    this.world.levels.push(level);
    this.register(level);
    this.changed([level.id]);
  }

  /** Swap a level's layout for a new one with the same id. Its door portals move to `entry`. */
  replaceLevel(level: LevelDef, entry: Tile): void {
    const index = this.world.levels.findIndex((l) => l.id === level.id);
    if (index < 0) return;
    this.arranged(level);
    for (const item of this.items) if (item.level === level.id) this.retire(item);
    this.world.levels[index] = level;
    this.register(level);
    for (const portal of this.world.portals) {
      for (const end of [portal.a, portal.b]) if (end.level === level.id) end.p = entry;
    }
    for (const p of this.people) {
      if (p.level !== level.id) continue;
      this.stop(p);
      [p.x, p.y] = [p.px, p.py] = entry;
    }
    this.renav();
    this.changed([level.id]);
  }

  addItem(level: string, def: FurnitureDef): Item | undefined {
    const type = CATALOG[def.t];
    const target = this.levels.get(level);
    if (!type || !target) return undefined;
    target.furniture.push(def);
    this.track(level, def, type);
    this.rebuild(level);
    const item = this.items.at(-1)!;
    // A desk put back (an undone delete, say) is its owner's desk again.
    const owner = type.desk && def.owner ? this.byId.get(def.owner) : undefined;
    if (owner) owner.desk = item.index;
    return item;
  }

  removeItem(item: Item): void {
    const level = this.levels.get(item.level)!;
    level.furniture.splice(level.furniture.indexOf(item.def), 1);
    this.retire(item);
    this.rebuild(item.level);
  }

  /** Move a piece of furniture. Anyone using it stops; it keeps its owner (a desk stays theirs). */
  moveItem(item: Item, to: Tile): void {
    this.stopUsing(item);
    item.def.p = to;
    this.rebuild(item.level);
  }

  /**
   * A level was edited in place (its rooms, furniture or doors: the map
   * editor's roads and moved buildings). Furniture that's gone is let go of,
   * furniture that's back (an undo) is picked up again, and the grid and
   * routes are rebuilt.
   */
  edited(level: string): void {
    const def = this.levels.get(level);
    if (!def) return;
    const present = new Set(def.furniture);
    const tracked = new Set<FurnitureDef>();
    for (const item of this.items) {
      if (item.level !== level) continue;
      if (present.has(item.def)) {
        item.gone = false;
        tracked.add(item.def);
      } else if (!item.gone) this.retire(item);
    }
    for (const f of def.furniture) {
      const type = CATALOG[f.t];
      if (type && !tracked.has(f)) this.track(level, f, type);
    }
    this.active = null;
    this.rebuild(level);
  }

  /** Lay a path from `from` straight down to the nearest pavement or road. */
  addPath(level: string, from: Tile): void {
    const target = this.levels.get(level);
    const grid = this.grids.get(level);
    if (!target || !grid) return;
    let length = 0;
    const isStreet = (y: number) => ['path', 'road'].includes(target.rooms[grid.roomAt(from[0], y)]?.floor ?? '');
    while (from[1] + length < grid.h && !isStreet(from[1] + length)) length++;
    if (length === 0) return;
    target.rooms.push({ id: `${level}-path-${from.join('-')}`, name: 'Path', rect: [from[0], from[1], 1, length], floor: 'path' });
    this.rebuild(level);
  }

  addPortal(portal: PortalDef): void {
    this.world.portals.push(portal);
    this.renav();
  }

  /**
   * Take a level away (a floor you added, being removed): its furniture goes,
   * so do the portals to it and its place in any company, and anyone on it
   * (or on their way to it) is back at `to`.
   */
  removeLevel(id: string, to: Place): void {
    if (!this.levels.has(id)) return;
    for (const item of this.items) if (item.level === id && !item.gone) this.retire(item);
    for (const p of this.people) {
      const bound = p.level === id || p.dest?.level === id || p.route.some((leg) => leg.level === id);
      if (!bound) continue;
      this.stop(p);
      if (p.level === id) {
        p.level = to.level;
        [p.x, p.y] = [p.px, p.py] = to.p;
      }
    }
    this.world.levels = this.world.levels.filter((l) => l.id !== id);
    this.world.portals = this.world.portals.filter((portal) => portal.a.level !== id && portal.b.level !== id);
    for (const company of this.world.companies) company.levels = company.levels.filter((l) => l !== id);
    this.levels.delete(id);
    this.grids.delete(id);
    this.active = null;
    this.renav();
    this.changed([id]);
  }

  addCompany(company: CompanyDef): void {
    this.world.companies.push(company);
    this.companies.set(company.id, company);
  }

  /** Someone new joins the world (a new hire), taking a home that's to let if there is one. They arrive from the spawn point. */
  hire(def: PersonDef): Person {
    const home = def.home ? undefined : this.housing.vacant()[0];
    if (home) def.home = home.level.id;
    this.world.people.push(def);
    const p = this.spawnPerson(def);
    if (home) this.housing.name(home, this.housing.nameFor([p]), p);
    this.changed(home ? [home.level.id] : []);
    return p;
  }

  /** Tell listeners that levels changed (a home renamed, someone moved). */
  touch(levels: string[]): void {
    this.changed(levels);
  }

  /** Family, staff, a crew or someone passing through joins the world. */
  addNpc(def: NpcDef): Person {
    if (roleOf({ ...def, npc: true }).saved) this.world.npcs.push(def);
    const p = this.spawnNpc(def);
    this.changed([]);
    return p;
  }

  /** Someone leaves the world for good (a crew heading home). */
  removePerson(id: string): void {
    const p = this.byId.get(id);
    if (!p) return;
    this.stop(p);
    this.people.splice(this.people.indexOf(p), 1);
    this.byId.delete(id);
    this.histories.delete(id);
    this.relationships.forget(id);
    const npc = this.world.npcs.findIndex((d) => d.id === id);
    if (npc >= 0) this.world.npcs.splice(npc, 1);
    this.changed([]);
  }

  /** Someone's definition in the world: a person on the team, or anyone else. */
  defOf(id: string): PersonDef | NpcDef | undefined {
    return this.world.people.find((d) => d.id === id) ?? this.world.npcs.find((d) => d.id === id);
  }

  /** Change someone, as they are now: their name, look, department or personality. (The design has its own copy: worlds/edit.ts.) */
  editPerson(p: Person, changes: PersonChanges): void {
    const def = this.defOf(p.id);
    if (!def) return;
    if (changes.name?.trim()) p.name = def.name = changes.name.trim();
    if (changes.look) p.look = def.look = [...changes.look];
    if (changes.dept !== undefined && 'company' in def) {
      p.dept = changes.dept || undefined;
      if (p.dept) def.dept = p.dept;
      else delete def.dept;
    }
    if (changes.preset && p.species === 'human') {
      // A new personality from scratch: the preset, without any tweaks the old one had.
      p.preset = def.preset = changes.preset;
      delete def.traits;
      p.traits = resolveTraits(p.preset);
      p.routine = dailyRoutine(p, p.traits, this.seedOf(p.id), p.shift);
    }
    const home = this.housing.homeOf(p.home);
    if (home && changes.name) this.housing.name(home, this.housing.nameFor(this.housing.residents(home)), this.housing.residents(home).find((q) => !q.npc));
    this.changed(home ? [home.level.id] : []);
  }

  /** `p` leaves town for good, with the family and pets they live with: off to the edge of town, and their home goes up to let. */
  leaveTown(p: Person): void {
    if (p.company) this.unemploy(p);
    const household = p.home ? this.people.filter((q) => q.npc && q !== p && q.home === p.home && q.role !== 'staff') : [];
    for (const q of [p, ...household]) this.depart(q);
    this.log(`👋 ${p.name}${household.length ? ` and ${household.length === 1 ? household[0]!.name : 'their household'}` : ''} left town`, [p.id, ...household.map((q) => q.id)]);
  }

  /** One person (or pet) moves out of town, leaving everyone else as they are. If it's the last person whose home it is, their family and pets go with them. */
  moveOut(p: Person): void {
    if (this.lastAtHome(p)) return this.leaveTown(p);
    this.depart(p);
    this.log(`👋 ${p.name} moved out of town`, [p.id]);
  }

  /** `p` no longer works anywhere. Their desk is freed. */
  unemploy(p: Person): void {
    const old = this.items[p.desk];
    if (old?.def.owner === p.id) delete old.def.owner;
    p.desk = -1;
    p.company = undefined;
    const def = this.world.people.find((d) => d.id === p.id);
    if (def) def.company = '';
    this.stop(p);
    this.changed([]);
  }

  /** Move `p` to `company`, with a free desk on `level` if there is one yet. */
  employ(p: Person, company: string, level?: string): void {
    const old = this.items[p.desk];
    if (old?.def.owner === p.id) delete old.def.owner;
    // Their own desk there if they have one (an office you arranged keeps its owners), otherwise a free one.
    const desks = level ? this.activeItems().filter((item) => item.level === level && item.type.desk) : [];
    const desk = desks.find((item) => item.def.owner === p.id) ?? desks.find((item) => !item.def.owner);
    if (desk) desk.def.owner = p.id;
    p.desk = desk?.index ?? -1;
    if (p.company !== company) p.hiredAt = this.tick;
    p.company = company;
    const def = this.world.people.find((d) => d.id === p.id);
    if (def) def.company = company;
    this.stop(p);
    this.changed([]);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Is `p` the last one living at home whose home it is (anyone on the team, or staff), with only family and pets besides? */
  lastAtHome(p: Person): boolean {
    const householder = (q: Person) => !q.npc || q.role === 'staff';
    return !!p.home && householder(p) && !this.people.some((q) => q !== p && q.home === p.home && !q.leaving && householder(q));
  }

  /** Off to the edge of town, for good. */
  private depart(p: Person): void {
    p.leaving = true;
    p.crawling = false;
    this.interactions.control(p, false);
    this.clearBrain(p.id);
    this.stop(p);
  }

  /** Off the edge of town: gone from the world, with anything that was theirs freed, and their home named for whoever's left. */
  private gone(p: Person): void {
    const home = this.housing.homeOf(p.home);
    for (const item of this.items) if (item.def.owner === p.id) delete item.def.owner;
    const def = this.world.people.findIndex((d) => d.id === p.id);
    if (def >= 0) this.world.people.splice(def, 1);
    this.removePerson(p.id);
    if (home) {
      const left = this.housing.residents(home);
      this.housing.name(home, this.housing.nameFor(left), left.find((q) => !q.npc));
      this.changed([home.level.id]);
    }
  }

  /** A place the story's building, as you arranged it last time (world.overrides), if it's the same layout. */
  private arranged(level: LevelDef): void {
    const override = this.world.overrides?.[level.id];
    if (!override || override.size[0] !== level.size[0] || override.size[1] !== level.size[1]) return;
    level.furniture = structuredClone(override.furniture);
    if (override.rooms) level.rooms = structuredClone(override.rooms);
    if (override.doors) level.doors = structuredClone(override.doors);
  }

  private register(level: LevelDef): void {
    this.levels.set(level.id, level);
    this.grids.set(level.id, new Grid(level));
    for (const def of level.furniture) {
      const type = CATALOG[def.t];
      if (type) this.track(level.id, def, type);
    }
  }

  private track(level: string, def: FurnitureDef, type: FurnitureType): void {
    this.items.push({ index: this.items.length, level, def, type, uses: 0 });
    this.occupied.push(type.spots.map(() => null));
    this.active = null;
  }

  private retire(item: Item): void {
    item.gone = true;
    this.active = null;
    this.stopUsing(item);
  }

  /** Everyone using a piece of furniture stops. */
  private stopUsing(item: Item): void {
    for (const id of this.usersOf(item.index)) {
      const user = this.byId.get(id);
      if (user) this.stop(user);
    }
  }

  /** Routes between levels, after the grids or the portals changed. */
  private renav(): void {
    this.nav = new Navigator(this.grids, this.world.portals);
  }

  /** Rebuild a level's grid after its furniture or rooms changed, nudging anyone now standing in something. */
  private rebuild(level: string): void {
    const def = this.levels.get(level)!;
    const grid = new Grid(def);
    this.grids.set(level, grid);
    for (const p of this.people) {
      if (p.level !== level || grid.walkable(Math.round(p.x), Math.round(p.y))) continue;
      this.stop(p);
      const free = this.randomWalkable(level);
      if (free) [p.x, p.y] = [p.px, p.py] = free.p;
    }
    this.renav();
    this.changed([level]);
  }

  private changed(levels: string[]): void {
    this.changes.emit(levels);
  }

  private seedOf(id: string): number {
    return hashOf(id, this.world.seed);
  }

  private spawnNpc(def: NpcDef): Person {
    const pet = def.species !== 'human';
    const preset = pet ? def.species : (def.preset ?? 'regular');
    const traits = pet ? PET_TRAITS : resolveTraits(def.preset, def.traits);
    const routine = dailyRoutine({ ...def, npc: true }, traits, this.seedOf(def.id), def.shift);
    return this.spawn({ ...def, home: def.home || undefined, npc: true, preset, traits, routine });
  }

  private spawnPerson(def: PersonDef): Person {
    const traits = resolveTraits(def.preset, def.traits);
    return this.spawn({
      ...def,
      species: 'human',
      npc: false,
      company: def.company === '' ? undefined : (def.company ?? this.world.companies[0]?.id),
      preset: def.preset ?? 'regular',
      traits,
      routine: dailyRoutine({ species: 'human', npc: false }, traits, this.seedOf(def.id), def.shift),
    });
  }

  private spawn(def: Spawn): Person {
    const desk = this.items.findIndex((item) => item.def.owner === def.id && item.type.desk);
    const start = (def.home && this.randomWalkable(def.home)) || this.world.spawn;
    const p: Person = {
      ...def,
      ideas: 0,
      lastTakeaway: -Infinity,
      lastOuting: -Infinity,
      lastServed: -Infinity,
      lastGaveUp: -Infinity,
      hiredAt: -Infinity,
      level: start.level,
      x: start.p[0],
      y: start.p[1],
      px: start.p[0],
      py: start.p[1],
      facing: 'down',
      // It's 06:00: most people are asleep and a little tired.
      needs: {
        energy: this.rng.range(0.3, 0.5),
        hunger: this.rng.range(0.5, 0.8),
        social: this.rng.range(0.5, 1),
        fun: this.rng.range(0.5, 1),
      },
      focus: 0,
      intent: null,
      phase: 'doing',
      timer: 0,
      route: [],
      dest: null,
      spot: null,
      gains: {},
      desk,
      hidden: !def.home,
      transit: 0,
      distracted: 0,
      talkingTo: null,
      status: {},
      stats: { work: 0, interruptions: 0, interrupted: 0, weekWork: 0, weekInterrupted: 0 },
    };
    this.byId.set(def.id, p);
    this.people.push(p);
    return p;
  }

  private brainOf(p: Person): Brain {
    const own = this.brains.get(p.id);
    if (own) return own;
    const kind = kindOf(p);
    const make = ROLES[kind].brain;
    if (!make) return this.personBrain;
    let brain = this.kindBrains.get(kind);
    if (!brain) {
      brain = make();
      this.kindBrains.set(kind, brain);
    }
    return brain;
  }

  /** People on screen within `radius` tiles of a point, excluding `except`. */
  near(level: string, x: number, y: number, radius: number, except?: Person): Person[] {
    return this.people.filter(
      (p) => p !== except && p.level === level && this.present(p) && (p.x - x) ** 2 + (p.y - y) ** 2 <= radius * radius,
    );
  }

  private isClaimed(place: Place, except?: Person): boolean {
    const [x, y] = place.p;
    return this.people.some(
      (p) =>
        p !== except &&
        this.present(p) &&
        ((p.dest?.level === place.level && p.dest.p[0] === x && p.dest.p[1] === y) ||
          (p.phase === 'doing' && p.level === place.level && Math.round(p.x) === x && Math.round(p.y) === y)),
    );
  }

  /** Drop whatever they're doing; they'll pick something new next tick. */
  private stop(p: Person): void {
    if (p.spot) this.occupied[p.spot.item]![p.spot.spot] = null;
    for (const other of this.people) if (other.talkingTo === p.id && other.intent?.kind !== 'chat') other.talkingTo = null;
    p.spot = null;
    p.intent = null;
    p.talkingTo = null;
    p.dest = null;
    p.route = [];
    p.gains = {};
  }

  private begin(p: Person, intent: Intent): void {
    p.intent = intent;
    const here = this.placeOf(p);
    const dest = rulesFor(intent).to(this, p, intent);
    const route = dest && this.nav.route(here, dest);
    if (!dest || !route) {
      // Nowhere to go: stand still briefly, then think again.
      this.stop(p);
      p.intent = { kind: 'wander', to: here };
      p.phase = 'doing';
      p.timer = 10;
      return;
    }
    // Mid-step? Finish the current tile first, so movement stays on the grid.
    if (here.p[0] !== p.x || here.p[1] !== p.y) route[0]!.tiles.unshift(here.p);
    p.dest = dest;
    p.route = route;
    p.phase = 'moving';
  }

  // ── For intents.ts ────────────────────────────────────────────────────────

  /** Claim the nearest free spot on a piece of furniture, and say where it is. */
  claim(p: Person, index: number): Place | null {
    const item = this.items[index];
    if (!item || item.gone) return null;
    const grid = this.grids.get(item.level)!;
    let best: { tile: Tile; spot: number; d: number } | null = null;
    for (let spot = 0; spot < item.type.spots.length; spot++) {
      const tile = this.spotTile(item, spot);
      if (this.occupied[index]![spot] !== null || !grid.walkable(tile[0], tile[1])) continue;
      const d = Math.abs(tile[0] - p.x) + Math.abs(tile[1] - p.y);
      if (!best || d < best.d) best = { tile, spot, d };
    }
    if (!best) return null;
    this.occupied[index]![best.spot] = p.id;
    p.spot = { item: index, spot: best.spot };
    return { level: item.level, p: best.tile };
  }

  /** Nearest free tile next to `target`. */
  beside(p: Person, target: Person): Place | null {
    const grid = this.grids.get(target.level)!;
    const tx = Math.round(target.x);
    const ty = Math.round(target.y);
    let best: Place | null = null;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const place: Place = { level: target.level, p: [tx + dx, ty + dy] };
        if ((dx === 0 && dy === 0) || !grid.walkable(tx + dx, ty + dy) || this.isClaimed(place, p)) continue;
        const d = p.level === target.level ? Math.abs(tx + dx - p.x) + Math.abs(ty + dy - p.y) : 0;
        if (d < bestD) [best, bestD] = [place, d];
      }
    }
    return best;
  }

  private move(p: Person): void {
    // Chasing a conversation partner: re-plan if they've moved on.
    if (p.intent?.kind === 'chat' && this.steps % 8 === 0) {
      const target = this.byId.get(p.intent.with);
      if (!target || !this.present(target) || asleep(target)) {
        this.stop(p);
        return;
      }
      const dest = p.dest;
      if (!dest || dest.level !== target.level || Math.abs(target.x - dest.p[0]) + Math.abs(target.y - dest.p[1]) > 2.5) {
        this.begin(p, p.intent);
        return;
      }
    }

    const leg = p.route[0];
    if (!leg) {
      this.arrive(p);
      return;
    }
    let budget = SPEED * (p.crawling ? CRAWL : 1);
    while (budget > 0 && leg.tiles.length > 0) {
      const [tx, ty] = leg.tiles[0]!;
      const dx = tx - p.x;
      const dy = ty - p.y;
      if (dx !== 0 || dy !== 0) faceTowards(p, tx, ty);
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= budget) {
        p.x = tx;
        p.y = ty;
        leg.tiles.shift();
        budget -= dist;
      } else {
        p.x += Math.sign(dx) * budget;
        p.y += Math.sign(dy) * budget;
        budget = 0;
      }
    }
    if (leg.tiles.length > 0) return;

    p.route.shift();
    const next = p.route[0];
    if (next) this.traverse(p, next.level);
    else this.arrive(p);
  }

  /** Step through the portal they're standing on, into `level`. */
  private traverse(p: Person, level: string): void {
    const at = (place: Place) => place.level === p.level && place.p[0] === p.x && place.p[1] === p.y;
    const portal = this.world.portals.find((pt) => (at(pt.a) && pt.b.level === level) || (at(pt.b) && pt.a.level === level));
    if (!portal) {
      this.stop(p);
      return;
    }
    const from = this.levels.get(p.level)!;
    const arrival = at(portal.a) ? portal.b : portal.a;
    p.level = level;
    p.x = p.px = arrival.p[0];
    p.y = p.py = arrival.p[1];
    p.transit = PORTAL_TICKS;

    const to = this.levels.get(level)!;
    if (p.role === 'child' && to.id === p.works) this.log(`${p.name} got to school 🎒`, [p.id]);
    if (to.kind === 'venue') this.love.arrived(p, to.id);
    if (to.kind === 'venue' && roleOf(p).customer) p.lastOuting = this.tick;
    if (p.npc) return;
    const company = this.companies.get(p.company ?? '');
    if (from.kind === 'outside' && company?.levels.includes(to.id)) this.log(`${p.name} arrived at ${company.name}`, [p.id]);
    if (to.id === p.home) this.log(`${p.name} got home`, [p.id]);
  }

  private arrive(p: Person): void {
    const intent = p.intent!;
    p.phase = 'doing';
    p.dest = null;
    p.route = [];
    rulesFor(intent).start(this, p, intent);
  }

  /** Someone has started using a piece of furniture. */
  used(p: Person, item: Item): void {
    item.uses++;
    this.uses.emit(p, item);
  }

  /** Carry on with what they're doing. Amounts are per tick of game time, scaled by the step. */
  private act(p: Person): void {
    const intent = p.intent!;
    const refill = (who: Person, need: Need, perTick: number) => restore(who.needs, need, perTick * this.dt);
    for (const [need, gain] of Object.entries(p.gains) as [Need, number][]) refill(p, need, gain);
    rulesFor(intent).doing?.(this, p, intent, refill);
    p.timer -= this.dt;
    if (p.timer <= 0 && intent.kind !== 'leave') this.stop(p);
  }

  /** Periodic check: wrong time of day, a crowd to escape, an ignored emergency. Returns true if they stopped. */
  private rethink(p: Person): boolean {
    const intent = p.intent;
    const { rethink } = roleOf(p);
    // Pets nap whenever they like and don't mind crowds. Riders, people on a fire drill and people you're steering stick to the plan.
    if (!intent || intent.kind === 'leave' || rethink === 'never' || p.muster || this.interactions.isControlled(p)) return false;
    // Crews down tools when the working day ends.
    if (rethink === 'offShift') {
      if (this.phaseOf(p) === 'work') return false;
      this.stop(p);
      return true;
    }

    const phase = this.phaseOf(p);
    const fits = phase === 'sleep' ? intent.kind === 'sleep' : intent.kind !== 'sleep' && rulesFor(intent).fits(this, p, intent, phase, this.areaOf(p, phase));
    if (!fits) {
      if (!p.npc && phase === 'home' && this.levels.get(p.level)?.kind === 'building') this.log(`${p.name} headed home`, [p.id]);
      this.stop(p);
      return true;
    }
    if (p.phase !== 'doing' || NO_INTERRUPT.has(intent.kind) || p.status.activity === 'focus') return false;

    const shyness = 1 - p.traits.social;
    if (shyness >= 0.6 && shyness * this.crowdAt(p.level, p.x, p.y, 2.5, p) > 1.6) {
      if (this.levels.get(p.level)?.kind !== 'home') this.log(`${p.name} slipped away from the crowd`, [p.id]);
      this.stop(p);
      return true;
    }
    if ((intent.kind === 'work' || intent.kind === 'hustle') && Math.min(...NEEDS.map((n) => p.needs[n])) < 0.12) {
      this.stop(p);
      return true;
    }
    // Someone they can't stand turns up: they leave them to it (at home, they put up with each other).
    if (intent.kind !== 'work' && this.levels.get(p.level)?.kind !== 'home') {
      const foe = this.near(p.level, p.x, p.y, AVOID_RADIUS, p).find((q) => q.species === 'human' && !asleep(q) && this.affinity(p, q) <= DISLIKE);
      if (foe) {
        this.social.grudge(p, foe, `${p.name} walked off when ${foe.name} turned up`);
        this.stop(p);
        return true;
      }
    }
    return false;
  }
}
