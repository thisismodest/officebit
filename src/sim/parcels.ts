// Parcels (docs/TRAFFIC.md#parcels): the depot's vans take parcels round to people's homes on weekdays, a round in
// the morning and one in the afternoon. There's a van for each loading bay; for each, a driver on shift at the depot
// gets in, the van backs out of its bay and calls at a few homes with someone living there (pulling up at the kerb
// outside, hazards on, while the parcel goes in: "📦 A parcel for Rowan's house"), then comes back to its bay and the
// driver gets out. No driver free, no round for that van. Between rounds each van is parked in its bay; a bay added
// later (in the editor, or by the crews) gets a van that drives in from the edge of town.
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
/** How long a van stays outside each home (game minutes). */
const DROP_MINUTES = 3;
/** How near a van's bay (tiles) a driver can be, out in the yard, to take it out. */
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

/** A van and the loading bay it belongs to (the bay's item index), out on a round or not; arriving: on its way in to a new bay. */
interface Van {
  bay: number;
  car: Car;
  round: Round | null;
  arriving?: boolean;
  /** The round (day and hour) it last went out on. */
  went?: string;
}

export class Parcels {
  /** Not saved with the town (snapshot.ts): worked out again from the map. */
  static readonly unsaved = ['depots'];
  readonly vans: Van[] = [];
  private readonly sim: Simulation;
  /** The round due now or last (day and hour), and whether any van went out on it. */
  private due = '';
  private anyWent = true;
  private placed = false;
  private depots: { items: readonly Item[]; of: Map<number, string | undefined> } | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Is this one of the vans, pulled up outside a home (hazards on)? */
  dropping(car: Car): boolean {
    return this.vans.some((v) => v.car === car && v.round?.stage === 'dropping');
  }

  step(): void {
    const { sim } = this;
    const bays = this.bays();
    // The vans in their bays the first time (they've always been there); a bay added since gets one, driving in.
    for (const bay of bays) if (!this.vans.some((v) => v.bay === bay.index)) this.vans.push(this.placed ? this.arrive(bay) : this.park(bay));
    this.placed = true;
    // A round's hour: each van goes as soon as there's a driver free (they're not all in on the hour). The hour gone
    // and no van went: it's in the News.
    const hour = Math.floor(hourOf(sim.tick));
    const time = ROUNDS.includes(hour) && !sim.dayOff();
    const key = time ? `${Math.floor(sim.tick / (24 * TICKS_PER_HOUR))}:${hour}` : '';
    if (key !== this.due) {
      if (!this.anyWent && this.vans.length) sim.log('📦 No parcel round: nobody at the depot to drive', []);
      this.due = key;
      this.anyWent = !key;
    }
    for (const van of this.vans) {
      const bay = sim.items[van.bay];
      if (!bay || bay.gone || van.car.removed) continue;
      if (van.arriving) {
        if (van.car.path.length > 0) continue;
        van.arriving = false;
        van.car.parked = true;
      }
      if (!van.round) {
        // Parked, it's in its bay, wherever that is now (moved in the editor, or laid out differently in a newer town).
        const [bx, by] = this.inBay(bay);
        const { car } = van;
        if (car.parked && (car.x !== bx || car.y !== by)) {
          const front = this.frontOf(bay);
          [car.x, car.y, car.px, car.py] = [bx, by, bx, by];
          car.facing = headingOf(bx - front[0], by - front[1], car.facing);
        }
        if (key && van.went !== key && this.setOff(van, bay)) {
          van.went = key;
          this.anyWent = true;
        }
        continue;
      }
      this.carry(van, bay);
    }
  }

  /** A van out on its round: the driver with it, on to each stop, a parcel in at each, and back to its bay. */
  private carry(van: Van, bay: Item): void {
    const { sim } = this;
    const { car } = van;
    const round = van.round!;
    const driver = sim.person(round.driver);
    if (driver) [driver.px, driver.py, driver.x, driver.y] = [car.px, car.py, car.x, car.y];
    if (car.path.length > 0) return;
    if (round.stage === 'driving') {
      round.stage = 'dropping';
      round.until = sim.tick + DROP_MINUTES * (TICKS_PER_HOUR / 60);
      this.deliver(round.stops[round.next]!.home);
    } else if (round.stage === 'dropping' && sim.tick >= round.until) {
      round.next++;
      this.drive(car, round, bay);
    } else if (round.stage === 'returning') {
      // Back in its bay: parked, and the driver's out and back to the depot.
      car.parked = true;
      car.reversing = false;
      [car.px, car.py] = [car.x, car.y];
      van.round = null;
      if (driver) sim.alight(driver, { level: bay.level, p: this.frontOf(bay) }, { kind: 'wander', to: { level: bay.level, p: this.frontOf(bay) } });
    }
  }

  /** A van parked in its bay. */
  private park(bay: Item): Van {
    const [x, y] = this.inBay(bay);
    const front = this.frontOf(bay);
    const car = this.sim.traffic.add(this.sim.traffic.randomLook(), [x, y], []);
    car.van = true;
    car.parked = true;
    car.facing = headingOf(x - front[0], y - front[1], 'up');
    return { bay: bay.index, car, round: null };
  }

