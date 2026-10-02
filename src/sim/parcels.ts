// Parcels (docs/TRAFFIC.md#parcels): the depot's van takes parcels round to people's homes on weekdays, a round
// in the morning and one in the afternoon. A driver on shift at the depot gets in, the van backs out of its loading
// bay and calls at a few homes with someone living there (pulling up at the kerb outside, hazards on, while the
// parcel goes in: "📦 A parcel for Rowan's house"), then comes back to its bay and the driver gets out. No driver
// in, no round. The van is always there, parked in its bay, between rounds.
import { TICKS_PER_HOUR, hourOf } from './clock.ts';
import { kerbOutside } from './deliveries.ts';
import { atDoorOf, manhattan } from './geometry.ts';
import { OPPOSITE, headingOf, type Heading } from './movement.ts';
import { restore } from './needs.ts';
import type { Person } from './person.ts';
import { outsideDoor } from './places.ts';
import type { Item, Simulation } from './sim.ts';
import type { Car } from './traffic.ts';
import type { Tile } from './world.ts';

/** When rounds set off (hours, weekdays). */
const ROUNDS = [10, 14];
/** How many homes a round calls at, at most and at least. */
const PARCELS: [number, number] = [2, 4];
/** How long the van stays outside each home (game minutes). */
const DROP_MINUTES = 3;
/** How near the van's bay (tiles) a driver can be, out in the yard, to take it out. */
const NEAR_THE_VAN = 10;
/** A parcel's lift for whoever's at home. */
const PARCEL_FUN = 0.08;

interface Stop {
  home: string;
  bay: Tile;
  arrive: Heading;
}

interface Round {
  stops: Stop[];
  /** The stop it's driving to (or at); past the last, it's on its way back. */
  next: number;
  stage: 'driving' | 'dropping' | 'returning';
  until: number;
  driver: string;
}

export class Parcels {
  van: Car | null = null;
  private round: Round | null = null;
  private readonly sim: Simulation;
  /** The last round set off: day and hour. */
  private lastRound = '';
  private placed = false;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Is this the van, pulled up outside a home (hazards on)? */
  dropping(car: Car): boolean {
    return car === this.van && this.round?.stage === 'dropping';
  }

  step(): void {
    const { sim } = this;
    if (!this.placed) this.place();
    const van = this.van;
    const bay = this.bay();
    if (!van || !bay || van.removed) return;
    const round = this.round;
    if (!round) {
      const hour = Math.floor(hourOf(sim.tick));
      const key = `${Math.floor(sim.tick / (24 * TICKS_PER_HOUR))}:${hour}`;
      if (ROUNDS.includes(hour) && !sim.dayOff() && this.lastRound !== key) {
        this.lastRound = key;
        this.setOff(van, bay);
      }
      return;
    }
    const driver = sim.person(round.driver);
    if (driver) [driver.px, driver.py, driver.x, driver.y] = [van.px, van.py, van.x, van.y];
    if (van.path.length > 0) return;
    if (round.stage === 'driving') {
      round.stage = 'dropping';
      round.until = sim.tick + DROP_MINUTES * (TICKS_PER_HOUR / 60);
      this.deliver(round.stops[round.next]!.home);
    } else if (round.stage === 'dropping' && sim.tick >= round.until) {
      round.next++;
      this.drive(van, round, bay);
    } else if (round.stage === 'returning') {
      // Back in its bay: parked, and the driver's out and back to the depot.
      van.parked = true;
      van.reversing = false;
      [van.px, van.py] = [van.x, van.y];
      this.round = null;
      if (driver) sim.alight(driver, { level: bay.level, p: this.frontOf(bay) }, { kind: 'wander', to: { level: bay.level, p: this.frontOf(bay) } });
    }
  }

  /** The van, in its bay, the first time: it's always been there. */
  private place(): void {
    const { sim } = this;
    this.placed = true;
    const bay = this.bay();
    if (!bay) return;
    const [x, y] = this.inBay(bay);
    const front = this.frontOf(bay);
    const van = sim.traffic.add(sim.traffic.randomLook(), [x, y], []);
    van.van = true;
    van.parked = true;
    van.facing = headingOf(x - front[0], y - front[1], 'up');
    this.van = van;
  }

  /** Where the van stands in its bay: the middle of it (the bay's as long as the van). */
  private inBay(bay: Item): Tile {
    const [w, h] = bay.type.size;
    return [bay.def.p[0] + (w - 1) / 2, bay.def.p[1] + (h - 1) / 2];
  }

