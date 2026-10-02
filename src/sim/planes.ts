// The airfields (docs/TRAFFIC.md#planes): little airfields round town, each a runway, a stand and a gate, and a plane
// that flies round them in a loop like a bus, by day, leaving each a little while after it lands. It taxis out, rolls
// down the runway, takes off, flies straight to the next, lands and taxis to the stand. Anyone with a long way across
// town that a flight cuts right down may fly (when the pilot's on: no pilot, no flight): they walk to the gate nearest
// them, wait (not for ever), fly (out of sight inside, staying aboard for any stops on the way), and walk on from the
// gate nearest where they're going.
import { TICKS_PER_DAY, TICKS_PER_HOUR, hourOf } from './clock.ts';
import type { VehiclePose } from './food-trucks.ts';
import { atDoorOf, manhattan } from './geometry.ts';
import type { Grid } from './grid.ts';
import { MOVERS, advance, speedOn, type Moving } from './movement.ts';
import type { Leg } from './navigation.ts';
import { faceTowards, type Intent, type Person } from './person.ts';
import { kindOf } from './roles.ts';
import type { Item, Simulation } from './sim.ts';
import type { Place, Rect, Tile } from './world.ts';

/** The first and last departures of the day (hours), and how long the plane stays on its stand after it lands (game minutes). */
const DAY: [from: number, to: number] = [8, 20.5];
const TURNAROUND = 20;
/** A walk through town at least this long (tiles) might be worth a flight, if the walks to and from the gates save this share of it. */
const FLY_FROM = 70;
const SAVES = 0.5;
/** How long anyone waits at a gate (game minutes) before walking instead. */
const MOST_WAIT = 40;
/** How far past the end of a runway (tiles) the plane's climbed to its full height (and starts coming down to land). */
const CLIMB = 8;
/** Who flies: grown-ups and children who live in town, as for the bus. */
const FLYERS = new Set(['employee', 'family', 'staff', 'child', 'resident']);
const JOURNEYS = new Set<Intent['kind']>(['use', 'work', 'hustle', 'wander', 'play', 'sleep']);
const TICKS_PER_MINUTE = TICKS_PER_HOUR / 60;
/** How near the gate (tiles) the pilot has to be to get aboard, and how long before a flight (game minutes) they head out to it. */
const BOARD_REACH = 2;
const PILOT_READY = 20;
/** A hangar this near a field's gate (tiles, along and across) is its hangar. */
const HANGAR_NEAR = 30;
/** What a passenger is riding (`p.riding`): the plane. */
export const PLANE = 'plane';

/** An airfield: its gate, the stand the plane parks on, and its runway. */
interface Field {
  gate: Item;
  stand: Item;
  runway: Rect;
  /** The hangar's inside (a level), where the crew wait between flights, if the field has one. */
  hangar?: string;
}

interface Flight {
  pose: Moving;
  path: Tile[];
  /** The field it's flying to (as the fields were when it took off). */
  to: Field;
  /** Who's flying it. */
  pilot: string;
}

/** A passenger: the gate they're flying to (an item), and what they're off to do after. */
interface Rider {
  id: string;
  to: number;
  after: Intent;
}

/** Where the plane is, and the height it's at: 0 on the ground, 1 at full height. */
export interface PlanePose extends VehiclePose {
  up: number;
}

export class Planes {
  /** Not saved with the town (snapshot.ts): worked out again when needed. */
  static readonly unsaved = ['cache'];
  /** How long (ticks) anyone waits at a gate before walking instead. */
  readonly patience = MOST_WAIT * TICKS_PER_MINUTE;
  private readonly sim: Simulation;
  private flight: Flight | null = null;
  /** Who's aboard, flying or on a stand between flights (staying on for a stop that isn't theirs). */
  private readonly passengers: Rider[] = [];
  private nextFlight = -1;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Where the plane is in the air (or rolling on a runway), or undefined on its stand (drawn where it stands). */
  poseOf(item: Item): PlanePose | undefined {
    const flight = this.flight;
    if (!flight || item !== this.plane()) return undefined;
    const { x, y, px, py, facing } = flight.pose;
    return { x, y, px, py, facing, moving: false, middle: [0, 0], up: this.height(Math.round(x + 2), Math.round(y + 1)) };
  }

