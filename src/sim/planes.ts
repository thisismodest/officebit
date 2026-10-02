// The airfields (docs/TRAFFIC.md#planes): little airfields either side of town, each a runway, a stand and a gate, and a
// plane that flies between them like a bus, by day: from the first on the hour, from the next on the half hour. It
// taxis out, rolls down the runway, takes off, flies straight there, lands and taxis to the stand. Anyone with a long
// way across town that a flight cuts right down may fly: they walk to the gate nearest them, wait (not for ever), fly
// (out of sight inside), and walk on from the other gate.
import { TICKS_PER_HOUR, hourOf } from './clock.ts';
import type { VehiclePose } from './food-trucks.ts';
import { manhattan } from './geometry.ts';
import type { Grid } from './grid.ts';
import { MOVERS, advance, speedOn, type Moving } from './movement.ts';
import type { Leg } from './navigation.ts';
import { faceTowards, type Intent, type Person } from './person.ts';
import { kindOf } from './roles.ts';
import type { Item, Simulation } from './sim.ts';
import type { Place, Rect, Tile } from './world.ts';

/** The first and last departures of the day (hours), and the minutes past each hour that each airfield's flight leaves. */
const DAY: [from: number, to: number] = [7, 21];
const MINUTES_APART = 30;
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
/** What a passenger is riding (`p.riding`): the plane. */
export const PLANE = 'plane';

/** An airfield: its gate, the stand the plane parks on, and its runway. */
interface Field {
  gate: Item;
  stand: Item;
  runway: Rect;
}

interface Flight {
  pose: Moving;
  path: Tile[];
  /** The field it's flying to (an index into the fields as they were when it took off), and who's aboard. */
  to: Field;
  riders: { id: string; after: Intent }[];
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

  /** Who's aboard the plane (for the click card, and following them follows the plane). */
  aboard(): string[] {
    return this.flight?.riders.map((r) => r.id) ?? [];
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
      for (const r of flight.riders) {
        const p = sim.person(r.id);
        if (p) [p.px, p.py, p.x, p.y] = [flight.pose.px + 2, flight.pose.py + 1, flight.pose.x + 2, flight.pose.y + 1];
      }
      if (done) this.land(plane, flight);
      return;
    }
    const at = this.fieldAt(plane, fields);
    if (at < 0) return;
    if (this.nextFlight < 0) this.nextFlight = departure(sim.tick, at);
    if (sim.tick >= this.nextFlight) this.takeOff(plane, fields, at);
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
    // Leaving from there soon enough to be worth the wait.
    const leaves = departure(sim.tick, fields.indexOf(from));
    if (leaves - sim.tick > this.patience * 0.75) return null;
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

  /** The airfields, west to east: each gate, with the stand nearest it and the runway nearest that (the whole strip, however it was drawn). Worked out again only when the town changes. */
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
    const fields = here
      .filter((i) => i.type.airfield === 'gate')
      .sort((a, b) => a.def.p[0] - b.def.p[0])
      .flatMap((gate): Field[] => {
        if (!stands.length || !tiles.length) return [];
        const stand = stands.reduce((a, b) => (manhattan(a.def.p, gate.def.p) <= manhattan(b.def.p, gate.def.p) ? a : b));
        const start = tiles.reduce((a, b) => (manhattan(a, stand.def.p) <= manhattan(b, stand.def.p) ? a : b));
        return [{ gate, stand, runway: strip(start, runway) }];
      });
    this.cache = { grid, items, fields };
    return fields;
  }
  private cache: { grid: Grid; items: readonly Item[]; fields: Field[] } | null = null;

  /** Which field the plane's standing at (on its stand), or -1. */
  private fieldAt(plane: Item, fields: Field[]): number {
    return fields.findIndex((f) => f.stand.def.p[0] === plane.def.p[0] && f.stand.def.p[1] === plane.def.p[1]);
  }

  /** Time to go: everyone waiting at the gate aboard, and off to the next field round. */
  private takeOff(plane: Item, fields: Field[], at: number): void {
    const { sim } = this;
    const from = fields[at]!;
    const to = fields[(at + 1) % fields.length]!;
    const riders: Flight['riders'] = [];
    for (const p of sim.people) {
      const intent = p.intent;
      if (intent?.kind !== 'fly' || intent.from !== from.gate.index || intent.to !== to.gate.index || p.phase !== 'doing' || p.riding) continue;
      riders.push({ id: p.id, after: intent.after });
      sim.board(p, PLANE, `✈️ ${p.name} flew to ${to.gate.def.label ?? 'the other airfield'}`);
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
    this.flight = { pose: { x, y, px: x, py: y, facing: 'right' }, path, to, riders };
    this.nextFlight = -1;
  }

  /** On the far stand: the plane parks, and its passengers get off at the gate and go on their way. */
  private land(plane: Item, flight: Flight): void {
    const { sim } = this;
    this.flight = null;
    sim.moveItem(plane, flight.to.stand.def.p);
    for (const r of flight.riders) {
      const p = sim.person(r.id);
      if (p) sim.alight(p, { level: flight.to.gate.level, p: this.waitAt(flight.to.gate) }, r.after);
    }
  }

  /** How high the plane is over a tile: on the ground over a runway or an apron, climbing to full height within a few tiles of one. */
  private height(x: number, y: number): number {
    const ground = (this.sim.levels.get(this.sim.traffic.level ?? '')?.rooms ?? []).filter((r) => r.floor === 'runway' || r.floor === 'apron').map((r) => r.rect);
    const off = Math.min(...ground.map(([rx, ry, rw, rh]) => Math.max(rx - x, x - (rx + rw - 1), ry - y, y - (ry + rh - 1), 0)));
    return Math.min(1, off / CLIMB);
  }

  /** Where people wait at a gate: in front of it, on the apron. */
  private waitAt(gate: Item): Tile {
    return [gate.def.p[0] + 1, gate.def.p[1] + 1];
  }
}

/** The tick the next flight leaves field `i` (the first on the hour, the next on the half hour…), by day. */
export function departure(tick: number, i: number): number {
  const minute = (i * MINUTES_APART) % 60;
  const now = hourOf(tick) * 60;
  for (let m = Math.floor(now) + 1; m <= now + 24 * 60; m++) {
    const hour = Math.floor(m / 60) % 24;
    if (m % 60 === minute && hour >= DAY[0] && hour <= DAY[1]) return tick + (m - now) * TICKS_PER_MINUTE;
  }
  return tick + 24 * TICKS_PER_HOUR;
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
