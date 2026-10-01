// Boats (docs/RIVER.md): the sailing boats tied up at the jetty and the
// boating club's rowing boats, taken out on the river by friends on a boat
// trip (plans.ts). A sailing boat for three or more, a rowing boat for two;
// out from the moorings, downriver or up, and back, the friends aboard (shown
// in the boat, and following one follows the boat). A rowing boat is only seen
// while it's out: the rest of the time it's in the club.
import { MOVERS, advance, type Heading, type Moving } from './movement.ts';
import type { VehiclePose } from './food-trucks.ts';
import type { Grid } from './grid.ts';
import type { Person } from './person.ts';
import { RoadMap, WATERWAYS } from './roads.ts';
import type { Item, Simulation } from './sim.ts';
import type { Place, Tile } from './world.ts';

/** How far (tiles) a trip goes along the river before turning back. */
const TRIP_TILES: [number, number] = [20, 40];
/** Aboard a rowing boat, at most; anyone more takes a sailing boat. */
const ROWERS = 2;

interface Trip {
  item: Item;
  boat: Moving & { path: Tile[] };
  riders: string[];
  /** Where they get off again: where they got on. */
  ashore: Place;
}

export class Boats {
  private readonly sim: Simulation;
  private readonly trips: Trip[] = [];
  /** Boat-trip plans already afloat (or that found no boat). */
  private readonly launched = new Set<number>();
  private map: { grid: Grid; water: RoadMap } | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /**
   * Where a boat is: on the river (where it's got to), in its place (undefined:
   * a sailing boat on its mooring, drawn as it stands), or nowhere to be seen
   * (null: a rowing boat put away in the club).
   */
  poseOf(item: Item): VehiclePose | null | undefined {
    const trip = this.trips.find((t) => t.item === item);
    if (!trip) return item.type.boat === 'row' ? null : undefined;
    const { x, y, px, py, facing } = trip.boat;
    return { x, y, px, py, facing, moving: false, middle: [0, 0] };
  }

  /** Who's aboard a boat out on the river (for drawing them in it). */
  aboard(item: Item): Person[] {
    const trip = this.trips.find((t) => t.item === item);
    return trip ? trip.riders.map((id) => this.sim.person(id)).filter((p): p is Person => !!p) : [];
  }

  /** Every step: boat trips that have gathered set off; boats out on the river carry on, and those back put their people ashore. */
  step(): void {
    const { sim } = this;
    // Someone at the boating club's doors, going rowing: off they go in a rowing boat, on their own.
    for (const p of sim.people) {
      if (p.riding || p.intent?.kind !== 'use' || p.phase !== 'doing' || !sim.items[p.intent.item]?.type.boating) continue;
      if (!this.launch([p], { level: p.level, p: [Math.round(p.x), Math.round(p.y)] })) sim.interrupt(p);
    }
    for (const plan of sim.plans.list) {
      if (plan.activity !== 'boat' || !plan.begun || this.launched.has(plan.id)) continue;
      this.launched.add(plan.id);
      const aboard = plan.members.map((id) => sim.person(id)).filter((p): p is Person => !!p && sim.present(p) && p.level === plan.level && Math.hypot(p.x - plan.at[0], p.y - plan.at[1]) <= 3);
      this.launch(aboard, { level: plan.level, p: plan.at });
    }
    for (const trip of [...this.trips]) {
      const done = advance(trip.boat, trip.boat.path, MOVERS.boat.speed);
      for (const id of trip.riders) {
        const p = sim.person(id);
        if (p) [p.px, p.py, p.x, p.y] = [trip.boat.px, trip.boat.py, trip.boat.x, trip.boat.y];
      }
      if (!done) continue;
      for (const id of trip.riders) {
        const p = sim.person(id);
        if (p) sim.alight(p, trip.ashore, { kind: 'wander', to: trip.ashore });
      }
      this.trips.splice(this.trips.indexOf(trip), 1);
    }
  }

  /** Off on the river: a boat for the size of the party (a rowing boat for two, a sailing boat for more), out and back. False if there's no boat free, or no way. */
  launch(riders: Person[], ashore: Place): boolean {
    const { sim } = this;
    const water = this.water();
    if (!water || riders.length === 0) return false;
    const free = (kind: 'sail' | 'row') => sim.activeItems().find((i) => i.type.boat === kind && !this.trips.some((t) => t.item === i));
    const item = (riders.length > ROWERS ? free('sail') : free('row')) ?? free('sail');
    if (!item) return false;
    const home = item.def.p;
    // Downriver or up, a fair way, to the nearest open water there.
    const way = sim.rng.next() < 0.5 ? -1 : 1;
    const far = sim.rng.int(...TRIP_TILES);
    const turn = this.openWater(water, home[0] + way * far, home[1]) ?? this.openWater(water, home[0] - way * far, home[1]);
    if (!turn) return false;
    const heading: Heading = turn[0] < home[0] ? 'left' : 'right';
    const out = water.route(home, turn, heading, { mover: MOVERS.boat });
    const back = out && water.route(turn, home, undefined, { mover: MOVERS.boat });
    if (!out || !back) return false;
    const crew = riders.map((p) => p.name);
    const names = crew.length > 1 ? `${crew.slice(0, -1).join(', ')} and ${crew.at(-1)}` : crew[0];
    const sail = item.type.boat === 'sail';
    const news = `${sail ? '⛵' : '🚣'} ${names} took a ${sail ? 'sailing boat' : 'rowing boat'} out on the river`;
    for (const [i, p] of riders.entries()) sim.board(p, `boat-${item.index}`, i === 0 ? news : null);
    this.trips.push({ item, boat: { x: home[0], y: home[1], px: home[0], py: home[1], facing: heading, path: [...out, ...back] }, riders: riders.map((p) => p.id), ashore });
    return true;
  }

  /** The nearest tile of open water to a point (in the same column), if there's any. */
  private openWater(water: RoadMap, x: number, y: number): Tile | null {
    for (let d = 0; d < 6; d++) for (const ty of [y + d, y - d]) if (water.drivable(x, ty)) return [x, ty];
    return null;
  }

  /** The river, as somewhere for boats to go: rebuilt whenever the town's ground changes. */
  private water(): RoadMap | null {
    const { sim } = this;
    const level = sim.traffic.level;
    const grid = level ? sim.grids.get(level) : undefined;
    if (!level || !grid) return null;
    if (this.map?.grid !== grid) this.map = { grid, water: new RoadMap(sim.levels.get(level)!, grid, WATERWAYS) };
    return this.map.water;
  }
}