  /** Who's aboard the plane, the pilot first if it's flying (for the click card, and following them follows the plane). */
  aboard(): string[] {
    return [...(this.flight ? [this.flight.pilot] : []), ...this.passengers.map((r) => r.id)];
  }

  /**
   * Where the pilot waits for the plane, on shift: at a field with a hangar, there (their workplace, kept up to date as
   * the plane goes round); at one without, by its gate. Null while it's flying (they're aboard), or with no plane.
   */
  crewPost(): Place | null {
    const plane = this.plane();
    const fields = this.fields();
    if (!plane || this.flight) return null;
    const field = fields[this.fieldAt(plane, fields)];
    const due = this.nextFlight >= 0 && this.nextFlight - this.sim.tick <= PILOT_READY * TICKS_PER_MINUTE;
    return field && (due || !field.hangar) ? { level: field.gate.level, p: this.waitAt(field.gate) } : null;
  }

  /** Every step: the plane takes off on time, flies, and lands; its passengers go with it. */
  step(): void {
    const { sim } = this;
    const plane = this.plane();
    const fields = this.fields();
    if (!plane || fields.length < 2) return;
    const flight = this.flight;
    if (flight) {
      const level = sim.levels.get(plane.level)!;
      const grid = sim.grids.get(plane.level)!;
      const [cx, cy] = [Math.round(flight.pose.x + 2), Math.round(flight.pose.y + 1)];
      const floor = grid.inBounds(cx, cy) ? level.rooms[grid.roomAt(cx, cy)]?.floor : undefined;
      const done = advance(flight.pose, flight.path, speedOn(MOVERS.plane, floor));
      for (const id of [flight.pilot, ...this.passengers.map((r) => r.id)]) {
        const p = sim.person(id);
        if (p) [p.px, p.py, p.x, p.y] = [flight.pose.px + 2, flight.pose.py + 1, flight.pose.x + 2, flight.pose.y + 1];
      }
      if (done) this.land(plane, flight, fields);
      return;
    }
    const at = this.fieldAt(plane, fields);
    if (at < 0) return;
    // On the stand: anyone staying aboard is in it; the pilot's workplace is this field's hangar, if it has one.
    const [mx, my] = middleOf(plane);
    for (const r of this.passengers) {
      const p = sim.person(r.id);
      if (p) [p.px, p.py, p.x, p.y] = [mx, my, mx, my];
    }
    const hangar = fields[at]!.hangar;
    if (hangar) for (const p of sim.people) if (p.flies && p.works !== hangar) p.works = hangar;
    if (this.nextFlight < 0) this.nextFlight = nextDeparture(sim.tick);
    // Nearly time: the pilot's called out to the plane (from the hangar, or wherever they are in town).
    const pilot = sim.people.find((p) => p.flies && this.onDuty(p, fields[at]!));
    if (pilot && this.nextFlight - sim.tick <= PILOT_READY * TICKS_PER_MINUTE) this.callOut(pilot, fields[at]!);
    if (sim.tick >= this.nextFlight) this.takeOff(plane, fields, at);
  }

  /** Off to the gate if they're not there yet (and not on their way): is the pilot by the plane, ready to board? */
  private callOut(pilot: Person, field: Field): boolean {
    const gate = { level: field.gate.level, p: this.waitAt(field.gate) };
    if (pilot.level === gate.level && Math.hypot(pilot.x - gate.p[0], pilot.y - gate.p[1]) <= BOARD_REACH) return true;
    // Off for a food shop: back after (the plane waits).
    if (pilot.intent?.kind === 'use' && this.sim.items[pilot.intent.item]?.type.groceries) return false;
    const going = pilot.intent?.kind === 'wander' && pilot.intent.to.level === gate.level && pilot.intent.to.p.join() === gate.p.join();
    if (!going) this.sim.walkOn(pilot, { kind: 'wander', to: gate });
    return false;
  }

