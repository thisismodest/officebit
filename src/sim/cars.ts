// People's own cars (docs/TRAFFIC.md#own-cars). Someone with a car (`car: true`) keeps it in the free parking bay
// nearest home, from the start. For a long way through town, with the car near at hand and a free bay near where
// they're going, they walk to it and drive (out of sight inside, as on the bus), park in that bay, and walk the rest.
// The car stays where it's left: the next long trip, home perhaps, starts from there. When they leave town, so does it.
import { manhattan } from './geometry.ts';
import type { Leg } from './navigation.ts';
import type { Intent, Person } from './person.ts';
import { AHEAD, OPPOSITE, headingOf, type Heading } from './movement.ts';
import type { Item, Simulation } from './sim.ts';
import type { Car } from './traffic.ts';
import type { Tile } from './world.ts';

/** A walk through town at least this long (tiles) is worth the drive. */
const DRIVE_FROM = 45;
/** The furthest (tiles) anyone walks to their car, and from where they park to where they're going. */
const TO_CAR = 30;
const FROM_BAY = 25;
/** What people drive for: getting somewhere (as for the bus). */
const JOURNEYS = new Set<Intent['kind']>(['use', 'work', 'hustle', 'wander', 'play', 'sleep']);

/** Someone's car, and the bay it's in (or heading for). */
interface Own {
  owner: string;
  car: Car;
  bay: Item;
}

interface Trip {
  own: Own;
  after: Intent;
}

export class OwnCars {
  readonly owned: Own[] = [];
  readonly trips: Trip[] = [];
  private readonly sim: Simulation;
  private placed = false;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** The car someone owns, if they have one. */
  of(p: Person): Own | undefined {
    return this.owned.find((o) => o.owner === p.id);
  }

  /** Is a bay someone's (their car's in it, or on its way there)? */
  taken(bay: Item): boolean {
    return this.owned.some((o) => o.bay === bay);
  }

  /** Every step: cars for those who have one (the first time), and drivers carried along till they've parked. */
  step(): void {
    const { sim } = this;
    if (!this.placed) this.place();
    for (const own of [...this.owned]) if (own.car.parked && !sim.person(own.owner)) this.driveAway(own);
    for (const trip of [...this.trips]) {
      const { car, bay, owner } = trip.own;
      const p = sim.person(owner);
      if (p) [p.px, p.py, p.x, p.y] = [car.px, car.py, car.x, car.y];
      if (car.path.length > 0) continue;
      // Pulled into the bay: out, and on foot from here.
      car.parked = true;
      car.reversing = false;
      [car.px, car.py] = [car.x, car.y];
      this.trips.splice(this.trips.indexOf(trip), 1);
      if (p) sim.alight(p, { level: bay.level, p: this.frontOf(bay) ?? bay.def.p }, trip.after);
    }
  }

  /**
   * Would `p` drive for this, rather than walk the route? If it's a long way through town, their car's parked near
   * where they set off, and there's a free bay near the other end: the journey, by car.
   */
  consider(p: Person, intent: Intent, route: readonly Leg[]): Intent | null {
    const { sim } = this;
    const own = this.of(p);
    if (sim.brisk || !own || !own.car.parked || !JOURNEYS.has(intent.kind) || this.trips.some((t) => t.own === own)) return null;
    const leg = route.find((l) => l.level === sim.traffic.level);
    if (!leg || leg.tiles.length < DRIVE_FROM) return null;
    const [start, end] = [leg.tiles[0]!, leg.tiles.at(-1)!];
    if (manhattan(start, own.bay.def.p) > TO_CAR) return null;
    const to = this.bayNear(end, own.bay);
    if (!to || manhattan(start, own.bay.def.p) + manhattan(to.def.p, end) > leg.tiles.length / 2) return null;
    return { kind: 'drive', to: to.index, after: intent };
  }

  /** Where to walk to get in: beside the car. */
  doorOf(p: Person): Tile | null {
    const own = this.of(p);
    return own ? (this.frontOf(own.bay) ?? own.bay.def.p) : null;
  }

