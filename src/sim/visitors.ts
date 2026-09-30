// Visitors (docs/TRAFFIC.md#visitors): every so often a car turns off the
// highway, drives round town and pulls into a parking bay. Its driver gets
// out, either for something to eat or to charge the car, pops into somewhere
// public (or waits by the car), then gets back in and carries on their
// journey. Others just come for a drive round: in by any road, past a few
// places, and out by another. Arrivals come from the clock and visitors' own
// random stream, so the same town always gets the same visitors.
import { TICKS_PER_HOUR, between, hourOf } from './clock.ts';
import type { Intent, Person } from './person.ts';
import { AHEAD, headingOf, type Heading } from './movement.ts';
import { Rng } from './rng.ts';
import type { Brain, Item, Simulation } from './sim.ts';
import type { Car, Lane } from './traffic.ts';
import type { Tile } from './world.ts';

/** Hours between arrivals: anywhere from about an hour to a few days, usually nearer an hour (the higher the skew, the more often). */
const GAP_HOURS: [number, number] = [1, 72];
const GAP_SKEW = 3;
/** No more than this many visitors in town at once. */
const MOST_AT_ONCE = 3;
/** Chance a visitor has stopped to eat, rather than to charge the car. */
const HUNGRY = 0.5;
/** While charging, the chance they wait by the car rather than pop in somewhere. */
const WAIT_BY_CAR = 0.3;
/** How long a charge takes, in game minutes. */
const CHARGE_MINUTES: [number, number] = [25, 50];
/** Cars out for a drive round town: game minutes between them (in the hours they're about), how many at once, and how many places each drives by. */
const TOUR_GAP_MINUTES: [number, number] = [20, 120];
const TOUR_HOURS: [number, number] = [8, 21];
const MOST_TOURING = 2;
const TOUR_STOPS: [number, number] = [2, 4];
/** Mixing the world's seed for visitors' own random stream. */
const VISITOR_SEED = 0x51717025;

type Reason = 'eat' | 'charge';

interface Visit {
  car: Car;
  bay: Item;
  reason: Reason;
  stage: 'arriving' | 'visiting' | 'leaving';
  /** Their driver, once they're out of the car. */
  driver?: string;
  /** What they'll do once they're out: null once they've done it (or if they're waiting by the car). */
  errand: Intent | null;
}

export class Visitors {
  private readonly sim: Simulation;
  private readonly rng: Rng;
  private readonly visits: Visit[] = [];
  private next: number;
  private nextTour: number;
  /** Cars out for a drive round, till they're off the map. */
  readonly touring: Car[] = [];
  private count = 0;

  constructor(sim: Simulation) {
    this.sim = sim;
    this.rng = new Rng(sim.world.seed ^ VISITOR_SEED);
    this.next = sim.tick + this.gap();
    this.nextTour = sim.tick + this.tourGap();
  }

  /** The visit someone's on, if they're a visitor. */
  of(p: Person): Visit | undefined {
    return this.visits.find((v) => v.driver === p.id);
  }

  /** Is this visitor's car still on charge? */
  charging(p: Person): boolean {
    const car = this.of(p)?.car;
    return !!car?.chargedAt && this.sim.tick < car.chargedAt;
  }

  step(): void {
    const { sim } = this;
    if (sim.tick >= this.next) {
      this.next = sim.tick + this.gap();
      if (this.visits.length < MOST_AT_ONCE) this.arrive();
    }
    if (sim.tick >= this.nextTour) {
      this.nextTour = sim.tick + this.tourGap();
      for (const car of this.touring.filter((c) => c.removed)) this.touring.splice(this.touring.indexOf(car), 1);
      if (this.touring.length < MOST_TOURING && between(hourOf(sim.tick), ...TOUR_HOURS)) this.tour();
    }
    for (const visit of [...this.visits]) {
      const { car } = visit;
      if (visit.stage === 'arriving' && car.path.length === 0) this.park(visit);
      else if (visit.stage === 'visiting' && this.ready(visit)) this.depart(visit);
      else if (visit.stage === 'leaving' && car.path.length === 0) {
        sim.traffic.remove(car);
        this.visits.splice(this.visits.indexOf(visit), 1);
      }
    }
  }

