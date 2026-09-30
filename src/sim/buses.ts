// Buses (docs/TRAFFIC.md#buses): one route round town, calling at every bus
// stop in turn. A bus comes in by a road off the map, pulls up at each stop for
// a minute for people to get off and on, and leaves by another road. Every
// quarter of an hour at rush hour, hourly through the day, and a night bus every
// two hours. Anyone with a long walk through town may take it instead: they walk
// to the stop nearest them, wait (not for ever), ride hidden inside, get off at
// the stop nearest where they're going, and carry on. Some would rather walk.
import { TICKS_PER_HOUR, hourOf } from './clock.ts';
import { manhattan } from './geometry.ts';
import type { Leg } from './navigation.ts';
import type { Intent, Person } from './person.ts';
import { hashOf } from './rng.ts';
import { kindOf } from './roles.ts';
import type { Item, Simulation } from './sim.ts';
import type { RoadMap } from './roads.ts';
import type { Car, Way } from './traffic.ts';
import { OPPOSITE, headingOf, type Heading } from './movement.ts';
import type { Tile } from './world.ts';

/** Game minutes between buses: at rush hour, through the day, and through the night. */
const EVERY = { rush: 15, day: 60, night: 120 };
const RUSH: [from: number, to: number][] = [[7, 10], [16, 19]];
const DAY: [from: number, to: number] = [6, 23];
/** How long a bus stays at each stop (ticks), for people to get off and on. */
const DWELL = 10;
/** A walk through town at least this long (tiles) is worth the bus, if walking to and from the stops saves at least this share of it. */
const RIDE_FROM = 40;
const SAVES = 0.4;
/** Share of people who'd always rather walk, and the chance anyone fancies the walk this time. */
const WALKERS = 0.2;
const FANCY_A_WALK = 0.15;
/** How long someone waits at a stop (game minutes) before giving up and walking. */
const MOST_WAIT = 30;
/** Who takes the bus: grown-ups and children who live in town (not crews, couriers or visitors). */
const RIDERS = new Set(['employee', 'family', 'staff', 'child']);
/** What people go by bus for: getting somewhere (not chasing someone for a chat). */
const JOURNEYS = new Set<Intent['kind']>(['use', 'work', 'hustle', 'wander', 'play', 'sleep']);
const TICKS_PER_MINUTE = TICKS_PER_HOUR / 60;
/** Up to this many stops, every order is tried for the shortest route. */
const MOST_TO_TRY = 7;
/** Turning a bus right round in the road costs as much as driving this far (tiles): it goes round the block if it can. */
const TURN_ROUND = 200;
/** How a bus fits the roads: three tiles long (its body kept clear), loath to turn round, and never up on the pavement. */
const BUS_FIT = { reach: 1, turnRound: TURN_ROUND, roadsOnly: true };

interface Rider {
  id: string;
  /** The stop they're getting off at, and what they're off to do. */
  to: Item;
  after: Intent;
}

interface Service {
  car: Car;
  /** Which stop it's calling at next (or at now). */
  next: number;
  dwell: number;
  riders: Rider[];
  leaving: boolean;
}

/** The route: the stops in the order the bus calls at them, and the ways in and out; worked out for these stops on this road map. */
interface Route {
  stops: Item[];
  in: Way;
  out: Way;
  key: string;
  roads: RoadMap;
  /** The town's furniture it was worked out from (the same list till anything's added, moved or taken away). */
  items: readonly Item[];
}

