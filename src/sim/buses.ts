// Buses (docs/TRAFFIC.md#buses): one route round town, calling at every bus
// stop in turn, run both ways. A bus comes in by a road off the map, pulls up at
// each stop for anyone getting off or on, and leaves by another road. One each
// way every hour through the day (a round takes two), and a night bus every two
// hours. Anyone with a long walk through town may take it instead: they walk
// to the stop nearest them, wait (not for ever), ride hidden inside, get off at
// the stop nearest where they're going, and carry on. Some would rather walk.
import { TICKS_PER_HOUR, hourOf } from "./clock.ts";
import { manhattan } from "./geometry.ts";
import type { Leg } from "./navigation.ts";
import { faceTowards, type Intent, type Person } from "./person.ts";
import { hashOf } from "./rng.ts";
import { kindOf } from "./roles.ts";
import type { Item, Simulation } from "./sim.ts";
import type { Drive, Goal } from "./roads.ts";
import type { Car, Way } from "./traffic.ts";
import { MOVERS, OPPOSITE, headingOf, type Heading } from "./movement.ts";
import type { Place, Tile } from "./world.ts";

/** Game minutes between buses: at rush hour, through the day, and through the night. */
const EVERY = { rush: 60, day: 60, night: 120 };
const RUSH: [from: number, to: number][] = [
  [7, 10],
  [16, 19]
];
const DAY: [from: number, to: number] = [6, 23];
/** How long a bus stays at a stop where people are getting off or on (ticks: half a minute). From an empty stop it pulls straight away. */
const DWELL = 5;
/**
 * A walk through town at least this long (tiles) is worth the bus, if the walks
 * to and from the stops save at least this share of it, and going by bus
 * (walking, riding, the stops on the way) saves this share of the time; the
 * less diligent put up with a slower ride, by up to this many times the walk for the laziest.
 */
const RIDE_FROM = 40;
const SAVES = 0.4;
const LAZY = 2;
/** Share of people who'd always rather walk, and the chance anyone fancies the walk this time. */
const WALKERS = 0.2;
const FANCY_A_WALK = 0.15;
/** How long someone waits at a stop (game minutes) before giving up and walking. */
const MOST_WAIT = 30;
/** Who takes the bus: grown-ups and children who live in town (not crews, couriers or visitors). */
const RIDERS = new Set(["employee", "family", "staff", "child", "resident"]);
/** What people go by bus for: getting somewhere (not chasing someone for a chat). */
const JOURNEYS = new Set<Intent["kind"]>(["use", "work", "hustle", "wander", "play", "sleep"]);
const TICKS_PER_MINUTE = TICKS_PER_HOUR / 60;
/** Up to this many stops, every order is tried for the shortest route. */
const MOST_TO_TRY = 8;

interface Rider {
  id: string;
  /** The stop they're getting off at, and what they're off to do. */
  to: Item;
  after: Intent;
}

interface Service {
  car: Car;
  /** Which way round it's going (`runs[run]` of the route), and that run as it was when it set off: it sees it through, whatever changes. */
  run: number;
  route: Run;
  /** Which stop it's calling at next (or at now). */
  next: number;
  dwell: number;
  /** Someone's got off or on at this stop: it waits a little. */
  busy: boolean;
  riders: Rider[];
  leaving: boolean;
}

/** One way round: the stops in the order the bus calls at them, the ways in and out, and the drives between. */
interface Run {
  stops: Item[];
  /** Which side of the road the bus pulls up at each stop, going this way round. */
  sides: Side[];
  in: Way;
  out: Way;
  /** Each bus's drive, worked out once: `legs[0]` in to the first stop, `legs[i]` on from the stop before to stop `i`, and the last out of town. */
  legs: Tile[][];
}

/**
 * Where a bus pulls up at a stop: in the lane beside the shelter, facing along
 * the kerb with the shelter on its left (we drive on the left); or going the
 * other way, across the road in the other lane, with its riders waiting on the
 * far pavement. Where they wait, and whether it's by the shelter (its bench).
 */
interface Side {
  bay: Tile;
  heading: Heading;
  wait: Tile;
  shelter: boolean;
}