  /** A car turns off the highway: it comes on in the slow lane, has a drive round town, and heads for a free bay. */
  private arrive(): void {
    const { sim, rng } = this;
    const roads = sim.traffic.roads();
    const lane = slowLane(sim.traffic.lanes(), 'left');
    const reason: Reason = rng.next() < HUNGRY ? 'eat' : 'charge';
    const taken = new Set(this.visits.map((v) => v.bay));
    const bays = sim.activeItems().filter((i) => i.type.parking && !taken.has(i) && (reason === 'eat' || i.type.parking === 'charge'));
    // Chargers are for charging: diners take a plain bay if there is one.
    const bay = bays.find((i) => i.type.parking === 'park') ?? bays[0];
    if (!roads || !lane || !bay) return;

    const tours = roads.tilesOf('road');
    const tour = tours[rng.int(0, tours.length - 1)];
    // Nose in: to the tile in front of the bay, then up into it.
    const there = bay.def.p;
    const front: Tile = [there[0], there[1] + 1];
    const approach = roads.drivable(...front) ? front : there;
    const drive = (tour && join(roads.route(lane.first, tour, lane.heading), (after) => roads.route(tour, approach, after))) ?? roads.route(lane.first, approach, lane.heading);
    if (!drive) return;
    const car = sim.traffic.add(sim.traffic.randomLook(), lane.on, [lane.first, ...drive, ...(approach === front ? [there] : [])]);
    car.facing = lane.heading;
    this.visits.push({ car, bay, reason, stage: 'arriving', errand: null });
  }

  /** A car out for a drive: in by one road, round a few of the town's streets, and out by another. */
  private tour(): void {
    const { sim, rng } = this;
    const roads = sim.traffic.roads();
    const ins = sim.traffic.ways('in');
    const outs = sim.traffic.ways('out');
    if (!roads || !ins.length || !outs.length) return;
    const way = ins[rng.int(0, ins.length - 1)]!;
    const out = outs[rng.int(0, outs.length - 1)]!;
    const streets = roads.tilesOf('road');
    const stops = Array.from({ length: rng.int(...TOUR_STOPS) }, () => streets[rng.int(0, streets.length - 1)]!);
    let drive: Tile[] = [way.edge];
    let heading: Heading = way.heading;
    for (const to of [...stops, out.edge]) {
      const leg = roads.route(drive.at(-1)!, to, heading);
      if (!leg) return;
      drive = [...drive, ...leg];
      // Setting off again the way it was going (a stop where it already is changes nothing).
      const [a, b] = drive.slice(-2);
      if (a && b) heading = headingOf(b[0] - a[0], b[1] - a[1], heading);
    }
    const car = sim.traffic.add(sim.traffic.randomLook(), way.off, [...drive, out.off], true);
    car.facing = way.heading;
    this.touring.push(car);
  }

  /** Pulled up: the driver gets out, and knows what they're here for. */
  private park(visit: Visit): void {
    const { sim, rng } = this;
    const { car, bay } = visit;
    car.parked = true;
    [car.px, car.py] = [car.x, car.y];
    const id = `visitor-${++this.count}`;
    const driver = sim.addNpc({ id, name: 'Visitor', species: 'human', look: [rng.int(0, 5), rng.int(0, 7), rng.int(0, 7), rng.int(0, 3)], home: '', role: 'visitor' });
    sim.setBrain(id, new VisitorBrain(this));
    [driver.x, driver.y] = [driver.px, driver.py] = bay.def.p;
    sim.setLevel(driver, bay.level);
    visit.driver = id;
    visit.stage = 'visiting';

    if (visit.reason === 'eat') {
      const meal = this.pick(sim.publicPlaces(), (item) => (item.type.offers?.hunger ?? 0) > 0, true);
      visit.errand = meal ? { kind: 'use', item: meal.index } : null;
      sim.log(meal ? `🚗 A visitor pulled in for a bite at ${this.placeName(meal)}` : '🚗 A visitor pulled in, but found nowhere open to eat', [id]);
      return;
    }
    car.chargedAt = sim.tick + Math.round((rng.range(...CHARGE_MINUTES) / 60) * TICKS_PER_HOUR);
    const stop = rng.next() < WAIT_BY_CAR ? undefined : this.somewhereToPopInto();
    visit.errand = stop ? { kind: 'use', item: stop.index } : null;
    sim.log(`🔌 A visitor stopped to charge their car${stop ? ` and popped into ${this.placeName(stop)}` : ', and waited by it'}`, [id]);
  }

