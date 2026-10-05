// Parcel Dash (docs/GAMES.md#parcel-dash): drive a parcel van round the real town and drop a parcel at each house with
// a parcel bobbing over its door. The van and the parcels are the game's own, drawn over the map: the town's story
// never knows. Hold a direction to drive; at a junction it turns the way you're pressing, and on a wide road across
// into the next lane (to get past a bus: which side of the road is up to you). Bump into a vehicle and it's a crash,
// with time added.
import type { Simulation } from '../../sim/sim.ts';
import { kerbOutside } from '../../sim/deliveries.ts';
import { outsideDoor } from '../../sim/places.ts';
import type { Tile } from '../../sim/world.ts';
import { TICKS_PER_SECOND } from '../../sim/clock.ts';
import { MOVERS, speedOn } from '../../sim/movement.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import { vehicleOrigin, vehicleSprite } from '../../render/vehicles.ts';
import { DELTA, OPPOSITE, type Dir, type Input } from '../controls.ts';

/** How many parcels a round, how fast the van goes where nothing says (tiles a second), how far from a junction's middle it can still turn, and how close to the kerb counts as there (tiles). */
const PARCELS = 3;
const SPEED = 5;
const TURN = 0.4;
const REACH = 1.3;
/** Pressing a way it can't turn yet, it drives on to a turning that way this near (tiles); further than that, it waits (unless the way it's going is held too). */
const LOOK_AHEAD = 3;
/** Houses within this many of the nearest, picked from at random. */
const CHOICE = 10;
/** Average seconds a parcel for three stars, and for two. */
const STARS: [three: number, two: number] = [20, 40];
/** How fast it moves across into the next lane (tiles a second). */
const LANE_SPEED = 4;
/** A crash: the van's half-size and how far vehicles can overlap before it counts (tiles), the seconds it adds, how long the van's stopped, how far it's knocked back, and how long before it can crash again. */
const CRASH = { van: 0.45, give: 0.2, seconds: 5, stopped: 0.8, knock: 0.5, grace: 1.5 };
/** What a crash adds to the time (s): shown in the bar. */
export const CRASH_SECONDS = CRASH.seconds;
/** Each parcel's colour, on the house and in the bar. */
export const COLOURS = ['#e94f4f', '#4f8fd6', '#f3c969', '#5fb35a'];

export interface Drop {
  home: string;
  name: string;
  /** Where the van pulls up (the kerb outside), and the door. */
  at: Tile;
  door: Tile;
  colour: string;
  done: boolean;
}

/** One of the town's vehicles, as the van sees it: its middle, which way it faces, and how far past its middle it reaches. */
export interface Vehicle {
  x: number;
  y: number;
  facing: Dir;
  reach: number;
}

export class ParcelDash {
  x: number;
  y: number;
  heading: Dir = 'right';
  /** Seconds since the start. */
  time = 0;
  readonly drops: Drop[];
  /** The parcel delivered this step, if one was; whether it crashed this step; how many crashes so far. */
  delivered: Drop | null = null;
  crashed = false;
  crashes = 0;
  /** Seconds left stopped after a crash, and before it can crash again. */
  stopped = 0;
  private grace = 0;
  private wish: Dir | null = null;
  /** The lane it's moving across into (its row going along, its column going up and down), if it is. */
  private lane: number | null = null;
  /** Up against a vehicle (it crashes once, as it touches, and can drive off). */
  private touching = false;
  private readonly drivable: (x: number, y: number) => boolean;
  /** How fast it goes on a tile (tiles a second). */
  private readonly speedAt: (x: number, y: number) => number;

  constructor(start: Tile, drops: Drop[], drivable: (x: number, y: number) => boolean, speedAt = (_x: number, _y: number) => SPEED) {
    [this.x, this.y] = start;
    this.drops = drops;
    this.drivable = drivable;
    this.speedAt = speedAt;
  }

  get done(): boolean {
    return this.drops.every((d) => d.done);
  }

  /** One to three stars, by how quickly they all went. */
  get stars(): number {
    const each = this.time / this.drops.length;
    return each <= STARS[0] ? 3 : each <= STARS[1] ? 2 : 1;
  }