  /** A new bay's van, driving in from the nearest way into town and nose first into the bay (or, with no way in, already there). */
  private arrive(bay: Item): Van {
    const { sim } = this;
    const roads = sim.traffic.roads();
    const front = this.frontOf(bay);
    const into = roads && sim.traffic.ways('in').map((way) => ({ way, path: roads.route(way.edge, front, way.heading) })).filter((w) => w.path).sort((a, b) => a.path!.length - b.path!.length)[0];
    if (!into) return this.park(bay);
    const car = sim.traffic.add(sim.traffic.randomLook(), into.way.off, [into.way.edge, ...into.path!, this.inBay(bay)]);
    car.van = true;
    car.facing = into.way.heading;
    return { bay: bay.index, car, round: null, arriving: true };
  }

  /** Where a van stands in its bay: the middle of it (the bay's as long as the van). */
  private inBay(bay: Item): Tile {
    const [w, h] = bay.type.size;
    return [bay.def.p[0] + (w - 1) / 2, bay.def.p[1] + (h - 1) / 2];
  }

  /** A round: a driver in, a few homes with someone in them, and off it goes. False if nobody's free to drive. */
  private setOff(van: Van, bay: Item): boolean {
    const { sim } = this;
    const driver = this.driverFor(bay);
    if (!driver) return false;
    const homes = sim.housing.homes().filter((h) => sim.housing.residents(h).length > 0);
    const count = Math.min(homes.length, sim.rng.int(...PARCELS));
    const stops: Stop[] = [];
    for (let i = 0; i < count && homes.length; i++) {
      const home = homes.splice(sim.rng.int(0, homes.length - 1), 1)[0]!;
      const door = outsideDoor(sim, new Set([home.level.id]));
      const kerb = door && kerbOutside(sim, door.p);
      if (kerb) stops.push({ home: home.level.id, ...kerb });
    }
    if (!stops.length) return true;
    // Nearest first, and on from each to the next nearest.
    const ordered: Stop[] = [];
    let at = bay.def.p;
    while (stops.length) {
      const next = stops.sort((a, b) => manhattan(a.bay, at) - manhattan(b.bay, at)).shift()!;
      ordered.push(next);
      at = next.bay;
    }
    sim.board(driver, van.car.id, null, { level: bay.level, p: [van.car.x, van.car.y] });
    van.round = { stops: ordered, next: 0, stage: 'driving', until: 0, driver: driver.id };
    this.drive(van.car, van.round, bay);
    return true;
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

  /** The loading bays in town, a van each. */
  private bays(): Item[] {
    return this.sim.activeItems().filter((i) => i.type.loading && i.level === this.sim.traffic.level);
  }

  /** The tile in front of the bay, where the van pulls in from and backs out to: past its open end, the drivable one beyond either end. */
  private frontOf(bay: Item): Tile {
    const roads = this.sim.traffic.roads();
    const [x, y] = bay.def.p;
    const [w, h] = bay.type.size;
    const ends: Tile[] = h >= w ? [[x, y - 1], [x, y + h]] : [[x - 1, y], [x + w, y]];
    return ends.find((t) => roads?.drivable(...t)) ?? ends[0]!;
  }

  /** A driver on shift at the depot (the building nearest the bay), not out on another round: inside it, or out by the vans. */
  private driverFor(bay: Item): Person | undefined {
    const { sim } = this;
    const depot = this.depotOf(bay);
    if (!depot) return undefined;
    const driving = new Set(this.vans.map((v) => v.round?.driver));
    return sim.people.find((p) => {
      if (p.works !== depot || driving.has(p.id) || sim.phaseOf(p) !== 'work' || !sim.present(p)) return false;
      return p.level === depot || (p.level === bay.level && manhattan([Math.round(p.x), Math.round(p.y)], bay.def.p) <= NEAR_THE_VAN);
    });
  }

  /** The depot's inside: through the door of the building nearest the bay (worked out again only when the town changes). */
  private depotOf(bay: Item): string | undefined {
    const { sim } = this;
    const items = sim.activeItems();
    if (this.depots?.items !== items) this.depots = { items, of: new Map() };
    if (!this.depots.of.has(bay.index)) this.depots.of.set(bay.index, this.findDepot(bay));
    return this.depots.of.get(bay.index);
  }

  private findDepot(bay: Item): string | undefined {
    const { sim } = this;
    const buildings = sim.activeItems().filter((i) => i.level === bay.level && sim.world.portals.some((p) => [p.a, p.b].some((e) => e.level === bay.level && atDoorOf(i.def, e.p))));
    const nearest = buildings.sort((a, b) => manhattan(a.def.p, bay.def.p) - manhattan(b.def.p, bay.def.p))[0];
    if (!nearest) return undefined;
    for (const p of sim.world.portals) for (const [end, other] of [[p.a, p.b], [p.b, p.a]] as const) if (end.level === bay.level && atDoorOf(nearest.def, end.p)) return other.level;
    return undefined;
  }
}