export class Buses {
  readonly services: Service[] = [];
  /** How long (ticks) anyone waits at a stop before walking instead. */
  readonly patience = MOST_WAIT * TICKS_PER_MINUTE;
  private readonly sim: Simulation;
  private nextBus: number;
  private route: Route | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
    this.nextBus = departureAfter(sim.tick);
  }

  /** Every step: buses set off on time, call at their stops, and carry their riders along. */
  step(): void {
    const { sim } = this;
    if (sim.tick >= this.nextBus) {
      this.nextBus = departureAfter(sim.tick);
      this.depart();
    }
    for (const service of [...this.services]) {
      const { car } = service;
      // Riders go where the bus goes (so following one follows the bus).
      for (const rider of service.riders) {
        const p = sim.person(rider.id);
        if (p) [p.px, p.py, p.x, p.y] = [car.px, car.py, car.x, car.y];
      }
      if (car.removed) {
        // Off the map: anyone somehow still aboard gets off at the last stop.
        const last = this.plan()?.stops.at(-1);
        for (const rider of service.riders) if (last) this.alight(rider, last);
        this.services.splice(this.services.indexOf(service), 1);
        continue;
      }
      if (service.leaving || car.path.length > 0) continue;
      this.call(service);
    }
  }

  /**
   * Would `p` take the bus for this, rather than walk the route? If the walk
   * through town is long, the stops nearest either end cut it down a lot, the
   * bus goes that way round, and one's due soon enough: the journey, by bus.
   */
  consider(p: Person, intent: Intent, route: readonly Leg[]): Intent | null {
    const { sim } = this;
    if (!JOURNEYS.has(intent.kind) || p.species !== 'human' || !RIDERS.has(kindOf(p))) return null;
    const leg = route.find((l) => l.level === sim.traffic.level);
    if (!leg || leg.tiles.length < RIDE_FROM) return null;
    if ((hashOf(`walker:${p.id}`, sim.world.seed) >>> 0) % 100 < WALKERS * 100) return null;
    const plan = this.plan();
    if (!plan) return null;
    const [start, end] = [leg.tiles[0]!, leg.tiles.at(-1)!];
    const nearest = (t: Tile) => plan.stops.reduce((best, s) => (manhattan(this.waitAt(s), t) < manhattan(this.waitAt(best), t) ? s : best));
    const [from, to] = [nearest(start), nearest(end)];
    const [i, j] = [plan.stops.indexOf(from), plan.stops.indexOf(to)];
    if (i >= j) return null;
    const walk = manhattan(start, this.waitAt(from)) + manhattan(this.waitAt(to), end);
    if (walk > leg.tiles.length * (1 - SAVES) || !this.comingTo(i)) return null;
    if (sim.rng.next() < FANCY_A_WALK) return null;
    return { kind: 'bus', from: from.index, to: to.index, after: intent };
  }

  /** Where people wait for the bus at a stop: on the pavement in front of it. */
  waitAt(stop: Item): Tile {
    const [x, y] = stop.def.p;
    const bay = this.bayOf(stop);
    if (!bay) return [x + 1, y + 1];
    // A step from the shelter towards the road.
    return [x + 1 + Math.sign(bay[0] - (x + 1)), y + Math.sign(bay[1] - y)];
  }

  /** Is a bus coming to the stop `i`th on the route soon: one on its way that hasn't got there yet, or the next to set off? */
  private comingTo(i: number): boolean {
    const onTheWay = this.services.some((s) => !s.leaving && s.next <= i);
    return onTheWay || this.nextBus - this.sim.tick <= (MOST_WAIT / 2) * TICKS_PER_MINUTE;
  }

  /** A bus sets off: in by the way nearest the first stop, to its first call. */
  private depart(): void {
    const { sim } = this;
    const plan = this.plan();
    const roads = sim.traffic.roads();
    if (!plan || !roads) return;
    const first = this.bayOf(plan.stops[0]!)!;
    const drive = this.drive(roads, plan.in.edge, first, plan.in.heading, this.headingAt(plan.stops[0]!));
    if (!drive) return;
    const car = sim.traffic.add(0, plan.in.off, [plan.in.edge, ...drive]);
    car.facing = plan.in.heading;
    car.bus = true;
    this.services.push({ car, next: 0, dwell: 0, riders: [], leaving: false });
  }

  /** At a stop: people off, people on, and after a minute, on to the next (or away out of town after the last). */
  private call(service: Service): void {
    const { sim } = this;
    const plan = this.plan();
    if (!plan) return;
    const stop = plan.stops[service.next];
    if (!stop) return;
    if (service.dwell === 0) {
      for (const rider of service.riders.filter((r) => r.to === stop)) this.alight(rider, stop);
      service.riders = service.riders.filter((r) => r.to !== stop);
    }
    // Anyone waiting here for a stop further round gets on (latecomers too, while it's here).
    const later = new Set(plan.stops.slice(service.next + 1).map((s) => s.index));
    for (const p of sim.people) {
      const intent = p.intent;
      if (intent?.kind !== 'bus' || intent.from !== stop.index || !later.has(intent.to) || p.phase !== 'doing' || p.riding) continue;
      service.riders.push({ id: p.id, to: sim.items[intent.to]!, after: intent.after });
      sim.board(p, service.car.id);
    }
    service.dwell += sim.dt;
    if (service.dwell < DWELL) return;
    service.dwell = 0;
    service.next++;
    const roads = sim.traffic.roads();
    const here = this.bayOf(stop)!;
    const next = plan.stops[service.next];
    if (next && roads) {
      const bay = this.bayOf(next)!;
      service.car.path = this.drive(roads, here, bay, this.headingAt(stop), this.headingAt(next)) ?? [];
      if (service.car.path.length === 0) this.call(service);
      return;
    }
    service.leaving = true;
    service.car.through = true;
    service.car.path = [...((roads && this.drive(roads, here, plan.out.edge, this.headingAt(stop))) ?? []), plan.out.off];
  }

  private alight(rider: Rider, stop: Item): void {
    const p = this.sim.person(rider.id);
    if (p) this.sim.alight(p, { level: stop.level, p: this.waitAt(stop) }, rider.after);
  }

  /** A bus's drive from one tile to another, by road, setting off facing `heading` (and arriving facing `arrive`), its whole body clear if it can be. */
  private drive(roads: RoadMap, from: Tile, to: Tile, heading: Heading, arrive?: Heading): Tile[] | null {
    return roads.route(from, to, heading, { ...BUS_FIT, arrive }) ?? roads.route(from, to, heading, { ...BUS_FIT, reach: 0, arrive });
  }

  /** Which way a bus faces at a stop: we drive on the left, so with the shelter on its left. */
  private headingAt(stop: Item): Heading {
    const bay = this.bayOf(stop)!;
    const [dx, dy] = [Math.sign(bay[0] - (stop.def.p[0] + 1)), Math.sign(bay[1] - stop.def.p[1])];
    // Your left, going (ux, uy), is (uy, -ux); it points back at the shelter.
    return headingOf(dy, -dx, 'right');
  }

  /** The kerb lane a stop's bus pulls up in: the nearest road to the shelter. */
  private bayOf(stop: Item): Tile | null {
    const roads = this.sim.traffic.roads();
    if (!roads) return null;
    const [x, y] = [stop.def.p[0] + 1, stop.def.p[1]];
    for (let r = 1; r <= 3; r++) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const [tx, ty] = [x + dx * r, y + dy * r];
        if (roads.drivable(tx, ty) && roads.floorAt(tx, ty) === 'road') return [tx, ty];
      }
    }
    return null;
  }

  /**
   * The route, worked out once for the town as it is: every bus stop in town,
   * in the order that makes the shortest drive (by road, setting off each stop
   * the way the bus faces there, so dead ends and turning round count), in by
   * whichever road off the map makes that shortest, and out by another.
   */
  plan(): Route | null {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const town = sim.traffic.level;
    const items = sim.activeItems();
    if (this.route?.items === items && this.route.roads === roads) return this.route;
    const stops = items.filter((i) => i.def.t === 'busStop' && i.level === town && this.bayOf(i));
    const key = stops.map((s) => s.def.p.join()).join(';');
    if (this.route?.key === key && this.route.roads === roads) {
      this.route.items = items;
      return this.route;
    }
    this.route = null;
    if (!roads || stops.length < 2) return null;
    const ins = sim.traffic.ways('in');
    const outs = sim.traffic.ways('out');
    if (!ins.length || !outs.length) return null;
    const bays = stops.map((s) => this.bayOf(s)!);
    const headings = stops.map((s) => this.headingAt(s));
    const length = (from: Tile, to: Tile, heading: Heading, arrive?: Heading) => {
      const path = this.drive(roads, from, to, heading, arrive);
      return path ? path.length + turnsRound([from, ...path], heading) * TURN_ROUND : Infinity;
    };
    // How far by road from each stop to each other, setting off the way it faces there.
    const drive = bays.map((a, i) => bays.map((b, j) => (i === j ? 0 : length(a, b, headings[i]!, headings[j]))));
    // The best way in to each stop, and out from each.
    const shortest = (ways: Way[], drive: (way: Way) => number) => ways.map((way) => ({ way, length: drive(way) })).reduce((a, b) => (b.length < a.length ? b : a));
    const into = bays.map((bay, i) => shortest(ins, (way) => length(way.edge, bay, way.heading, headings[i])));
    const outOf = bays.map((bay, i) => shortest(outs, (way) => length(bay, way.edge, headings[i]!)));
    const lengthOf = (order: number[]) => into[order[0]!]!.length + order.slice(1).reduce((sum, j, k) => sum + drive[order[k]!]![j]!, 0) + outOf[order.at(-1)!]!.length;
    // Every order, for a handful of stops; beyond that, nearest next, from each start.
    const orders = stops.length <= MOST_TO_TRY ? permutations(stops.map((_, i) => i)) : stops.map((_, i) => nearestNext(i, drive));
    let best: { order: number[]; length: number } = { order: [], length: Infinity };
    for (const order of orders) {
      const length = lengthOf(order);
      if (length < best.length) best = { order, length };
    }
    if (best.length === Infinity) return null;
    const ordered = best.order.map((i) => stops[i]!);
    this.route = { stops: ordered, in: into[best.order[0]!]!.way, out: outOf[best.order.at(-1)!]!.way, key, roads, items };
    return this.route;
  }
}