  /** On by `dt` seconds. `vehicles`: the town's vehicles (where they are, which way they face, how far past its middle each reaches), to crash into. */
  step(input: Input, dt: number, vehicles: readonly Vehicle[] = []): void {
    this.delivered = null;
    this.crashed = false;
    if (this.done) return;
    this.time += dt;
    this.grace = Math.max(0, this.grace - dt);
    for (const key of input.pressed) if (key !== 'a') this.wish = key;
    if (this.stopped > 0) {
      this.stopped = Math.max(0, this.stopped - dt);
      return;
    }
    // The way you're pressing: the last pressed while it's held, or any held.
    const going = this.wish && input.held.has(this.wish) ? this.wish : ([...input.held].at(-1) ?? null);
    if (going) {
      this.turn(going);
      // On, if that's the way it's going, or there's a turning that way just ahead. Otherwise across into the next lane
      // that way, if there is one; and on as well, if the way it's going is held too.
      if (going === this.heading || this.turningAhead(going)) this.forward(this.speedAt(Math.round(this.x), Math.round(this.y)) * dt);
      else {
        this.changeLane(going);
        if (input.held.has(this.heading)) this.forward(this.speedAt(Math.round(this.x), Math.round(this.y)) * dt);
      }
    }
    this.slide(dt);
    this.bump(vehicles);
    for (const drop of this.drops) {
      if (drop.done || Math.hypot(this.x - drop.at[0], this.y - drop.at[1]) > REACH) continue;
      drop.done = true;
      this.delivered = drop;
    }
  }

  /** Round about, any time; into a side road, near enough the middle of a junction (and squared up to it). */
  private turn(to: Dir): void {
    if (to === this.heading) return;
    if (to === OPPOSITE[this.heading]) {
      this.heading = to;
      return;
    }
    const [cx, cy] = [Math.round(this.x), Math.round(this.y)];
    if (Math.abs(this.x - cx) + Math.abs(this.y - cy) > TURN || !this.opens(cx, cy, to)) return;
    [this.x, this.y] = [cx, cy];
    this.heading = to;
    this.lane = null;
  }

  /** A road off that way from a tile: going on at least two tiles, so it's a side road and not just the far lane. */
  private opens(x: number, y: number, to: Dir): boolean {
    const [dx, dy] = DELTA[to];
    return this.drivable(x + dx, y + dy) && this.drivable(x + dx * 2, y + dy * 2);
  }

  /** Across into the next lane `to` the side, if there's road there (once it's in a lane, not halfway across). */
  private changeLane(to: Dir): void {
    if (this.lane !== null) return;
    const across = this.heading === 'left' || this.heading === 'right';
    const [dx, dy] = DELTA[to];
    const [cx, cy] = [Math.round(this.x), Math.round(this.y)];
    if (!this.drivable(cx + dx, cy + dy)) return;
    this.lane = across ? cy + dy : cx + dx;
  }

  /** On across towards the lane it's moving into. */
  private slide(dt: number): void {
    if (this.lane === null) return;
    const across = this.heading === 'left' || this.heading === 'right';
    const at = across ? this.y : this.x;
    const moved = Math.sign(this.lane - at) * Math.min(Math.abs(this.lane - at), LANE_SPEED * dt);
    if (across) this.y += moved;
    else this.x += moved;
    if ((across ? this.y : this.x) === this.lane) this.lane = null;
  }

  /** Into another vehicle (each a box, its length along the way it faces and a lane wide): a crash as it touches, a moment stopped, knocked back, and time added. */
  private bump(vehicles: readonly Vehicle[]): void {
    const hit = vehicles.some((v) => {
      const along = v.facing === 'left' || v.facing === 'right';
      const [hx, hy] = along ? [0.5 + v.reach, 0.5] : [0.5, 0.5 + v.reach];
      return Math.abs(v.x - this.x) < hx + CRASH.van - CRASH.give && Math.abs(v.y - this.y) < hy + CRASH.van - CRASH.give;
    });
    const fresh = hit && !this.touching;
    this.touching = hit;
    if (!fresh || this.grace > 0) return;
    this.crashed = true;
    this.crashes++;
    this.time += CRASH.seconds;
    this.stopped = CRASH.stopped;
    this.grace = CRASH.grace;
    // Knocked back the way it came, if there's road there.
    const [dx, dy] = DELTA[OPPOSITE[this.heading]];
    const [bx, by] = [this.x + dx * CRASH.knock, this.y + dy * CRASH.knock];
    if (this.drivable(Math.round(bx), Math.round(by))) [this.x, this.y] = [bx, by];
  }

  /** Is there a turning `to` just up the road (so pressing that way early drives on to it)? */
  private turningAhead(to: Dir): boolean {
    const [dx, dy] = DELTA[this.heading];
    const [cx, cy] = [Math.round(this.x), Math.round(this.y)];
    for (let i = 0; i <= LOOK_AHEAD; i++) {
      const [x, y] = [cx + dx * i, cy + dy * i];
      if (!this.drivable(x, y)) return false;
      if (this.opens(x, y, to)) return true;
    }
    return false;
  }

  /** On along the road, stopping in the middle of the last tile before anything it can't drive on. */
  private forward(distance: number): void {
    const [dx, dy] = DELTA[this.heading];
    let [nx, ny] = [this.x + dx * distance, this.y + dy * distance];
    const [cx, cy] = [Math.round(this.x), Math.round(this.y)];
    if (!this.drivable(cx + dx, cy + dy)) {
      if (dx) nx = dx > 0 ? Math.min(nx, Math.max(this.x, cx)) : Math.max(nx, Math.min(this.x, cx));
      if (dy) ny = dy > 0 ? Math.min(ny, Math.max(this.y, cy)) : Math.max(ny, Math.min(this.y, cy));
    }
    [this.x, this.y] = [nx, ny];
  }
}