  /**
   * Would `p` fly for this, rather than walk? If the walk through town is long, the gates nearest either end cut it
   * right down, and the plane's leaving from that gate soon enough: the journey, by air.
   */
  consider(p: Person, intent: Intent, route: readonly Leg[]): Intent | null {
    const { sim } = this;
    if (sim.brisk || !JOURNEYS.has(intent.kind) || p.species !== 'human' || !FLYERS.has(kindOf(p))) return null;
    const leg = route.find((l) => l.level === sim.traffic.level);
    if (!leg || leg.tiles.length < FLY_FROM) return null;
    const fields = this.fields();
    if (fields.length < 2 || !this.plane()) return null;
    const [start, end] = [leg.tiles[0]!, leg.tiles.at(-1)!];
    const nearest = (t: Tile) => fields.reduce((best, f) => (manhattan(this.waitAt(f.gate), t) < manhattan(this.waitAt(best.gate), t) ? f : best));
    const [from, to] = [nearest(start), nearest(end)];
    if (from === to) return null;
    const walk = manhattan(start, this.waitAt(from.gate)) + manhattan(this.waitAt(to.gate), end);
    if (walk > leg.tiles.length * (1 - SAVES)) return null;
    // The plane's calling there soon: on its stand there leaving before long, or the next stop on its way round.
    const plane = this.plane()!;
    const at = this.flight ? fields.findIndex((f) => f.gate === this.flight!.to.gate) : this.fieldAt(plane, fields);
    const here = fields.indexOf(from);
    const soon = this.nextFlight < 0 || this.nextFlight - sim.tick <= this.patience * 0.75;
    const calling = this.flight ? at === here : (at === here || (at + 1) % fields.length === here) && soon;
    if (!calling) return null;
    return { kind: 'fly', from: from.gate.index, to: to.gate.index, after: intent };
  }

  /** Where someone waiting for the plane goes: the gate's bench if there's room, otherwise beside it. */
  waitingPlace(p: Person, intent: Extract<Intent, { kind: 'fly' }>): Place {
    const gate = this.sim.items[intent.from]!;
    return this.sim.claim(p, intent.from) ?? { level: gate.level, p: this.waitAt(gate) };
  }

  /** Waiting: looking out at the stand, for the plane. */
  lookOut(p: Person, intent: Extract<Intent, { kind: 'fly' }>): void {
    const field = this.fields().find((f) => f.gate.index === intent.from);
    if (field) faceTowards(p, ...field.stand.def.p);
  }

  /** The plane: the first in town. */
  private plane(): Item | undefined {
    return this.sim.activeItems().find((i) => i.type.airfield === 'plane' && i.level === this.sim.traffic.level);
  }

  /** The airfields, in a loop round the middle of them: each gate, with the stand nearest it and the runway nearest that (the whole strip, however it was drawn). Worked out again only when the town changes. */
  private fields(): Field[] {
    const { sim } = this;
    const town = sim.traffic.level;
    const level = town ? sim.levels.get(town) : undefined;
    const grid = town ? sim.grids.get(town) : undefined;
    const items = sim.activeItems();
    if (!level || !grid) return [];
    if (this.cache?.grid === grid && this.cache.items === items) return this.cache.fields;
    const here = items.filter((i) => i.level === town);
    const stands = here.filter((i) => i.type.airfield === 'stand');
    const runway = (x: number, y: number) => grid.inBounds(x, y) && level.rooms[grid.roomAt(x, y)]?.floor === 'runway';
    const tiles: Tile[] = [];
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (runway(x, y)) tiles.push([x, y]);
    const gates = here.filter((i) => i.type.airfield === 'gate');
    const [cx, cy] = [gates.reduce((s, g) => s + g.def.p[0], 0) / (gates.length || 1), gates.reduce((s, g) => s + g.def.p[1], 0) / (gates.length || 1)];
    const fields = gates
      .sort((a, b) => Math.atan2(a.def.p[1] - cy, a.def.p[0] - cx) - Math.atan2(b.def.p[1] - cy, b.def.p[0] - cx))
      .flatMap((gate): Field[] => {
        if (!stands.length || !tiles.length) return [];
        const stand = stands.reduce((a, b) => (manhattan(a.def.p, gate.def.p) <= manhattan(b.def.p, gate.def.p) ? a : b));
        const start = tiles.reduce((a, b) => (manhattan(a, stand.def.p) <= manhattan(b, stand.def.p) ? a : b));
        return [{ gate, stand, runway: strip(start, runway), hangar: this.hangarNear(gate.def.p) }];
      });
    this.cache = { grid, items, fields };
    return fields;
  }
  private cache: { grid: Grid; items: readonly Item[]; fields: Field[] } | null = null;

