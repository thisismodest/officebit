// Food trucks (docs/FURNITURE.md#food-trucks): on weekdays each truck comes
// into town a while before opening, by whichever road it happens to take that
// day (the highway, or a road off the edge of the map), drives through town on
// the roads like any car (traffic.ts moves it, at the same speed, keeping its
// distance and giving way), pulls off the road onto its pitch, serves while
// it's open, then pulls back out and leaves by a road of its own choosing.
// It only serves once it's parked.
import { CATALOG } from './catalog.ts';
import { dayOf, hourOf } from './clock.ts';
import { manhattan } from './geometry.ts';
import { MOVERS, type Heading } from './movement.ts';
import { hashOf } from './rng.ts';
import type { RoadMap } from './roads.ts';
import type { Item, Simulation } from './sim.ts';
import type { Car, Way } from './traffic.ts';
import type { FurnitureDef, Tile } from './world.ts';

/** How long before opening (game hours) the first truck sets off: time to cross town even at a slow pace. */
const SET_OFF_EARLY = 1;
/** Each truck in the convoy sets off, and leaves, this many game minutes after the one before. */
const STAGGER_MINUTES = 3;

export interface VehiclePose {
  x: number;
  y: number;
  /** Where it was a step ago, for drawing it smoothly in between. */
  px: number;
  py: number;
  facing: Heading;
  moving: boolean;
  /** Where its middle is (the tile it drives by, in its lane), relative to its top-left. */
  middle: [x: number, y: number];
}

interface Run {
  car: Car;
  stage: 'arriving' | 'parked' | 'leaving';
}

export class FoodTrucks {
  private readonly sim: Simulation;
  private readonly runs = new Map<number, Run>();

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Where a truck is now, if it's in town: its top-left tile (it drives by its middle, so it keeps to the lane). */
  poseOf(item: Item): VehiclePose | null {
    const run = this.runs.get(item.index);
    if (!run) return null;
    const { car, stage } = run;
    const [ox, oy] = middle(item.def);
    return { x: car.x - ox, y: car.y - oy, px: car.px - ox, py: car.py - oy, facing: stage === 'parked' ? 'up' : car.facing, moving: stage !== 'parked', middle: [ox, oy] };
  }

  /** Parked on its pitch, ready to serve. */
  parked(item: Item): boolean {
    return this.runs.get(item.index)?.stage === 'parked';
  }

  /** Every step: trucks set off on time, park when they get there, and head off at closing. */
  step(): void {
    const { sim } = this;
    const traffic = sim.traffic;
    const convoy = sim.activeItems().filter((i) => i.type.street && i.type.hours);
    const hour = hourOf(sim.tick);
    for (const [n, item] of convoy.entries()) {
      const [open, close] = item.type.hours!;
      const stagger = (n * STAGGER_MINUTES) / 60;
      const due = !sim.dayOff() && hour >= open - SET_OFF_EARLY + stagger && hour < close + stagger;
      const run = this.runs.get(item.index);
      if (!run && due) this.setOff(item);
      else if (run?.stage === 'arriving' && run.car.path.length === 0) {
        run.stage = 'parked';
        run.car.parked = true;
      } else if (run?.stage === 'parked' && !due) this.pullOut(item, run);
      else if (run?.stage === 'leaving' && !traffic.cars.includes(run.car)) this.runs.delete(item.index);
    }
    for (const index of this.runs.keys()) if (!convoy.some((i) => i.index === index)) this.runs.delete(index);
  }

  /** In by today's road, along the roads to the kerb by the pitch, then up onto it. */
  private setOff(item: Item): void {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const way = this.pick(sim.traffic.ways('in'), item, 1);
    const kerb = roads && kerbOf(roads, item.def);
    const route = roads && way && kerb && this.byRoad(way.edge, kerb, way.heading);
    if (!route || !way || !kerb || !roads) return;
    // Along the road to the kerb, then up onto the pitch.
    const onto = pitchRoute(roads, item.def, kerb, 'onto');
    const [ox, oy] = middle(item.def);
    const car = sim.traffic.add(0, way.off, [way.edge, ...route, ...(onto ?? [[item.def.p[0] + ox, kerb[1]]]), [item.def.p[0] + ox, item.def.p[1] + oy]]);
    car.facing = way.heading;
    car.truck = item.index;
    this.runs.set(item.index, { car, stage: 'arriving' });
  }