/** A round from a signpost: the van on the road nearest it, and a parcel for each of a few houses near it that the van can get to. Null with no road near, or no houses on one. */
export function plan(sim: Simulation, from: Tile, random: () => number): ParcelDash | null {
  const roads = sim.traffic.roads();
  if (!roads) return null;
  const drivable = (x: number, y: number) => roads.drivable(x, y) && roads.floorAt(x, y) !== 'path';
  // A van's own pace, as the movement engine has it (the town's van, cars and all): quicker on the highway.
  const speedAt = (x: number, y: number) => speedOn(MOVERS.van, roads.surfaceAt(x, y)) * TICKS_PER_SECOND;
  const start = nearest(from, drivable);
  if (!start) return null;
  const reached = spread(start, drivable);
  const homes = sim.housing.homes().flatMap((home) => {
    const door = outsideDoor(sim, new Set([home.level.id]));
    const kerb = door && kerbOutside(sim, door.p);
    return door && kerb && reached.has(key(kerb.bay)) ? [{ home, door: door.p, at: kerb.bay }] : [];
  });
  if (!homes.length) return null;
  const near = homes.sort((a, b) => far(a.at, start) - far(b.at, start)).slice(0, CHOICE);
  const picked = near.map((h) => ({ h, r: random() })).sort((a, b) => a.r - b.r).slice(0, PARCELS);
  const drops = picked.map(({ h }, i): Drop => ({ home: h.home.level.id, name: h.home.level.name, at: h.at, door: h.door, colour: COLOURS[i % COLOURS.length]!, done: false }));
  return new ParcelDash(start, drops, drivable, speedAt);
}

/** Over the town, in world pixels: a parcel bobbing over each house still waiting for one, a ring where to pull up, and the van. */
export function paintParcelDash(ctx: Ctx, game: ParcelDash, time: number): void {
  for (const drop of game.drops) {
    if (drop.done) continue;
    const pulse = 1 + Math.round((Math.sin(time * 6) + 1) * 1.5);
    const [ax, ay] = [drop.at[0] * TILE, drop.at[1] * TILE];
    ctx.strokeStyle = drop.colour;
    ctx.lineWidth = 2;
    ctx.strokeRect(ax - pulse, ay - pulse, TILE + pulse * 2, TILE + pulse * 2);
    const bob = Math.round(Math.sin(time * 4) * 2);
    const [bx, by] = [drop.door[0] * TILE + 3, drop.door[1] * TILE - 18 + bob];
    ctx.fillStyle = '#2a2033';
    ctx.fillRect(bx - 1, by - 1, 12, 11);
    ctx.fillStyle = drop.colour;
    ctx.fillRect(bx, by, 10, 9);
    ctx.fillStyle = '#ffffff99';
    ctx.fillRect(bx + 4, by, 2, 9);
    ctx.fillRect(bx, by + 3, 10, 2);
  }
  const sprite = vehicleSprite('van', game.heading);
  const [x, y] = vehicleOrigin(sprite, game.x, game.y, game.heading);
  // Just crashed: a shake, and a burst of pixels round it.
  const shake = game.stopped > 0 ? Math.round(Math.sin(time * 60)) : 0;
  ctx.drawImage(sprite, x + shake, y);
  if (game.stopped > 0) paintBurst(ctx, (game.x + 0.5) * TILE, (game.y + 0.2) * TILE, game.stopped);
}

/** A crash: chunky pixels flying out, orange and yellow, fading as `left` runs down. */
function paintBurst(ctx: Ctx, cx: number, cy: number, left: number): void {
  const spread = (1 - left / CRASH.stopped) * 10 + 4;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? '#f3c969' : '#e7793a';
    ctx.fillRect(Math.round(cx + Math.cos(angle) * spread) - 1, Math.round(cy + Math.sin(angle) * spread) - 1, 3, 3);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4);
}

const key = ([x, y]: Tile) => `${x},${y}`;
const far = (a: Tile, b: Tile) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** The drivable tile nearest a spot, looking a little way round it. */
function nearest([fx, fy]: Tile, drivable: (x: number, y: number) => boolean): Tile | null {
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && drivable(fx + dx, fy + dy)) return [fx + dx, fy + dy];
      }
    }
  }
  return null;
}

/** Every tile the van can get to from a start. */
function spread(start: Tile, drivable: (x: number, y: number) => boolean): Set<string> {
  const seen = new Set([key(start)]);
  const queue: Tile[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of Object.values(DELTA)) {
      const next: Tile = [x + dx, y + dy];
      if (seen.has(key(next)) || !drivable(...next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}