  /** Which field the plane's standing at (on its stand), or -1. */
  private fieldAt(plane: Item, fields: Field[]): number {
    return fields.findIndex((f) => f.stand.def.p[0] === plane.def.p[0] && f.stand.def.p[1] === plane.def.p[1]);
  }

  /** Time to go: everyone waiting at the gate aboard (for anywhere else on the round), and off to the next field. */
  private takeOff(plane: Item, fields: Field[], at: number): void {
    const { sim } = this;
    const from = fields[at]!;
    const to = fields[(at + 1) % fields.length]!;
    // No pilot here, on shift: no flight (and passengers wait, or give up and walk). In the News once a day.
    const pilot = sim.people.find((p) => p.flies && this.onDuty(p, from));
    if (!pilot) {
      this.nextFlight = nextDeparture(sim.tick + TURNAROUND * TICKS_PER_MINUTE);
      const day = Math.floor(sim.tick / TICKS_PER_DAY);
      if (this.grounded !== day) sim.log(`✈️ No flight from ${from.gate.def.label ?? 'the airfield'}: the pilot isn't in`, []);
      this.grounded = day;
      return;
    }
    // Not by the plane yet: the plane waits for them (they board from the gate, like everyone).
    if (!this.callOut(pilot, from)) return;
    const aboard = { level: plane.level, p: middleOf(plane) };
    sim.board(pilot, PLANE, null, aboard);
    const gates = new Set(fields.map((f) => f.gate.index));
    for (const p of sim.people) {
      const intent = p.intent;
      if (intent?.kind !== 'fly' || intent.from !== from.gate.index || intent.to === intent.from || !gates.has(intent.to) || p.phase !== 'doing' || p.riding) continue;
      this.passengers.push({ id: p.id, to: intent.to, after: intent.after });
      sim.board(p, PLANE, `✈️ ${p.name} flew to ${sim.items[intent.to]?.def.label ?? 'the other airfield'}`, aboard);
    }
    // Middle of the plane: straight off the stand onto the runway, along it to the far end, then down it towards where
    // it's going, up and over, down on the far runway, rolled out, back along it and straight onto the stand.
    const [fx, fy] = middleOf(from.stand);
    const [tx, ty] = middleOf(to.stand);
    const [away, toward] = endsToward(from.runway, [tx, ty]);
    const [touch, rollTo] = endsToward(to.runway, [fx, fy]).reverse() as [Tile, Tile];
    const onto = (stand: Tile, end: Tile, runway: Rect): Tile => (eastWest(runway) ? [stand[0], end[1]] : [end[0], stand[1]]);
    const course = [[fx, fy], onto([fx, fy], away, from.runway), away, toward, touch, rollTo, onto([tx, ty], rollTo, to.runway), [tx, ty]] as Tile[];
    const path = course.slice(1).flatMap((t, i) => line(course[i]!, t)).map(([x, y]): Tile => [x - 2, y - 1]);
    const [x, y] = plane.def.p;
    this.flight = { pose: { x, y, px: x, py: y, facing: 'right' }, path, to, pilot: pilot.id };
    this.nextFlight = -1;
  }

  /** On the next stand: the plane parks; whoever's flying here gets off at the gate (anyone going further stays aboard), and so does the pilot, till the next flight. */
  private land(plane: Item, flight: Flight, fields: Field[]): void {
    const { sim } = this;
    this.flight = null;
    sim.moveItem(plane, flight.to.stand.def.p);
    const gate = { level: flight.to.gate.level, p: this.waitAt(flight.to.gate) };
    const gates = new Set(fields.map((f) => f.gate.index));
    // Off here: those flying here, and anyone whose gate isn't on the round any more.
    for (const r of [...this.passengers]) {
      if (r.to !== flight.to.gate.index && gates.has(r.to)) continue;
      this.passengers.splice(this.passengers.indexOf(r), 1);
      const p = sim.person(r.id);
      if (p) sim.alight(p, gate, r.after);
    }
    const pilot = sim.person(flight.pilot);
    if (pilot) {
      if (flight.to.hangar) pilot.works = flight.to.hangar;
      sim.alight(pilot, gate, { kind: 'wander', to: gate });
    }
    this.nextFlight = nextDeparture(sim.tick + TURNAROUND * TICKS_PER_MINUTE);
  }