  /** Back down onto the road, and away out of town by a road of its own. */
  private pullOut(item: Item, run: Run): void {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const way = this.pick(sim.traffic.ways('out'), item, 2);
    const kerb = roads && kerbOf(roads, item.def);
    const route = roads && way && kerb && this.byRoad(kerb, way.edge);
    run.car.parked = false;
    run.car.through = true;
    const off = roads && kerb && pitchRoute(roads, item.def, kerb, 'off');
    run.car.path = route && way && kerb ? [stopOf(item.def), ...(off ?? [kerb]), ...route, way.off] : [];
    run.stage = 'leaving';
  }

  /** A route by road that keeps the truck's whole body clear of things (or, if there's none, one like a car's). */
  private byRoad(from: Tile, to: Tile, heading?: Heading): Tile[] | null {
    const roads = this.sim.traffic.roads();
    return roads?.route(from, to, heading, { reach: MOVERS.truck.reach }) ?? roads?.route(from, to, heading) ?? null;
  }

  /** Today's pick of the ways in or out, for this truck: the same every time for a given day, with no story dice rolled. */
  private pick(ways: Way[], item: Item, salt: number): Way | undefined {
    const n = hashOf(`${item.index}:${dayOf(this.sim.tick)}:${salt}`, this.sim.world.seed) >>> 0;
    return ways[n % Math.max(1, ways.length)];
  }
}

/** How far a truck's middle is from its top-left tile. */
function middle(def: FurnitureDef): Tile {
  const [w, h] = CATALOG[def.t]!.size;
  return [(w - 1) / 2, (h - 1) / 2];
}

/** The tile a truck drives up to on its pitch: under its middle, on the pitch's front row. */
function stopOf(def: FurnitureDef): Tile {
  const [w, h] = CATALOG[def.t]!.size;
  return [def.p[0] + Math.floor(w / 2), def.p[1] + h - 1];
}

/** The road straight in front of a pitch (the nearest road anywhere, failing that): where a truck leaves the road. */
export function kerbOf(roads: RoadMap, def: FurnitureDef): Tile | undefined {
  const [x, y] = def.p;
  const [w, h] = CATALOG[def.t]!.size;
  const front: Tile = [x + Math.floor(w / 2), y + h];
  const ahead = (t: Tile) => (t[0] >= x && t[0] < x + w && t[1] >= y + h ? 0 : 100);
  return roads
    .tilesOf('road')
    .filter((t) => roads.drivable(...t))
    .sort((a, b) => ahead(a) + manhattan(a, front) - (ahead(b) + manhattan(b, front)))[0];
}

/**
 * Between the kerb and a pitch, `onto` it or `off` it: a route that keeps the
 * whole truck clear of lampposts and the like, over only the ground straight in
 * front of the pitch. Null if there's no clear way.
 */
export function pitchRoute(roads: RoadMap, def: FurnitureDef, kerb: Tile, way: 'onto' | 'off'): Tile[] | null {
  const [x, y] = def.p;
  const [w] = CATALOG[def.t]!.size;
  const stop = stopOf(def);
  const front = (tx: number, ty: number) => tx >= x && tx < x + w && ty >= y && ty <= kerb[1];
  const fit = { reach: MOVERS.truck.reach, offRoad: front };
  return way === 'onto' ? roads.route(kerb, stop, undefined, fit) : roads.route(stop, kerb, undefined, fit);
}

/** Can a truck pull onto this pitch from the road, all of it clear? (For the editor.) */
export function pitchReachable(roads: RoadMap, def: FurnitureDef): boolean {
  const kerb = kerbOf(roads, def);
  return !!kerb && pitchRoute(roads, def, kerb, 'onto') !== null;
}

/** Where a street vehicle is right now, or null if it isn't in town. */
export function vehicleAt(sim: Simulation, item: Item): VehiclePose | null {
  return sim.foodTrucks.poseOf(item);
}
