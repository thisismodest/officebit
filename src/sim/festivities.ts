// Festivities (docs/TIME.md#holidays): what the town does on the days in
// holidays.ts. A crew puts the Christmas tree up on the Green for December
// and takes it down after Twelfth Night; homes and offices put their own up
// (someone who's there does it), and builds a bonfire there for
// Bonfire Night (nothing appears out of thin air); presents and dinner on
// Christmas Day; the office party; staying up for New Year; trick-or-treating
// at Halloween; a prank or two on April Fools' Day. Fireworks are drawn by
// the renderer, from the clock alone.
import { TICKS_PER_HOUR, hourOf } from './clock.ts';
import { footprint, overlap } from './geometry.ts';
import { festive, partyDay } from './holidays.ts';
import type { Person } from './person.ts';
import { outsideDoor } from './places.ts';
import type { Item, Simulation } from './sim.ts';
import type { DayPhase } from './schedule.ts';
import type { Place, Tile } from './world.ts';

/** Where on the Green the tree and the bonfire go (they take the nearest clear grass). */
const TREE_NEAR: Tile = [49, 37];
const BONFIRE_NEAR: Tile = [61, 44];
/** Crew-hours to put up, and to take down. */
const PUT_UP_HOURS = 2;
const TAKE_DOWN_HOURS = 1;
/** Bonfire Night: out on the Green from dusk; Halloween: trick-or-treating after school. */
const BONFIRE_EVENING: [from: number, to: number] = [17.5, 23];
const TRICK_OR_TREAT: [from: number, to: number] = [17.5, 19.5];
/** The office party starts at three. */
const PARTY_FROM = 15;
/** New Year: out on the Green to see the fireworks at midnight, from this late on New Year's Eve to this early on New Year's Day. */
const NEW_YEAR_OUT: [from: number, to: number] = [23.25, 0.6];
/** How far from the middle of the Green (tiles) people stand to watch. */
const WATCH_RADIUS = 6;
/** Staying up: till the fireworks on New Year's Eve, a bit later on Midsummer. */
const NEW_YEAR_UNTIL = 0.75;
const MIDSUMMER_UNTIL = 0.5;
/** Christmas Day: presents in the morning, dinner at one. */
const PRESENTS_AT = 9;
const DINNER_AT = 13;

export class Festivities {
  private readonly sim: Simulation;
  /** The story began with the town as it already was (the tree up, if it's Christmas). */
  private settled = false;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Called every step, cheaply: the first time, the town is set as it would already be (at Christmas, the trees up). */
  step(): void {
    if (this.settled) return;
    this.settled = true;
    if (!festive(this.sim.dateOf())) return;
    if (!this.find('christmasTree')) {
      const at = this.spot(TREE_NEAR);
      if (at) this.sim.addItem(this.outside(), { t: 'christmasTree', p: at });
    }
    for (const level of this.decorated()) this.putUpTree(level);
  }

  /** Called once an hour. */
  hourly(): void {
    const { sim } = this;
    const date = sim.dateOf();
    const hour = Math.round(hourOf(sim.tick));
    this.keep('christmasTree', TREE_NEAR, festive(date), 'the Christmas tree', [
      ['🎄 The council crew is putting the Christmas tree up on the Green', '🎄 The Christmas tree is up on the Green'],
      ['🎄 The council crew is taking the Christmas tree down', '🎄 The Christmas tree came down for another year'],
    ]);
    this.keep('bonfire', BONFIRE_NEAR, date.month === 11 && date.day === 5, 'the bonfire', [
      ['🔥 A crew is building a bonfire on the Green for tonight', '🔥 The bonfire on the Green is ready for tonight'],
      ['🔥 A crew is clearing up after the bonfire', '🔥 The Green is tidy again after Bonfire Night'],
    ]);
    this.decorate(festive(date), hour);
    const holiday = sim.holiday()?.id;
    if (holiday === 'christmas' && hour === PRESENTS_AT) this.everyHome('🎁 Presents at', { fun: 0.4, social: 0.2 });
    if (holiday === 'christmas' && hour === DINNER_AT) this.everyHome('🍗 Christmas dinner at', { hunger: 1, social: 0.3 });
    if (partyDay(date) && hour === PARTY_FROM) {
      for (const company of this.offices()) sim.log(`🎉 The ${company.name} Christmas party is under way`, []);
    }
    if (holiday === 'bonfireNight' && hour === 19) sim.log('🎆 Fireworks over the Green', []);
    if (holiday === 'newYearsDay' && hour === 0) sim.log('🎆 Happy New Year! Fireworks over the town', []);
    if (holiday === 'halloween' && hour === 18) sim.log('🎃 Children are out trick-or-treating', []);
    if (holiday === 'aprilFools' && hour === 11) this.prank();
  }