/** The route, both ways round (the stops in one order, then the other), worked out for these stops on this road map. */
interface Route {
  runs: [Run, Run];
  key: string;
  roads: ReturnType<Simulation["traffic"]["roads"]>;
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
        const last = service.route.stops.at(-1);
        for (const rider of service.riders) if (last) this.alight(rider, last, service);
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
    if (!JOURNEYS.has(intent.kind) || p.species !== "human" || !RIDERS.has(kindOf(p))) return null;
    const leg = route.find((l) => l.level === sim.traffic.level);
    if (!leg || leg.tiles.length < RIDE_FROM) return null;
    if ((hashOf(`walker:${p.id}`, sim.world.seed) >>> 0) % 100 < WALKERS * 100) return null;
    const plan = this.plan();
    if (!plan) return null;
    const [start, end] = [leg.tiles[0]!, leg.tiles.at(-1)!];
    const stops = plan.runs[0].stops;
    const nearest = (t: Tile) => stops.reduce((best, s) => (manhattan(this.waitAt(s), t) < manhattan(this.waitAt(best), t) ? s : best));
    const [from, to] = [nearest(start), nearest(end)];
    if (from === to) return null;
    // Whichever way round goes from one to the other.
    const run = plan.runs[0].stops.indexOf(from) < plan.runs[0].stops.indexOf(to) ? 0 : 1;
    const { stops: order, legs } = plan.runs[run]!;
    const [i, j] = [order.indexOf(from), order.indexOf(to)];
    // Far less walking, and (for all but the lazy) quicker: how long by bus (ticks), the walks either end, the ride and
    // a minute at each stop on the way, against walking it all.
    const walk = manhattan(start, this.waitAt(from, run)) + manhattan(this.waitAt(to, run), end);
    if (walk > leg.tiles.length * (1 - SAVES)) return null;
    const ride = legs.slice(i + 1, j + 1).reduce((sum, l) => sum + l.length, 0) / MOVERS.bus.speed + (j - i - 1) * DWELL;
    const putUpWith = 1 - SAVES + LAZY * (1 - p.traits.diligence);
    if (walk / MOVERS.walker.speed + ride > (leg.tiles.length / MOVERS.walker.speed) * putUpWith || !this.comingTo(run, i)) return null;
    if (sim.rng.next() < FANCY_A_WALK) return null;
    return { kind: "bus", from: from.index, to: to.index, run, after: intent };
  }

  /** Where people wait at a stop for the bus going one way round (by the shelter, unless it pulls up across the road). */
  waitAt(stop: Item, run = 0): Tile {
    return this.sideOf(stop, run)?.wait ?? [stop.def.p[0] + 1, stop.def.p[1] + 1];
  }

  /** Where someone waiting for a bus goes: the shelter's bench if there's room and it pulls up this side, otherwise the kerb. */
  waitingPlace(p: Person, intent: Extract<Intent, { kind: "bus" }>): Place {
    const stop = this.sim.items[intent.from]!;
    const seat = this.sideOf(stop, intent.run)?.shelter ? this.sim.claim(p, intent.from) : null;
    return seat ?? { level: stop.level, p: this.waitAt(stop, intent.run) };
  }

  /** Waiting: looking out for the bus, towards where it pulls up. */
  lookOut(p: Person, intent: Extract<Intent, { kind: "bus" }>): void {
    const side = this.sideOf(this.sim.items[intent.from]!, intent.run);
    if (side) faceTowards(p, ...side.bay);
  }

  /** The side of the road the bus going one way round pulls up at a stop. */
  private sideOf(stop: Item, run: number): Side | undefined {
    const plan = this.plan()?.runs[run];
    const i = plan?.stops.indexOf(stop) ?? -1;
    return i >= 0 ? plan!.sides[i] : this.sidesOf(stop)[0];
  }

  /** A stop's sides: by the shelter, and (on a road wide enough for a lane each way) across the road. */
  private sidesOf(stop: Item): Side[] {
    const roads = this.sim.traffic.roads();
    const bay = this.bayOf(stop);
    if (!roads || !bay) return [];
    const [x, y] = [stop.def.p[0] + 1, stop.def.p[1]];
    // Away from the shelter, across the road.
    const [dx, dy] = [Math.sign(bay[0] - x), Math.sign(bay[1] - y)];
    const heading = this.headingAt(stop);
    const near: Side = { bay, heading, wait: [x + dx, y + dy], shelter: true };
    const far: Tile = [bay[0] + dx, bay[1] + dy];
    if (roads.floorAt(...far) !== "road") return [near];
    for (let r = 1; r <= 2; r++) {
      const wait: Tile = [far[0] + dx * r, far[1] + dy * r];
      if (roads.floorAt(...wait) === "path") return [near, { bay: far, heading: OPPOSITE[heading], wait, shelter: false }];
    }
    return [near];
  }

  /** Is a bus coming to the stop `i`th on a run soon: one on its way that hasn't got there yet, or the next to set off? */
  private comingTo(run: number, i: number): boolean {
    const onTheWay = this.services.some((s) => s.run === run && !s.leaving && s.next <= i);
    return onTheWay || this.nextBus - this.sim.tick <= (MOST_WAIT / 2) * TICKS_PER_MINUTE;
  }

  /** A bus sets off each way: in by the way nearest its first stop, to its first call. */
  private depart(): void {
    const { sim } = this;
    const plan = this.plan();
    if (!plan || !sim.traffic.roads()) return;
    for (const [run, route] of plan.runs.entries()) {
      const { legs, in: way } = route;
      const drive = legs[0];
      if (!drive?.length) continue;
      const car = sim.traffic.add(0, way.off, [way.edge, ...drive]);
      car.facing = way.heading;
      car.bus = true;
      this.services.push({ car, run, route, next: 0, dwell: 0, busy: false, riders: [], leaving: false });
    }
  }

  /** At a stop: people off, people on, and after half a minute (straight away, if nobody did), on to the next (or away out of town after the last). */
  private call(service: Service): void {
    const { sim } = this;
    const { route } = service;
    const stop = route.stops[service.next];
    if (!stop) return;
    if (service.dwell === 0) {
      const off = service.riders.filter((r) => r.to === stop);
      for (const rider of off) this.alight(rider, stop, service);
      service.riders = service.riders.filter((r) => r.to !== stop);
      service.busy = off.length > 0;
    }
    // Anyone waiting here for a stop further round gets on (latecomers too, while it's here).
    const later = new Set(route.stops.slice(service.next + 1).map((s) => s.index));
    for (const p of sim.people) {
      const intent = p.intent;
      if (intent?.kind !== "bus" || intent.run !== service.run || intent.from !== stop.index || !later.has(intent.to) || p.phase !== "doing" || p.riding) continue;
      service.riders.push({ id: p.id, to: sim.items[intent.to]!, after: intent.after });
      sim.board(p, service.car.id);
      service.busy = true;
    }
    service.dwell += sim.dt;
    if (service.busy && service.dwell < DWELL) return;
    service.dwell = 0;
    service.next++;
    const leg = route.legs[service.next] ?? [];
    if (service.next < route.stops.length) {
      service.car.path = [...leg];
      if (leg.length === 0) this.call(service);
      return;
    }
    service.leaving = true;
    service.car.through = true;
    service.car.path = [...leg, route.out.off];
  }

  /** Off the bus, onto the pavement where it pulled up. */
  private alight(rider: Rider, stop: Item, { route, run }: Service): void {
    const p = this.sim.person(rider.id);
    const wait = route.sides[route.stops.indexOf(stop)]?.wait ?? this.waitAt(stop, run);
    if (p) this.sim.alight(p, { level: stop.level, p: wait }, rider.after);
  }

  /** Which way a bus faces at a stop: we drive on the left, so with the shelter on its left. */
  private headingAt(stop: Item): Heading {
    const bay = this.bayOf(stop)!;
    const [dx, dy] = [Math.sign(bay[0] - (stop.def.p[0] + 1)), Math.sign(bay[1] - stop.def.p[1])];
    // Your left, going (ux, uy), is (uy, -ux); it points back at the shelter.
    return headingOf(dy, -dx, "right");
  }

  /** The kerb lane a stop's bus pulls up in: the nearest road to the shelter. */
  private bayOf(stop: Item): Tile | null {
    return this.sim.traffic.roads()?.stopBay(stop.def) ?? null;
  }

  /**
   * The route, worked out once for the town as it is: every bus stop in town,
   * in the order that makes the shortest drive both ways round (by road, setting off each stop
   * the way the bus faces there, so dead ends and turning round count), in by
   * whichever road off the map makes that shortest, and out by another.
   */
  plan(): Route | null {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const town = sim.traffic.level;
    const items = sim.activeItems();
    if (this.route?.items === items && this.route.roads === roads) return this.route;
    const stops = items.filter((i) => i.def.t === "busStop" && i.level === town && this.bayOf(i));
    const key = stops.map((s) => s.def.p.join()).join(";");
    // The same stops on roads that drive the same (an edit to the grass, the river): the same route.
    if (this.route?.key === key && roads && (this.route.roads === roads || this.route.roads?.signature === roads.signature)) {
      this.route.roads = roads;
      this.route.items = items;
      return this.route;
    }
    this.route = null;
    if (!roads || stops.length < 2) return null;
    const ins = sim.traffic.ways("in");
    const outs = sim.traffic.ways("out");
    if (!ins.length || !outs.length) return null;
    // Every side of every stop, and the best drive (for a bus, its whole body clear if it can be) from each, and from each way in, to each.
    const nodes = stops.flatMap((stop, i) => this.sidesOf(stop).map((side) => ({ i, side })));
    const goals: Goal[] = [...nodes.map(({ side }) => ({ tiles: [side.bay], arrive: side.heading })), ...outs.map((way) => ({ tiles: [way.edge] }))];
    const drives = (from: Tile, heading: Heading): (Drive | null)[] => {
      const bus = roads.routes(from, goals, heading, { mover: MOVERS.bus });
      if (bus.every(Boolean)) return bus;
      const car = roads.routes(from, goals, heading);
      return bus.map((d, k) => d ?? car[k]!);
    };
    const fromNode = nodes.map(({ side }) => drives(side.bay, side.heading));
    const fromWay = ins.map((way) => drives(way.edge, way.heading));
    const costOf = (d: Drive | null | undefined) => d?.cost ?? Infinity;
    // The best way in to each side, and out from each.
    const into = nodes.map((_, n) => ins.map((way, k) => ({ way, drive: fromWay[k]![n] })).reduce((a, b) => (costOf(b.drive) < costOf(a.drive) ? b : a)));
    const outOf = nodes.map((_, n) =>
      outs.map((way, k) => ({ way, drive: fromNode[n]![nodes.length + k] })).reduce((a, b) => (costOf(b.drive) < costOf(a.drive) ? b : a))
    );
    const sidesAt = stops.map((_, i) => nodes.flatMap((node, n) => (node.i === i ? [n] : [])));
    // One way round, calling at stops in this order, each at whichever side makes the shortest drive: its length, and the sides.
    const runOf = (order: readonly number[]): { length: number; nodes: number[] } => {
      let best = sidesAt[order[0]!]!.map((n) => ({ length: costOf(into[n]!.drive), nodes: [n] }));
      for (const i of order.slice(1))
        best = sidesAt[i]!.map((n) =>
          best.map((b) => ({ length: b.length + costOf(fromNode[b.nodes.at(-1)!]![n]), nodes: [...b.nodes, n] })).reduce((a, b) => (b.length < a.length ? b : a))
        );
      return best.map((b) => ({ ...b, length: b.length + costOf(outOf[b.nodes.at(-1)!]!.drive) })).reduce((a, b) => (b.length < a.length ? b : a));
    };
    const lengthOf = (order: readonly number[]) => {
      // Only the length matters here: no need to keep the sides.
      let best = sidesAt[order[0]!]!.map((n) => ({ length: costOf(into[n]!.drive), n }));
      for (const i of order.slice(1))
        best = sidesAt[i]!.map((n) => ({ length: Math.min(...best.map((b) => b.length + costOf(fromNode[b.n]![n]))), n }));
      return Math.min(...best.map((b) => b.length + costOf(outOf[b.n]!.drive)));
    };
    // Every order, for a handful of stops; beyond that, nearest next, from each start. Shortest both ways round.
    const near = stops.map((_, i) => stops.map((_, j) => Math.min(...sidesAt[i]!.flatMap((a) => sidesAt[j]!.map((b) => (i === j ? 0 : costOf(fromNode[a]![b])))))));
    const orders = stops.length <= MOST_TO_TRY ? permutations(stops.map((_, i) => i)) : stops.map((_, i) => nearestNext(i, near));
    let best: { order: number[]; length: number } = { order: [], length: Infinity };
    for (const order of orders) {
      const length = lengthOf(order) + lengthOf([...order].reverse());
      if (length < best.length) best = { order, length };
    }
    if (best.length === Infinity) return null;
    // Each way round, and its drives, once and for all (the same every trip).
    const run = (order: number[]): Run => {
      const { nodes: at } = runOf(order);
      const [first, last] = [into[at[0]!]!, outOf[at.at(-1)!]!];
      const legs = [first.drive!.path, ...at.slice(1).map((n, k) => fromNode[at[k]!]![n]!.path), last.drive!.path];
      return { stops: order.map((i) => stops[i]!), sides: at.map((n) => nodes[n]!.side), in: first.way, out: last.way, legs };
    };
    this.route = { runs: [run(best.order), run([...best.order].reverse())], key, roads, items };
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
    const due = rush
      ? minute % EVERY.rush === 0
      : day
        ? minute % EVERY.day === 0
        : minute === 0 && ((hour - DAY[1] + 24) % 24) % (EVERY.night / 60) === 0;
    if (due) return tick + (m - now) * TICKS_PER_MINUTE - ((hourOf(tick) * 60) % 1) * TICKS_PER_MINUTE;
  }
  return tick + 24 * TICKS_PER_HOUR;
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
  for (const [i, first] of items.entries())
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [first, ...rest];
}
