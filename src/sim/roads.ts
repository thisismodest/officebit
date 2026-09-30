// Driving (docs/TRAFFIC.md): the roads of the town as a map for vehicles, and
// routes along it that keep to the left and turn cleanly at junctions. Paths
// and pavements can be driven on too, slowly, when there's no other way (a
// driveway, a forecourt). A route is a list of tiles; movement.ts moves a
// vehicle along one, at its speed for the surface.
import { CATALOG } from './catalog.ts';
import { Heap, type Grid } from './grid.ts';
import { AHEAD, MOVERS, blocks, type Heading, type Moving } from './movement.ts';
import type { LevelDef, Tile } from './world.ts';

/** Floors a vehicle can drive on, and what each tile costs to route over: a path only when there's no other way. */
const FLOOR_COST: Record<string, number> = { road: 1, zebra: 1, zebraSide: 1, highway: 1, forecourt: 1, path: 8 };
/** Floors that are road proper (not a path or pavement a car's only crossing). */
export const DRIVABLE = new Set(['road', 'zebra', 'zebraSide', 'highway', 'forecourt']);
/** Route costs, on top of one per tile: a turn, a tile in the wrong lane (more road on your left: we drive on the left), and turning round. */
const TURN = 2;
const WRONG_LANE = 3;
const TURN_ROUND = 20;
/** Route cost of a tile off the road that a vehicle may use to get where it's going (pulling up onto a pitch). */
const OFF_ROAD = 4;

/** How a vehicle fits: how far its body reaches from its middle (tiles), and anywhere off the road it may go. */
export interface Fit {
  reach?: number;
  offRoad?: (x: number, y: number) => boolean;
}
const HEADINGS = Object.keys(AHEAD) as Heading[];

/** Anything that drives: a mover (movement.ts) with the tiles still ahead. Backing out of a bay, it keeps facing the way it was. */
export interface Driver extends Moving {
  path: Tile[];
}

export class RoadMap {
  private readonly w: number;
  private readonly h: number;
  private readonly floors: (string | undefined)[];
  /** Tiles with something standing on them (a lamppost, a charger, a canopy's posts): no car goes there. Bays are for cars. */
  private readonly standing: Uint8Array;

  constructor(level: LevelDef, grid: Grid) {
    [this.w, this.h] = level.size;
    this.floors = Array.from({ length: this.w * this.h }, (_, i) => level.rooms[grid.room[i]!]?.floor);
    this.standing = new Uint8Array(this.w * this.h);
    for (const f of level.furniture) {
      const type = CATALOG[f.t];
      if (!type || !blocks(type, MOVERS.car)) continue;
      const [fw, fh] = type.size;
      for (let y = f.p[1]; y < f.p[1] + fh; y++) for (let x = f.p[0]; x < f.p[0] + fw; x++) if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.standing[y * this.w + x] = 1;
    }
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  floorAt(x: number, y: number): string | undefined {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.floors[y * this.w + x] : undefined;
  }

  drivable(x: number, y: number): boolean {
    return Object.hasOwn(FLOOR_COST, this.floorAt(x, y) ?? '') && !this.standing[y * this.w + x];
  }

  /** Is this somewhere people walk (a path or pavement), where a car goes carefully? */
  footway(x: number, y: number): boolean {
    return this.floorAt(Math.round(x), Math.round(y)) === 'path';
  }

  /** The surface under a vehicle, for how fast it goes there (movement.ts): off the map, undefined. */
  surfaceAt(x: number, y: number): string | undefined {
    return this.floorAt(Math.round(x), Math.round(y));
  }

  /** Every drivable tile of a floor (say, 'road'), for picking somewhere to drive to. */
  tilesOf(floor: string): Tile[] {
    const tiles: Tile[] = [];
    this.floors.forEach((f, i) => {
      if (f === floor) tiles.push([i % this.w, Math.floor(i / this.w)]);
    });
    return tiles;
  }

  /** Driving (dx, dy) on the road here, with more road on your left: you're on the wrong side. (Forecourts and paths have no sides.) */
  private wrongLane(x: number, y: number, dx: number, dy: number): boolean {
    const onRoad = (fx: number, fy: number) => DRIVABLE.has(this.floorAt(fx, fy) ?? '') && this.floorAt(fx, fy) !== 'forecourt';
    return onRoad(x, y) && onRoad(x + dy, y - dx);
  }

  /**
   * The best way by road from one tile to another, setting off facing
   * `heading` (any way, if not given), for a vehicle of a given fit: its whole
   * body kept clear of anything standing, and off the road only where allowed.
   * Tiles after `from`, ending at `to`; null if there's no way.
   */
  route(from: Tile, to: Tile, heading?: Heading, fit: Fit = {}): Tile[] | null {
    const reach = fit.reach ?? 0;
    const clear = (x: number, y: number) => {
      for (let j = y - reach; j <= y + reach; j++) for (let i = x - reach; i <= x + reach; i++) if (this.inside(i, j) && this.standing[j * this.w + i]) return false;
      return true;
    };
    const offRoad = (x: number, y: number) => !this.drivable(x, y) && this.inside(x, y) && !!fit.offRoad?.(x, y);
    const enter = (x: number, y: number) => (this.drivable(x, y) || offRoad(x, y)) && (reach === 0 || clear(x, y));
    if (!enter(...from) || !enter(...to)) return null;
    const states = this.w * this.h * 4;
    const cost = new Float64Array(states).fill(Infinity);
    const came = new Int32Array(states).fill(-1);
    const open = new Heap();
    const tile = (x: number, y: number) => y * this.w + x;
    for (const [d, h] of HEADINGS.entries()) {
      if (heading && h !== heading) continue;
      const start = tile(...from) * 4 + d;
      cost[start] = 0;
      open.push(start, 0);
    }
    const goal = tile(...to);
    let end = -1;
    while (open.size > 0) {
      const state = open.pop();
      const at = state >> 2;
      if (at === goal) {
        end = state;
        break;
      }
      const d = state & 3;
      const x = at % this.w;
      const y = (at - x) / this.w;
      for (const [nd, h] of HEADINGS.entries()) {
        const [dx, dy] = AHEAD[h];
        const [nx, ny] = [x + dx, y + dy];
        if (!enter(nx, ny)) continue;
        const turn = nd === d ? 0 : (nd + 2) % 4 === d ? TURN_ROUND : TURN;
        const next = tile(nx, ny) * 4 + nd;
        const surface = offRoad(nx, ny) ? OFF_ROAD : FLOOR_COST[this.floorAt(nx, ny)!]!;
        const g = cost[state]! + surface + turn + (this.wrongLane(nx, ny, dx, dy) ? WRONG_LANE : 0);
        if (g >= cost[next]!) continue;
        cost[next] = g;
        came[next] = state;
        open.push(next, g);
      }
    }
    if (end < 0) return null;
    const path: Tile[] = [];
    for (let state = end; came[state] !== -1; state = came[state]!) {
      const at = state >> 2;
      path.push([at % this.w, Math.floor(at / this.w)]);
    }
    return path.reverse();
  }
}