  /** At the office party: no work for anyone at an office, just drinks and chat. */
  partying(p: Person): boolean {
    const { sim } = this;
    if (hourOf(sim.tick) < PARTY_FROM || !partyDay(sim.dateOf())) return false;
    return this.offices().some((c) => c.id === p.company);
  }

  /** Out and about in town, beyond home: everyone on Bonfire Night; grown-ups for the New Year fireworks; children trick-or-treating at Halloween. */
  outAndAbout(p: Person, phase: DayPhase): boolean {
    if (phase !== 'home' || p.species !== 'human' || !p.home) return false;
    const hour = hourOf(this.sim.tick);
    const holiday = this.sim.holiday()?.id;
    if (holiday === 'bonfireNight') return hour >= BONFIRE_EVENING[0] && hour < BONFIRE_EVENING[1];
    if (this.newYearOut()) return p.role !== 'child';
    return holiday === 'halloween' && p.role === 'child' && this.trickOrTreating();
  }

  /** Halloween, after school: time to go door to door. */
  trickOrTreating(): boolean {
    const hour = hourOf(this.sim.tick);
    return this.sim.holiday()?.id === 'halloween' && hour >= TRICK_OR_TREAT[0] && hour < TRICK_OR_TREAT[1];
  }

  /** A door to knock on: the front of someone else's house. */
  doorToKnock(p: Person): Place | null {
    const { sim } = this;
    const homes = sim.housing.homes().filter((h) => h.level.id !== p.home && sim.housing.residents(h).length > 0);
    const home = homes[sim.rng.int(0, homes.length - 1)];
    return home ? outsideDoor(sim, new Set(sim.floorsOf(home.level.id))) : null;
  }

  /** New Year's Eve and Midsummer: grown-ups stay up late. */
  upLate(p: Person): boolean {
    if (p.species !== 'human' || p.role === 'child') return false;
    const { sim } = this;
    const hour = hourOf(sim.tick);
    const today = sim.holiday()?.id;
    if (today === 'newYearsEve' || today === 'midsummer') return hour >= 18;
    if (today === 'newYearsDay') return hour < NEW_YEAR_UNTIL;
    const yesterday = sim.holiday(sim.tick - 12 * TICKS_PER_HOUR)?.id;
    return yesterday === 'midsummer' && hour < MIDSUMMER_UNTIL;
  }

  /** Midnight at New Year: time to be on the Green for the fireworks. */
  newYearOut(): boolean {
    const hour = hourOf(this.sim.tick);
    const holiday = this.sim.holiday()?.id;
    return (holiday === 'newYearsEve' && hour >= NEW_YEAR_OUT[0]) || (holiday === 'newYearsDay' && hour < NEW_YEAR_OUT[1]);
  }

  /** Somewhere on the Green to stand and watch the fireworks, near the tree. */
  watchFrom(): Place | null {
    const { sim } = this;
    const outside = this.outside();
    const grid = sim.grids.get(outside);
    const tree = this.find('christmasTree')?.def.p ?? TREE_NEAR;
    if (!grid) return null;
    for (let tries = 0; tries < 20; tries++) {
      const x = tree[0] + sim.rng.int(-WATCH_RADIUS, WATCH_RADIUS);
      const y = tree[1] + sim.rng.int(-2, WATCH_RADIUS);
      // A spot of their own: not where someone's already standing, or heading.
      if (grid.free(x, y) && !sim.isClaimed({ level: outside, p: [x, y] })) return { level: outside, p: [x, y] };
    }
    return null;
  }

