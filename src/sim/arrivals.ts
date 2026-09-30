// Arrivals (docs/PEOPLE.md#family-and-pets): new family members, added from a
// profile, come home like anyone new to town. A partner or a pet walks in from
// the edge of town; a baby is dropped off by car at the nearest bit of road to
// the house, and crawls in through the front door. Nobody appears out of thin air.
import { manhattan } from './geometry.ts';
import type { Intent, Person } from './person.ts';
import { outsideDoor } from './places.ts';
import { hashOf } from './rng.ts';
import type { Brain, Simulation } from './sim.ts';
import type { Car } from './traffic.ts';
import { slowLane } from './visitors.ts';
import type { NpcDef, Place, Tile } from './world.ts';

/** How long the car waits once the baby's out, before driving off (ticks). */
const WAIT_TICKS = 30;

interface DropOff {
  def: NpcDef;
  car: Car;
  stage: 'arriving' | 'waiting' | 'leaving';
  /** When the car sets off again. */
  until: number;
}

export class Arrivals {
  private readonly sim: Simulation;
  private readonly dropOffs: DropOff[] = [];

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Someone new for a household: a baby by car (a child, with `byCar`), anyone else on foot from the edge of town. */
  welcome(def: NpcDef, byCar: boolean): void {
    if (byCar && this.driveIn(def)) return;
    const p = this.sim.addNpc(def);
    this.place(p, this.sim.world.spawn);
    this.homeward(p);
    this.sim.log(`🧳 ${def.name} is on their way to ${this.homeName(def)}`, [p.id]);
  }

  /** Babies still on their way home (in a car, or crawling). */
  get pending(): number {
    return this.dropOffs.length + this.sim.people.filter((p) => p.crawling).length;
  }

  step(): void {
    const { sim } = this;
    for (const drop of [...this.dropOffs]) {
      const { car } = drop;
      if (drop.stage === 'arriving' && car.path.length === 0) {
        // Pulled up: the baby's out, on hands and knees.
        car.parked = true;
        const baby = sim.addNpc(drop.def);
        this.place(baby, { level: sim.traffic.level ?? sim.world.spawn.level, p: [Math.round(car.x), Math.round(car.y)] });
        baby.crawling = true;
        this.homeward(baby);
        sim.log(`👶 A car dropped ${baby.name} off at ${this.homeName(drop.def)}`, [baby.id]);
        drop.stage = 'waiting';
        drop.until = sim.tick + WAIT_TICKS;
      } else if (drop.stage === 'waiting' && sim.tick >= drop.until) {
        this.driveOff(drop);
      } else if (drop.stage === 'leaving' && car.path.length === 0) {
        sim.traffic.remove(car);
        this.dropOffs.splice(this.dropOffs.indexOf(drop), 1);
      }
    }
    // Indoors at last: a baby's crawling days are over (as far as the town's concerned).
    for (const p of sim.people) {
      if (p.crawling && p.level === p.home) {
        p.crawling = false;
        sim.clearBrain(p.id);
        sim.interrupt(p);
      }
    }
  }

  /** A car from the highway to the road nearest the house. False if there's no way to drive there. */
  private driveIn(def: NpcDef): boolean {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const lane = slowLane(sim.traffic.lanes(), 'left');
    const door = outsideDoor(sim, new Set(sim.floorsOf(def.home)));
    if (!roads || !lane || !door) return false;
    const kerb = roads
      .tilesOf('road')
      .filter((t) => roads.drivable(...t))
      .sort((a, b) => manhattan(a, door.p) - manhattan(b, door.p))[0];
    const route = kerb && roads.route(lane.first, kerb, lane.heading);
    if (!route) return false;
    const car = sim.traffic.add((hashOf(def.id, sim.world.seed) >>> 0) / 2 ** 32, lane.on, [lane.first, ...route]);
    car.facing = lane.heading;
    this.dropOffs.push({ def, car, stage: 'arriving', until: 0 });
    sim.log(`🚗 A car's on its way to ${this.homeName(def)} with someone new`, []);
    return true;
  }

  /** Back to the highway, carrying on the way it was going. */
  private driveOff(drop: DropOff): void {
    const { sim } = this;
    const { car } = drop;
    const roads = sim.traffic.roads();
    const lane = slowLane(sim.traffic.lanes(), 'left');
    const from: Tile = [Math.round(car.x), Math.round(car.y)];
    const route = roads && lane && roads.route(from, lane.last, car.facing);
    car.parked = false;
    car.path = route && lane ? [...route, lane.off] : [];
    drop.stage = 'leaving';
  }

  private place(p: Person, at: Place): void {
    p.level = at.level;
    [p.x, p.y] = [p.px, p.py] = at.p;
    p.hidden = false;
  }

  /** Straight home, whatever the time of day, before settling in to the household's ways. */
  private homeward(p: Person): void {
    this.sim.setBrain(p.id, new HomewardBrain());
  }

  private homeName(def: NpcDef): string {
    return this.sim.levels.get(def.home)?.name ?? 'their new home';
  }
}

/** Heads for home; once there, their usual brain takes over (Arrivals lets go of them). */
class HomewardBrain implements Brain {
  decide(p: Person, sim: Simulation): Intent {
    if (p.level === p.home && !p.crawling) sim.clearBrain(p.id);
    return { kind: 'wander', to: sim.randomWalkable(p.home!) ?? { level: p.home!, p: [1, 1] } };
  }
}
