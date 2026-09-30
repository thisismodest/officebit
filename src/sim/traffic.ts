// Traffic (docs/TRAFFIC.md): cars on the town's roads. Through-traffic streams
// along the highway; visitors' cars (visitors.ts) turn off it into town. Cars
// move a step at a time, like people walking, and hang back from the car in
// front (collision.ts: every vehicle is a body in the sim's `space`). It has a random stream of its own, so the traffic never changes the
// story. Food trucks drive among them, on their own timetable (food-trucks.ts).
import { between, hourOf } from './clock.ts';
import type { Grid } from './grid.ts';
import { inTheWay, type Body } from './collision.ts';
import { footprint } from './geometry.ts';
import { AHEAD, MOVERS, OPPOSITE, advance, speedOn } from './movement.ts';
import { RoadMap, type Driver } from './roads.ts';
import { Rng } from './rng.ts';
import type { Simulation } from './sim.ts';
import type { Tile } from './world.ts';

/** Chance, each step, of a car joining each highway lane: by day, and in the quiet hours. */
const THROUGH_BUSY = 0.02;
const THROUGH_QUIET = 0.004;
const QUIET_HOURS: [from: number, to: number] = [22, 6];
/** How far off the map (tiles) cars appear and vanish, so they drive on and off rather than pop. */
const OFFSTAGE = 3;
/** Floors where cars give way to people on foot, and how far across the road (tiles) they look. */
const ZEBRAS = new Set(['zebra', 'zebraSide']);
const CROSSING_REACH = 2.5;
/** Mixing the world's seed for traffic's own random stream. */
const TRAFFIC_SEED = 0x7ea0c0de;

export interface Car extends Driver {
  id: string;
  /** Paint job and model, 0–1. */
  look: number;
  /** Pulled up in a bay: not moving, and in nobody's way. */
  parked: boolean;
  /** On charge until this tick. */
  chargedAt?: number;
  /** Just passing: gone once it's off the map. */
  through?: boolean;
  /** A food truck (its item's index): drawn as the truck, not a car. */
  truck?: number;
  /** Gone from the roads (off the map, done). */
  removed?: boolean;
}

/** A highway lane: its row, which way it runs, its first and last tiles on the map, and where cars come on and go off (just off it). */
export interface Lane {
  y: number;
  heading: 'left' | 'right';
  on: Tile;
  first: Tile;
  last: Tile;
  off: Tile;
}

export class Traffic {
  readonly cars: Car[] = [];
  private readonly sim: Simulation;
  private readonly rng: Rng;
  private map: { grid: Grid; roads: RoadMap; lanes: Lane[] } | null = null;
  private count = 0;
  /** Each car as a body in the sim's space: live views, so always where the car is. */
  private readonly bodies = new WeakMap<Car, Body>();

  constructor(sim: Simulation) {
    this.sim = sim;
    this.rng = new Rng(sim.world.seed ^ TRAFFIC_SEED);
  }

  /** The level the roads are on: the town outside. */
  get level(): string | undefined {
    return this.sim.world.levels.find((l) => l.kind === 'outside')?.id;
  }

  /** The roads, as a map for driving on. Rebuilt whenever the town's layout changes. */
  roads(): RoadMap | null {
    return this.current()?.roads ?? null;
  }

  /** Every highway lane. The north half of a highway runs east, the south half west (we drive on the left). */
  lanes(): Lane[] {
    return this.current()?.lanes ?? [];
  }

  /** Put a car on the road. */
  add(look: number, at: Tile, path: Tile[], through = false): Car {
    const [x, y] = at;
    const car: Car = { id: `car-${++this.count}`, look, x, y, px: x, py: y, facing: 'left', path, parked: false, through };
    this.cars.push(car);
    return car;
  }