  /** Errand done, car charged, and back at it. */
  private ready(visit: Visit): boolean {
    const driver = this.sim.person(visit.driver ?? '');
    if (!driver || visit.errand || (visit.car.chargedAt ?? 0) > this.sim.tick) return false;
    const [x, y] = visit.bay.def.p;
    return driver.level === visit.bay.level && driver.phase === 'doing' && Math.round(driver.x) === x && Math.round(driver.y) === y;
  }

  /** Back in the car, and back to the highway, carrying on the way they were going. */
  private depart(visit: Visit): void {
    const { sim } = this;
    const { car } = visit;
    sim.removePerson(visit.driver!);
    visit.driver = undefined;
    const roads = sim.traffic.roads();
    const lane = slowLane(sim.traffic.lanes(), 'left');
    const [x, y] = [Math.round(car.x), Math.round(car.y)];
    // Back out of the bay (it went in nose first), then off on its way.
    const back: Tile = [x - AHEAD[car.facing][0], y - AHEAD[car.facing][1]];
    const reverse = roads?.drivable(...back) ?? false;
    const from: Tile = reverse ? back : [x, y];
    const away: Heading = reverse ? opposite(car.facing) : car.facing;
    const route = roads && lane && roads.route(from, lane.last, away);
    car.parked = false;
    car.chargedAt = undefined;
    car.reversing = reverse;
    car.path = route && lane ? [...(reverse ? [back] : []), ...route, lane.off] : [];
    visit.stage = 'leaving';
  }

  /** A random thing to use in one of `levels` (or at a food truck, with `streetFood`) that suits `wanted`. */
  private pick(levels: readonly string[], wanted: (item: Item) => boolean, streetFood = false): Item | undefined {
    const { sim } = this;
    const outside = sim.traffic.level;
    const options = sim
      .activeItems()
      .filter(
        (item) =>
          (levels.includes(item.level) || (streetFood && item.level === outside && item.type.street)) &&
          !item.type.staff &&
          item.type.spots.length > 0 &&
          sim.isOpen(item) &&
          sim.freeSpots(item.index) > 0 &&
          wanted(item),
      );
    return options[this.rng.int(0, options.length - 1)];
  }

  /** While the car charges: one of the town's public places, and something to do there. */
  private somewhereToPopInto(): Item | undefined {
    const places = this.sim.publicPlaces();
    const place = places[this.rng.int(0, places.length - 1)];
    return place ? this.pick([place], () => true) : undefined;
  }

  private placeName(item: Item): string {
    return item.type.street ? `the ${item.def.label ?? item.type.name}` : (this.sim.levels.get(item.level)?.name ?? 'somewhere');
  }

  /** Ticks till the next car out for a drive. */
  private tourGap(): number {
    return Math.round((this.rng.range(...TOUR_GAP_MINUTES) / 60) * TICKS_PER_HOUR);
  }

  /** Hours till the next visitor, skewed towards the short end. */
  private gap(): number {
    const [least, most] = GAP_HOURS;
    return Math.round(least * (most / least) ** (this.rng.next() ** GAP_SKEW) * TICKS_PER_HOUR);
  }
}

/** A visitor: off to do what they stopped for, then back to the car to wait for it (or just to get in). */
class VisitorBrain implements Brain {
  private readonly visitors: Visitors;

  constructor(visitors: Visitors) {
    this.visitors = visitors;
  }

  decide(p: Person): Intent {
    const visit = this.visitors.of(p);
    if (!visit) return { kind: 'leave' };
    const errand = visit.errand;
    visit.errand = null;
    return errand ?? { kind: 'wander', to: { level: visit.bay.level, p: visit.bay.def.p } };
  }
}

function opposite(h: Heading): Heading {
  return ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[h];
}

/** The outside lane running `heading`: the one on the kerb side, where cars turn off. */
export function slowLane(lanes: readonly Lane[], heading: Lane['heading']): Lane | undefined {
  const way = lanes.filter((l) => l.heading === heading);
  return heading === 'left' ? way.at(-1) : way[0];
}

/** Two routes end to end, the second setting off the way the first finished. */
function join(first: Tile[] | null, then: (heading: Heading) => Tile[] | null): Tile[] | null {
  if (!first || first.length < 2) return null;
  const [a, b] = first.slice(-2) as [Tile, Tile];
  const second = then(headingOf(b[0] - a[0], b[1] - a[1], 'left'));
  return second ? [...first, ...second] : null;
}
