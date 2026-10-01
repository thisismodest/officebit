// Deliveries (docs/TRAFFIC.md#deliveries): once a week, first thing on a
// Monday, a lorry brings the Corner Shop its supplies. It comes in by road from
// the edge of town, pulls up at the kerb outside (hazards on: anyone behind
// waits), unloads for a quarter of an hour, and drives off out of town.
import { TICKS_PER_HOUR, dayOf, hourOf } from './clock.ts';
import { MOVERS, headingOf, type Heading } from './movement.ts';
import { outsideDoor } from './places.ts';
import type { Simulation } from './sim.ts';
import type { Car, Way } from './traffic.ts';
import type { Tile } from './world.ts';

/** When it comes: the day of the week (0 is Monday) and the hour. */
const DAY = 0;
const HOUR = 7;
/** How long it stays, unloading (game minutes). */
const UNLOAD_MINUTES = 15;
/** How far along the kerb (tiles, either way) it looks for somewhere to pull up, if the shop's door faces a crossing. */
const KERB_SEARCH = 8;

interface Delivery {
  car: Car;
  shop: string;
  stage: 'arriving' | 'unloading' | 'leaving';
  until: number;
  out: Way;
  leave: Tile[];
}

export class Deliveries {
  private readonly sim: Simulation;
  private readonly deliveries: Delivery[] = [];
  /** The last day a delivery set off. */
  private lastDay = -1;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** The lorry pulled up outside a shop, unloading (for its hazard lights). */
  unloading(car: Car): boolean {
    return this.deliveries.some((d) => d.car === car && d.stage === 'unloading');
  }

  step(): void {
    const { sim } = this;
    const day = dayOf(sim.tick);
    if (day % 7 === DAY && hourOf(sim.tick) >= HOUR && this.lastDay !== day) {
      this.lastDay = day;
      for (const shop of this.shops()) this.send(shop);
    }
    for (const d of [...this.deliveries]) {
      if (d.stage === 'arriving' && d.car.path.length === 0) {
        d.stage = 'unloading';
        d.car.parked = true;
        d.until = sim.tick + UNLOAD_MINUTES * (TICKS_PER_HOUR / 60);
        sim.log(`🚚 The ${sim.levels.get(d.shop)?.name ?? 'shop'}'s delivery is here`, []);
      } else if (d.stage === 'unloading' && sim.tick >= d.until) {
        d.stage = 'leaving';
        d.car.parked = false;
        d.car.through = true;
        d.car.path = [...d.leave, d.out.off];
      } else if (d.car.removed) {
        this.deliveries.splice(this.deliveries.indexOf(d), 1);
      }
    }
  }

  /** The town's food shops: venues where the food shop gets done. */
  private shops(): string[] {
    const { sim } = this;
    return [...new Set(sim.activeItems().filter((i) => i.type.groceries && sim.levels.get(i.level)?.kind === 'venue').map((i) => i.level))];
  }

  /** A lorry off to a shop: in by the nearest way into town, to the kerb outside its door (the shop on its left), and out by another. */
  private send(shop: string): void {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const door = outsideDoor(sim, new Set([shop]));
    if (!roads || !door) return;
    // The lane outside: straight out from the door to the road (or a crossing on it), then along the kerb to the nearest
    // stretch of plain road the lorry's whole length fits on: never on a zebra crossing.
    const carriageway = (x: number, y: number) => roads.drivable(x, y) && roads.floorAt(x, y) !== 'path';
    const out = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const)
      .flatMap(([dx, dy]) => [1, 2, 3].map((r) => ({ dx, dy, r })))
      .find(({ dx, dy, r }) => carriageway(door.p[0] + dx * r, door.p[1] + dy * r));
    if (!out) return;
    const toShop: [number, number] = [-out.dx, -out.dy];
    const lane: Tile = [door.p[0] + out.dx * out.r, door.p[1] + out.dy * out.r];
    const along: Tile = [Math.abs(out.dy), Math.abs(out.dx)];
    const plain = (x: number, y: number) => roads.floorAt(x, y) === 'road' && roads.drivable(x, y);
    // Its length, and a tile clear at either end (well back from a crossing).
    const fits = ([x, y]: Tile) => [-2, -1, 0, 1, 2].every((k) => plain(x + along[0] * k, y + along[1] * k));
    const bay = Array.from({ length: KERB_SEARCH * 2 + 1 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil(i / 2))
      .map((k): Tile => [lane[0] + along[0] * k, lane[1] + along[1] * k])
      .find(fits);
    if (!bay) return;
    // We drive on the left, so the shop's on its left: your left, going (ux, uy), is (uy, -ux).
    const arrive: Heading = headingOf(-toShop[1], toShop[0], 'right');
    const fit = { mover: MOVERS.lorry };
    const best = (ways: Way[], route: (way: Way) => Tile[] | null) =>
      ways.map((way) => ({ way, path: route(way) })).filter((w): w is { way: Way; path: Tile[] } => !!w.path).sort((a, b) => a.path.length - b.path.length)[0];
    const into = best(sim.traffic.ways('in'), (way) => roads.route(way.edge, bay, way.heading, { ...fit, arrive }) ?? roads.route(way.edge, bay, way.heading, { arrive }));
    const away = best(sim.traffic.ways('out'), (way) => roads.route(bay, way.edge, arrive, fit) ?? roads.route(bay, way.edge, arrive));
    if (!into || !away) return;
    const car = sim.traffic.add(0, into.way.off, [into.way.edge, ...into.path]);
    car.facing = into.way.heading;
    car.lorry = true;
    this.deliveries.push({ car, shop, stage: 'arriving', until: 0, out: away.way, leave: away.path });
  }
}