  /** Is the pilot in for this field's flight: on shift, and in its hangar or out in town (on their way to the plane, which waits for them)? */
  private onDuty(p: Person, field: Field): boolean {
    const { sim } = this;
    if (sim.phaseOf(p) !== 'work' || !sim.present(p)) return false;
    return p.level === field.hangar || p.level === field.gate.level;
  }
  private grounded = -1;

  /** The inside of the hangar nearest a tile, through its door. */
  private hangarNear(at: Tile): string | undefined {
    const { sim } = this;
    const town = sim.traffic.level;
    const hangars = sim.activeItems().filter((i) => i.level === town && i.def.t === 'hangar');
    const hangar = hangars.sort((a, b) => manhattan(a.def.p, at) - manhattan(b.def.p, at))[0];
    if (!hangar || manhattan(hangar.def.p, at) > HANGAR_NEAR) return undefined;
    for (const portal of sim.world.portals) {
      for (const [end, other] of [[portal.a, portal.b], [portal.b, portal.a]] as const) if (end.level === town && atDoorOf(hangar.def, end.p)) return other.level;
    }
    return undefined;
  }

  /** How high the plane is over a tile: on the ground over a runway or concrete (its apron), climbing to full height within a few tiles of one. */
  private height(x: number, y: number): number {
    const ground = (this.sim.levels.get(this.sim.traffic.level ?? '')?.rooms ?? []).filter((r) => r.floor === 'runway' || r.floor === 'forecourt').map((r) => r.rect);
    const off = Math.min(...ground.map(([rx, ry, rw, rh]) => Math.max(rx - x, x - (rx + rw - 1), ry - y, y - (ry + rh - 1), 0)));
    return Math.min(1, off / CLIMB);
  }

  /** Where people wait at a gate: in front of it, on the concrete. */
  private waitAt(gate: Item): Tile {
    return [gate.def.p[0] + 1, gate.def.p[1] + 1];
  }
}

/** The first tick from `tick` a flight may leave: then, by day; otherwise the first flight of the morning. */
export function nextDeparture(tick: number): number {
  const hour = hourOf(tick);
  if (hour >= DAY[0] && hour <= DAY[1]) return tick;
  const wait = (DAY[0] - hour + 24) % 24;
  return tick + Math.ceil(wait * TICKS_PER_HOUR);
}

/** The runway joined up with a tile, as the rectangle round it. */
function strip([sx, sy]: Tile, runway: (x: number, y: number) => boolean): Rect {
  const seen = new Set([`${sx},${sy}`]);
  const queue: Tile[] = [[sx, sy]];
  let [x0, y0, x1, y1] = [sx, sy, sx, sy];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (seen.has(`${nx},${ny}`) || !runway(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** A runway's two ends, along its middle. */
function ends([x, y, w, h]: Rect): [Tile, Tile] {
  return w >= h ? [[x, y + Math.floor(h / 2)], [x + w - 1, y + Math.floor(h / 2)]] : [[x + Math.floor(w / 2), y], [x + Math.floor(w / 2), y + h - 1]];
}

/** A runway's ends: the one away from `toward`, then the one nearer it. */
function endsToward(runway: Rect, toward: Tile): [Tile, Tile] {
  const [a, b] = ends(runway);
  return manhattan(a, toward) > manhattan(b, toward) ? [a, b] : [b, a];
}

const middleOf = (item: Item): Tile => [item.def.p[0] + 2, item.def.p[1] + 1];
/** Does a runway run east–west (its ends on one row)? */
const eastWest = ([, , w, h]: Rect) => w >= h;

/** The tiles along a straight line from one tile to another (not including the first): across first, then down. */
function line([ax, ay]: Tile, [bx, by]: Tile): Tile[] {
  const tiles: Tile[] = [];
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let s = 1; s <= steps; s++) tiles.push([Math.round(ax + ((bx - ax) * s) / steps), Math.round(ay + ((by - ay) * s) / steps)]);
  return tiles;
}
