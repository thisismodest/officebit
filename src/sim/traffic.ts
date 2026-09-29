// Traffic (docs/TRAFFIC.md): cars on the town's roads. Through-traffic streams
// along the highway; visitors' cars (visitors.ts) turn off it into town. Cars
// move a step at a time, like people walking, and hang back from the car in
// front. It has a random stream of its own, so the traffic never changes the
// story. Food trucks keep their own timetable (food-trucks.ts).
import { between, hourOf } from './clock.ts';
import type { Grid } from './grid.ts';
import { AHEAD, RoadMap, drive, type Driver } from './roads.ts';
import { Rng } from './rng.ts';
import type { Simulation } from './sim.ts';
import type { Tile } from './world.ts';

/** Chance, each step, of a car joining each highway lane: by day, and in the quiet hours. */
const THROUGH_BUSY = 0.02;
const THROUGH_QUIET = 0.004;
const QUIET_HOURS: [from: number, to: number] = [22, 6];
/** Cars keep at least this far (tiles) behind the one in front. */
const GAP = 1.6;
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
      if (this.rng.next() >= chance || this.cars.some((c) => c.y === lane.y && Math.abs(c.x - lane.on[0]) < GAP * 2)) continue;
      const car = this.add(this.rng.next(), lane.on, [lane.off], true);
      car.facing = lane.heading;
    }
    for (const car of [...this.cars]) {
      // Parked, or held up: it stays exactly where it is (nothing to draw moving between steps).
      if (car.parked || this.blocked(car)) {
        [car.px, car.py] = [car.x, car.y];
        continue;
      }
      const done = drive(car, roads.speedAt(car.x, car.y));
      if (done && car.through) this.remove(car);
    }
  }

  /** Is there a car just ahead going the same way, or someone on the zebra crossing (or path) in front? */
  private blocked(car: Car): boolean {
    const [dx, dy] = car.reversing ? AHEAD[car.facing].map((d) => -d) as [number, number] : AHEAD[car.facing];
    if (this.crossingAhead(car, dx, dy)) return true;
    return this.cars.some((other) => {
      if (other === car || other.parked || other.facing !== car.facing) return false;
      const ahead = (other.x - car.x) * dx + (other.y - car.y) * dy;
      const aside = Math.abs((other.x - car.x) * dy - (other.y - car.y) * dx);
      return ahead > 0 && ahead < GAP && aside < 0.5;
    });
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
    return this.sim.people.some((p) => {
      if (p.level !== level || !this.sim.present(p) || !zebra(p.x, p.y)) return false;
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