  /** At the car: in, and off to the bay by where they're going (if it's still free; if not, they walk). */
  drive(p: Person, intent: Extract<Intent, { kind: 'drive' }>): void {
    const { sim } = this;
    const own = this.of(p);
    const roads = sim.traffic.roads();
    const to = sim.items[intent.to];
    if (!own || !roads || !to || (this.taken(to) && own.bay !== to)) {
      sim.walkOn(p, intent.after);
      return;
    }
    const { car } = own;
    const [x, y] = [Math.round(car.x), Math.round(car.y)];
    // Back out of the bay (it went in nose first), then off along the roads, and nose first into the other.
    const back: Tile = [x - AHEAD[car.facing][0], y - AHEAD[car.facing][1]];
    const reverse = roads.drivable(...back) && !this.isBay(back);
    const away: Heading = reverse ? OPPOSITE[car.facing] : car.facing;
    const front = this.frontOf(to) ?? to.def.p;
    const there = roads.route(reverse ? back : [x, y], front, away);
    if (!there) {
      sim.walkOn(p, intent.after);
      return;
    }
    car.parked = false;
    car.reversing = reverse;
    car.path = [...(reverse ? [back] : []), ...there, to.def.p];
    own.bay = to;
    this.trips.push({ own, after: intent.after });
    sim.board(p, car.id, null);
  }

  /** Its owner's left town: off it goes too, by the nearest way out. */
  private driveAway(own: Own): void {
    const { sim } = this;
    const roads = sim.traffic.roads();
    this.owned.splice(this.owned.indexOf(own), 1);
    const { car } = own;
    const from: Tile = [Math.round(car.x), Math.round(car.y)];
    const out = sim.traffic.ways('out').sort((a, b) => manhattan(a.edge, from) - manhattan(b.edge, from))[0];
    const route = out && roads?.route(this.frontOf(own.bay) ?? from, out.edge, car.facing);
    if (!out || !route) {
      sim.traffic.remove(car);
      return;
    }
    car.parked = false;
    car.through = true;
    car.path = [...route, out.off];
  }

  /** Everyone with a car gets one, in the free bay nearest home (the first step: the town's furniture is all there). */
  private place(): void {
    const { sim } = this;
    this.placed = true;
    const level = sim.traffic.level;
    if (!level) return;
    for (const p of sim.people) {
      if (!p.car || this.of(p)) continue;
      const door = sim.world.portals.find((d) => d.b.level === p.home && d.a.level === level)?.a.p ?? sim.world.portals.find((d) => d.a.level === p.home && d.b.level === level)?.b.p;
      const bay = door && this.bayNear(door);
      if (!bay) continue;
      const [x, y] = bay.def.p;
      const front = this.frontOf(bay);
      const car = sim.traffic.add(sim.traffic.randomLook(), [x, y], []);
      // Facing into the bay, as if it pulled in nose first.
      car.facing = front ? headingOf(x - front[0], y - front[1], 'down') : 'up';
      car.parked = true;
      this.owned.push({ owner: p.id, car, bay });
    }
  }

  /** The free parking bay nearest a tile (within reach of it, on foot), other than `except`. */
  private bayNear(tile: Tile, except?: Item): Item | undefined {
    const { sim } = this;
    const visiting = new Set(sim.visitors.bays());
    return sim
      .activeItems()
      .filter((i) => i.type.parking === 'park' && i.level === sim.traffic.level && i !== except && !this.taken(i) && !visiting.has(i) && manhattan(i.def.p, tile) <= FROM_BAY)
      .sort((a, b) => manhattan(a.def.p, tile) - manhattan(b.def.p, tile))[0];
  }

  /** The tile a car pulls into a bay from: the drivable one beside it that isn't another bay (the aisle, or the road). */
  private frontOf(bay: Item): Tile | null {
    const roads = this.sim.traffic.roads();
    const [x, y] = bay.def.p;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const t: Tile = [x + dx, y + dy];
      if (roads?.drivable(...t) && !this.isBay(t)) return t;
    }
    return null;
  }

  private isBay([x, y]: Tile): boolean {
    return this.sim.activeItems().some((i) => i.type.parking && i.def.p[0] === x && i.def.p[1] === y && i.level === this.sim.traffic.level);
  }
}