/** The tick of the next bus to set off after `tick`, by the timetable. */
export function departureAfter(tick: number): number {
  const now = Math.floor(hourOf(tick) * 60);
  for (let m = now + 1; m <= now + 24 * 60; m++) {
    const hour = Math.floor(m / 60) % 24;
    const minute = m % 60;
    const rush = RUSH.some(([a, b]) => hour >= a && hour < b);
    const day = hour >= DAY[0] && hour < DAY[1];
    const due = rush ? minute % EVERY.rush === 0 : day ? minute % EVERY.day === 0 : minute === 0 && ((hour - DAY[1] + 24) % 24) % (EVERY.night / 60) === 0;
    if (due) return tick + (m - now) * TICKS_PER_MINUTE - ((hourOf(tick) * 60) % 1) * TICKS_PER_MINUTE;
  }
  return tick + 24 * TICKS_PER_HOUR;
}

/** How many times a drive turns right round (heads back the way it came within a few tiles). */
function turnsRound(path: readonly Tile[], start: Heading): number {
  let turns = 0;
  let before: Heading | undefined;
  let last: Heading | undefined = start;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!];
    const heading = headingOf(b[0] - a[0], b[1] - a[1], last ?? 'right');
    if (heading === last) continue;
    if (before && OPPOSITE[before] === heading) turns++;
    [before, last] = [last, heading];
  }
  return turns;
}

/** An order of stops: from `start`, always on to the nearest not yet called at. */
function nearestNext(start: number, drive: number[][]): number[] {
  const order = [start];
  const left = new Set(drive.map((_, i) => i).filter((i) => i !== start));
  while (left.size) {
    const from = order.at(-1)!;
    const next = [...left].reduce((a, b) => (drive[from]![b]! < drive[from]![a]! ? b : a));
    order.push(next);
    left.delete(next);
  }
  return order;
}

function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (const [i, first] of items.entries()) for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [first, ...rest];
}