  /** A round: a driver in, a few homes with someone in them, and off it goes. */
  private setOff(van: Car, bay: Item): void {
    const { sim } = this;
    const driver = this.driverFor(bay);
    if (!driver) {
      sim.log('📦 No parcel round: nobody at the depot to drive', []);
      return;
    }
    const homes = sim.housing.homes().filter((h) => sim.housing.residents(h).length > 0);
    const count = Math.min(homes.length, sim.rng.int(...PARCELS));
    const stops: Stop[] = [];
    for (let i = 0; i < count && homes.length; i++) {
      const home = homes.splice(sim.rng.int(0, homes.length - 1), 1)[0]!;
      const door = outsideDoor(sim, new Set([home.level.id]));
      const kerb = door && kerbOutside(sim, door.p);
      if (kerb) stops.push({ home: home.level.id, ...kerb });
    }
    if (!stops.length) return;
    // Nearest first, and on from each to the next nearest.
    const ordered: Stop[] = [];
    let at = bay.def.p;
    while (stops.length) {
      const next = stops.sort((a, b) => manhattan(a.bay, at) - manhattan(b.bay, at)).shift()!;
      ordered.push(next);
      at = next.bay;
    }
    sim.board(driver, van.id, null);
    this.round = { stops: ordered, next: 0, stage: 'driving', until: 0, driver: driver.id };
    this.drive(van, this.round, bay);
  }

  /** On to the next stop (backing out of the bay first), or home to the bay after the last. */
  private drive(van: Car, round: Round, bay: Item): void {
    const roads = this.sim.traffic.roads();
    if (!roads) return;
    const front = this.frontOf(bay);
    // Out of the bay backwards to the tile in front of it (it went in nose first), then off along the roads.
    const reverse = van.parked;
    const start: Tile = reverse ? front : [Math.round(van.x), Math.round(van.y)];
    const heading: Heading = reverse ? OPPOSITE[van.facing] : van.facing;
    const stop = round.stops[round.next];
    const route = stop ? roads.route(start, stop.bay, heading, { arrive: stop.arrive }) : roads.route(start, front, heading);
    van.parked = false;
    van.reversing = reverse;
    if (!route) {
      // Somewhere it can't get to: skip it (and if that's home, it just stays where it is).
      if (stop) {
        round.next++;
        this.drive(van, round, bay);
      }
      return;
    }
    van.path = [...(reverse ? [front] : []), ...route, ...(stop ? [] : [this.inBay(bay)])];
    round.stage = stop ? 'driving' : 'returning';
  }

  /** A parcel in at a home: in the News, and a little lift for whoever's in. */
  private deliver(home: string): void {
    const { sim } = this;
    const name = sim.levels.get(home)?.name ?? 'a house';
    sim.log(`📦 A parcel for ${name}`, []);
    for (const p of sim.people) if (sim.baseOf(p.level) === home && sim.present(p)) restore(p.needs, 'fun', PARCEL_FUN);
  }

  /** The van's loading bay: the first in town. */
  private bay(): Item | undefined {
    return this.sim.activeItems().find((i) => i.type.loading && i.level === this.sim.traffic.level);
  }

  /** The tile in front of the bay, where the van pulls in from and backs out to: past its open end, the drivable one beyond either end. */
  private frontOf(bay: Item): Tile {
    const roads = this.sim.traffic.roads();
    const [x, y] = bay.def.p;
    const [w, h] = bay.type.size;
    const ends: Tile[] = h >= w ? [[x, y - 1], [x, y + h]] : [[x - 1, y], [x + w, y]];
    return ends.find((t) => roads?.drivable(...t)) ?? ends[0]!;
  }

  /** A driver on shift at the depot (the building nearest the bay): inside it, or out by the van. */
  private driverFor(bay: Item): Person | undefined {
    const { sim } = this;
    const depot = this.depotOf(bay);
    if (!depot) return undefined;
    return sim.people.find((p) => {
      if (p.works !== depot || sim.phaseOf(p) !== 'work' || !sim.present(p)) return false;
      return p.level === depot || (p.level === bay.level && manhattan([Math.round(p.x), Math.round(p.y)], bay.def.p) <= NEAR_THE_VAN);
    });
  }

  /** The depot's inside: through the door of the building nearest the bay. */
  private depotOf(bay: Item): string | undefined {
    const { sim } = this;
    const buildings = sim.activeItems().filter((i) => i.level === bay.level && sim.world.portals.some((p) => [p.a, p.b].some((e) => e.level === bay.level && atDoorOf(i.def, e.p))));
    const nearest = buildings.sort((a, b) => manhattan(a.def.p, bay.def.p) - manhattan(b.def.p, bay.def.p))[0];
    if (!nearest) return undefined;
    for (const p of sim.world.portals) for (const [end, other] of [[p.a, p.b], [p.b, p.a]] as const) if (end.level === bay.level && atDoorOf(nearest.def, end.p)) return other.level;
    return undefined;
  }
}