  /** New Year's Eve: a night out. */
  nightOut(): boolean {
    return this.sim.holiday()?.id === 'newYearsEve' && hourOf(this.sim.tick) >= 19;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Homes and offices put their own tree up in December, when someone's there to do it, and take it down in January. */
  private decorate(wanted: boolean, hour: number): void {
    const { sim } = this;
    for (const level of this.decorated()) {
      const tree = sim.activeItems().find((i) => i.def.t === 'homeTree' && sim.floorsOf(level).includes(i.level));
      if (wanted === !!tree) continue;
      const home = sim.levels.get(level)?.kind === 'home';
      // Evenings at home; working hours at the office.
      if (home ? hour < 17 || hour > 21 : sim.dayOff() || hour < 9 || hour > 16) continue;
      const who = sim.people.find((p) => p.species === 'human' && p.role !== 'child' && sim.floorsOf(level).includes(p.level) && p.intent?.kind !== 'sleep');
      if (!who) continue;
      const place = sim.levels.get(level)?.name ?? 'home';
      if (tree) {
        sim.removeItem(tree);
        sim.log(`🎄 ${who.name} took the Christmas tree down at ${place}`, [who.id]);
      } else if (this.putUpTree(level)) {
        sim.log(`🎄 ${who.name} put the Christmas tree up at ${place}`, [who.id]);
      }
    }
  }

  /** Homes with someone living there, and offices: where a tree goes up. */
  private decorated(): string[] {
    const { sim } = this;
    const homes = sim.housing.homes().filter((h) => sim.housing.residents(h).length > 0).map((h) => h.level.id);
    const offices = this.offices().map((c) => c.levels[0]!).filter(Boolean);
    return [...homes, ...offices];
  }

  /** A tree against a wall, by the sofa if there is one, where nobody needs to walk or sit. */
  private putUpTree(level: string): boolean {
    const { sim } = this;
    const def = sim.levels.get(level);
    const grid = sim.grids.get(level);
    if (!def || !grid) return false;
    // Clear of furniture, where people stand to use it, doorways and the stairs.
    const taken = new Set<string>();
    for (const item of sim.activeItems()) {
      if (item.level !== level) continue;
      const [x, y, w, h] = footprint(item.def);
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) taken.add(`${i},${j}`);
      for (let s = 0; s < item.type.spots.length; s++) taken.add(sim.spotTile(item, s).join(','));
    }
    for (const [x, y] of def.doors) for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) taken.add(`${i},${j}`);
    for (const end of sim.world.portals.flatMap((p) => [p.a, p.b]).filter((e) => e.level === level)) {
      for (let j = end.p[1] - 1; j <= end.p[1] + 1; j++) for (let i = end.p[0] - 1; i <= end.p[0] + 1; i++) taken.add(`${i},${j}`);
    }
    const sofa = sim.activeItems().find((i) => i.level === level && (i.def.t === 'sofa' || i.def.t === 'tv'))?.def.p ?? [def.size[0] / 2, def.size[1] / 2];
    const options: Tile[] = [];
    for (let y = 1; y < def.size[1] - 1; y++) {
      for (let x = 1; x < def.size[0] - 1; x++) if (grid.walkable(x, y) && !taken.has(`${x},${y}`)) options.push([x, y]);
    }
    // In the sitting room, against a wall if it can be, near the sofa.
    const room = grid.roomAt(Math.round(sofa[0]), Math.round(sofa[1]));
    const against = (t: Tile) => (grid.wall[grid.i(t[0], t[1] - 1)] ? 0 : 6);
    const elsewhere = (t: Tile) => (grid.roomAt(t[0], t[1]) === room ? 0 : 30);
    const score = (t: Tile) => elsewhere(t) + against(t) + Math.hypot(t[0] - sofa[0], t[1] - sofa[1]);
    options.sort((a, b) => score(a) - score(b));
    const at = options[0];
    if (!at) return false;
    sim.addItem(level, { t: 'homeTree', p: at });
    return true;
  }

  /** Keep something up while it's wanted: a crew puts it up, and later takes it down. */
  private keep(t: string, near: Tile, wanted: boolean, label: string, news: [[string, string], [string, string]]): void {
    const { sim } = this;
    if (sim.construction.jobs.some((job) => job.label === label && !job.finished)) return;
    const there = this.find(t);
    const outside = this.outside();
    if (wanted && !there) {
      const at = this.spot(near);
      if (!at) return;
      sim.construction.start({ label, level: outside, siteType: 'siteTiny', at, building: { t, p: at }, door: [at[0], at[1] + 2], hours: PUT_UP_HOURS, news: news[0], onDone: () => {} });
    } else if (!wanted && there) {
      const at = there.def.p;
      sim.construction.start({ label, clears: there, siteType: 'siteTiny', at, door: [at[0], at[1] + 2], hours: TAKE_DOWN_HOURS, news: news[1], onDone: () => {} });
    }
  }

  private find(t: string): Item | undefined {
    return this.sim.activeItems().find((item) => item.def.t === t);
  }

  private outside(): string {
    return this.sim.traffic.level ?? this.sim.world.spawn.level;
  }

  /** The nearest clear 2×2 of grass on the Green (clear of furniture and paths, with a tile to walk round it). */
  private spot(near: Tile): Tile | null {
    const { sim } = this;
    const level = sim.levels.get(this.outside());
    const green = level?.rooms.find((r) => r.id === 'green');
    const grid = sim.grids.get(this.outside());
    if (!level || !grid) return null;
    // A town without a Green: around the middle of the map.
    const [gx, gy, gw, gh] = green?.rect ?? [Math.floor(level.size[0] / 2) - 10, Math.floor(level.size[1] / 2) - 6, 20, 12];
    const grass = (x: number, y: number) => level.rooms[grid.roomAt(x, y)]?.floor === 'grass';
    const clear = (x: number, y: number) =>
      grass(x, y) && grass(x + 1, y) && grass(x, y + 1) && grass(x + 1, y + 1) && !level.furniture.some((f) => overlap(footprint(f), [x - 1, y - 1, 4, 4]));
    const nearest = (rect: [number, number, number, number]): Tile | null => {
      const [rx, ry, rw, rh] = rect;
      const options: Tile[] = [];
      for (let y = Math.max(1, ry); y < Math.min(level.size[1] - 2, ry + rh - 1); y++) {
        for (let x = Math.max(1, rx); x < Math.min(level.size[0] - 2, rx + rw - 1); x++) if (clear(x, y)) options.push([x, y]);
      }
      options.sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1]));
      return options[0] ?? null;
    };
    // On the Green if there's room; if it's all taken, the nearest grass beyond it.
    return nearest([gx + 1, gy + 1, gw - 2, gh - 2]) ?? nearest([gx - 20, gy - 20, gw + 40, gh + 40]);
  }

  /** Every home with someone in it right now: a line in the News, and a lift for those there. */
  private everyHome(line: string, lift: Partial<Record<'fun' | 'social' | 'hunger', number>>): void {
    const { sim } = this;
    for (const home of sim.housing.homes()) {
      const here = sim.people.filter((p) => p.home === home.level.id && sim.floorsOf(home.level.id).includes(p.level) && p.intent?.kind !== 'sleep');
      if (here.length === 0) continue;
      for (const p of here) for (const [need, amount] of Object.entries(lift)) p.needs[need as 'fun'] = Math.min(1, p.needs[need as 'fun'] + amount!);
      sim.log(`${line} ${home.level.name}`, here.map((p) => p.id));
    }
  }

  /** Companies with offices (not the shop, the diner or the school, which stay open). */
  private offices() {
    return [...this.sim.companies.values()].filter((c) => c.levels.some((l) => this.sim.levels.get(l)?.kind === 'building'));
  }

  /** The most chaotic person at work pulls a prank on someone nearby. */
  private prank(): void {
    const { sim } = this;
    const atWork = sim.people.filter((p) => !p.npc && p.company && sim.companies.get(p.company)?.levels.includes(p.level));
    const joker = [...atWork].sort((a, b) => b.traits.chaos - a.traits.chaos)[0];
    const victim = joker && atWork.find((q) => q !== joker && q.level === joker.level);
    if (!joker || !victim || joker.traits.chaos < 0.4) return;
    const pranks = ['swapped the sugar for salt', 'taped over the mouse sensor on', 'wrapped the desk of', 'put googly eyes on everything belonging to'];
    sim.log(`🃏 ${joker.name} ${pranks[sim.rng.int(0, pranks.length - 1)]} ${victim.name}: April Fools!`, [joker.id, victim.id]);
    joker.needs.fun = Math.min(1, joker.needs.fun + 0.3);
  }
}