  remove(car: Car): void {
    car.removed = true;
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  /** A car's random look, from traffic's own stream. */
  randomLook(): number {
    return this.rng.next();
  }

  /** Every step: new through-traffic at the ends of the highway, and every car a little further along. */
  step(): void {
    const roads = this.roads();
    if (!roads) return;
    const chance = between(hourOf(this.sim.tick), ...QUIET_HOURS) ? THROUGH_QUIET : THROUGH_BUSY;
    for (const lane of this.lanes()) {
      if (this.rng.next() >= chance || this.cars.some((c) => c.y === lane.y && Math.abs(c.x - lane.on[0]) < MOVERS.car.manners.stop * 2)) continue;
      const car = this.add(this.rng.next(), lane.on, [lane.off], true);
      car.facing = lane.heading;
    }
    const level = this.level!;
    this.sim.space.fill('wheels', this.cars.map((car) => ({ level, body: this.bodyOf(car) })));
    this.markParked(level);
    for (const car of [...this.cars]) {
      // Parked, or held up: it stays exactly where it is (nothing to draw moving between steps).
      if (car.parked || this.blocked(car)) {
        [car.px, car.py] = [car.x, car.y];
        continue;
      }
      const done = advance(car, car.path, speedOn(car.truck === undefined ? MOVERS.car : MOVERS.truck, roads.surfaceAt(car.x, car.y)));
      if (done && car.through) this.remove(car);
    }
  }

  /** A car as a body in the sim's space. */
  private bodyOf(car: Car): Body {
    let body = this.bodies.get(car);
    if (!body) {
      const { sim } = this;
      body = {
        id: car.id,
        get x() {
          return car.x;
        },
        get y() {
          return car.y;
        },
        get facing() {
          return car.facing;
        },
        get moving() {
          return !car.parked;
        },
        get here() {
          return !car.removed;
        },
        // Parked, a food truck stands on its whole pitch.
        get rect() {
          const truck = car.parked && car.truck !== undefined ? sim.items[car.truck] : undefined;
          return truck ? footprint(truck.def) : undefined;
        },
      };
      this.bodies.set(car, body);
    }
    return body;
  }

  /** Parked vehicles block the tiles they stand on for people walking (a car its tile, a food truck its whole pitch). */
  private markParked(level: string): void {
    const grid = this.sim.grids.get(level);
    if (!grid) return;
    grid.parked.fill(0);
    for (const body of this.sim.space.still(level, 'wheels')) {
      const [x, y, w, h] = body.rect ?? [Math.round(body.x), Math.round(body.y), 1, 1];
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid.inBounds(i, j)) grid.parked[grid.i(i, j)] = 1;
    }
  }

  /**
   * Is there a car just ahead going the same way (or stopped in the lane:
   * parked off the road, in a bay or on a pitch, it's out of the way), or
   * someone on the zebra crossing (or path) in front? The driving manners do the rest.
   */
  private blocked(car: Car): boolean {
    const facing = car.reversing ? OPPOSITE[car.facing] : car.facing;
    const [dx, dy] = AHEAD[facing];
    if (this.crossingAhead(car, dx, dy)) return true;
    const manners = MOVERS.car.manners;
    const others = this.sim.space.near(this.level!, 'wheels', car.x, car.y, manners.slow + 1);
    return inTheWay(this.bodyOf(car), facing, others, manners).step === 0;
  }

  /** Someone on a zebra just ahead of the car, anywhere across the road. */
  private crossingAhead(car: Car, dx: number, dy: number): boolean {
    const roads = this.roads();
    const level = this.level;
    if (!roads || !level) return false;
    // People on foot have right of way on zebras, and on any path or pavement a car's crossing.
    const zebra = (x: number, y: number) => ZEBRAS.has(roads.floorAt(Math.round(x), Math.round(y)) ?? '') || roads.footway(x, y);
    const ahead = [1, 2].map((d): Tile => [car.x + dx * d, car.y + dy * d]).find(([x, y]) => zebra(x, y));
    if (!ahead) return false;
    return this.sim.space.near(level, 'foot', ahead[0], ahead[1], CROSSING_REACH + 1).some((p) => {
      if (!zebra(p.x, p.y)) return false;
      const along = (p.x - ahead[0]) * dx + (p.y - ahead[1]) * dy;
      return Math.abs(along) < 1 && Math.abs((p.x - car.x) * dy - (p.y - car.y) * dx) < CROSSING_REACH;
    });
  }

  private current(): { roads: RoadMap; lanes: Lane[] } | null {
    const id = this.level;
    const level = id ? this.sim.levels.get(id) : undefined;
    const grid = id ? this.sim.grids.get(id) : undefined;
    if (!level || !grid) return null;
    if (this.map?.grid !== grid) {
      const lanes = level.rooms
        .filter((room) => room.floor === 'highway')
        .flatMap(({ rect: [x, y, w, h] }) =>
          Array.from({ length: h }, (_, i): Lane => {
            const [row, west, east] = [y + i, x, x + w - 1];
            return i < h / 2
              ? { y: row, heading: 'right', on: [west - OFFSTAGE, row], first: [west, row], last: [east, row], off: [east + OFFSTAGE, row] }
              : { y: row, heading: 'left', on: [east + OFFSTAGE, row], first: [east, row], last: [west, row], off: [west - OFFSTAGE, row] };
          }),
        );
      this.map = { grid, roads: new RoadMap(level, grid), lanes };
    }
    return this.map;
  }
}
