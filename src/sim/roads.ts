// Driving (docs/TRAFFIC.md): the roads of the town as a map for vehicles, and
// routes along it that keep to the left and turn cleanly at junctions. Paths
// and pavements can be driven on too, slowly, when there's no other way (a
// driveway, a forecourt). A route is a list of tiles; movement.ts moves a
// vehicle along one, at its speed for the surface.
import { CATALOG } from './catalog.ts';
import { Heap, type Grid } from './grid.ts';
import { AHEAD, MOVERS, blocks, type Heading, type Mover, type Moving } from './movement.ts';
import type { FurnitureDef, LevelDef, Tile } from './world.ts';

/** Floors a vehicle can drive on, and what each tile costs to route over: a path only when there's no other way. */
const FLOOR_COST: Record<string, number> = { road: 1, zebra: 1, zebraSide: 1, bridge: 1, bridgeSide: 1, highway: 1, overpass: 1, forecourt: 1, path: 8 };
/** Floors that are road proper (not a path or pavement a car's only crossing). */
export const DRIVABLE = new Set(['road', 'zebra', 'zebraSide', 'bridge', 'bridgeSide', 'highway', 'overpass', 'forecourt']);

/** Somewhere to route over: what each floor costs to cross (any other floor is off it), whether it has lanes (we drive on the left), and whose way furniture may stand in. */
export interface Network {
  costs: Record<string, number>;
  lanes: boolean;
  mover: Mover;
}
/** The roads, for cars, trucks and buses. */
export const ROADS: Network = { costs: FLOOR_COST, lanes: true, mover: MOVERS.car };
/** The river, for boats: open water (under bridges too), no lanes, and the shallows only at a pinch. */
export const WATERWAYS: Network = { costs: { water: 1, bridge: 1, bridgeSide: 1, shallows: 6 }, lanes: false, mover: MOVERS.boat };
/** Route costs, on top of one per tile: a turn, a tile in the wrong lane (more road on your left: we drive on the left), and turning round. */
const TURN = 2;
const WRONG_LANE = 3;
const TURN_ROUND = 100;
/** Pulling across into the other lane (a quarter-turn onto road that runs out within a few tiles): dearer than a turn, so it's done only to get out of the wrong lane. */
const LANE_CHANGE = 12;
/** How a drive remembers its last turn (none; clockwise one or two tiles ago; anticlockwise one or two tiles ago). */
const MEMORY = 5;
/** How far (tiles) a bus stop's shelter may stand back from the road it serves. */
const STOP_REACH = 3;
/** Route cost of a tile off the road that a vehicle may use to get where it's going (pulling up onto a pitch). */
const OFF_ROAD = 4;

/** How a vehicle fits: how far its body reaches from its middle (tiles), and anywhere off the road it may go. */
/**
 * What a drive needs to know. The vehicle (a car unless said) decides how it
 * drives, by its size: its reach keeps all of it clear, and turning round in
 * the road costs it more the bigger it is (so it goes round the block, or a
 * turning circle, where it can). Nothing drives on paths or pavements, but a
 * car going up or down a driveway (a drive that starts or ends on a path).
 */
export interface Fit {
  mover?: Mover;
  /** Ground it may drive over besides the roads (a food truck's pitch, and the pavement in front of it). */
  offRoad?: (x: number, y: number) => boolean;
  /** Arrive facing this way (a bus pulling up at a stop, along the kerb). */
  arrive?: Heading;
}

/** What turning right round in the road costs a vehicle, in tiles' worth of driving: more, the bigger it is. Two quarter-turns the same way close together cost as much. */
export function turnRoundCost(mover: Mover): number {
  return TURN_ROUND * (1 + (mover.reach ?? 0));
}
const HEADINGS = Object.keys(AHEAD) as Heading[];

/** Somewhere to drive to: any of these tiles, arriving facing this way if it matters. */
export interface Goal {
  tiles: readonly Tile[];
  arrive?: Heading;
}

/** A drive found: its tiles (after where it set off), and what it costs (tiles' worth of driving, turns and all). */
export interface Drive {
  path: Tile[];
  cost: number;
}

/** Anything that drives: a mover (movement.ts) with the tiles still ahead. Backing out of a bay, it keeps facing the way it was. */
export interface Driver extends Moving {
  path: Tile[];
}

export class RoadMap {
  /** Not saved with the town (snapshot.ts): made again on the next search. */
  static readonly unsaved = ['scratch'];
  private readonly w: number;
  private readonly h: number;
  private readonly floors: (string | undefined)[];
  /** Tiles with something standing on them (a lamppost, a charger, a canopy's posts), and bays: no route goes through them. */
  private readonly standing: Uint8Array;

  private scratch: { cost: Float64Array; came: Int32Array } | null = null;
  private readonly network: Network;

  constructor(level: LevelDef, grid: Grid, network: Network = ROADS) {
    this.network = network;
    [this.w, this.h] = level.size;
    this.floors = Array.from({ length: this.w * this.h }, (_, i) => level.rooms[grid.room[i]!]?.floor);
    this.standing = new Uint8Array(this.w * this.h);
    for (const f of level.furniture) {
      const type = CATALOG[f.t];
      // Bays too: a car only ever pulls into one at the end of its drive (added after the route), never drives through.
      if (!type || (!blocks(type, network.mover) && !type.parking)) continue;
      const [fw, fh] = type.size;
      for (let y = f.p[1]; y < f.p[1] + fh; y++) for (let x = f.p[0]; x < f.p[0] + fw; x++) if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.standing[y * this.w + x] = 1;
    }
  }

  private fingerprint: number | undefined;

  /** A fingerprint of where vehicles can go (every tile's floor cost, and what stands in the way): the same for two maps they'd drive alike, so work done on one (a bus route) holds for the other. */
  get signature(): number {
    if (this.fingerprint === undefined) {
      let h = 2166136261;
      for (let i = 0; i < this.floors.length; i++) {
        const floor = this.floors[i];
        const cost = floor !== undefined && Object.hasOwn(this.network.costs, floor) ? this.network.costs[floor]! : 0;
        h = Math.imul(h ^ (this.standing[i] ? 255 : cost), 16777619);
      }
      this.fingerprint = h >>> 0;
    }
    return this.fingerprint;
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  floorAt(x: number, y: number): string | undefined {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.floors[y * this.w + x] : undefined;
  }

  drivable(x: number, y: number): boolean {
    return Object.hasOwn(this.network.costs, this.floorAt(x, y) ?? '') && !this.standing[y * this.w + x];
  }

  /** Is this somewhere people walk (a path or pavement), where a car goes carefully? */
  footway(x: number, y: number): boolean {
    return this.floorAt(Math.round(x), Math.round(y)) === 'path';
  }

  /** The surface under a vehicle, for how fast it goes there (movement.ts): off the map, undefined. */
  surfaceAt(x: number, y: number): string | undefined {
    return this.floorAt(Math.round(x), Math.round(y));
  }

  /** Where a bus stop's bus pulls up: the nearest road (within a few tiles) straight out from the middle of its shelter; null if it isn't beside one. */
  stopBay(stop: FurnitureDef): Tile | null {
    const [x, y] = [stop.p[0] + 1, stop.p[1]];
    for (let r = 1; r <= STOP_REACH; r++)
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const [tx, ty] = [x + dx * r, y + dy * r];
        if (this.floorAt(tx, ty) === 'road' && this.drivable(tx, ty)) return [tx, ty];
      }
    return null;
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
    if (!this.network.lanes) return false;
    const onRoad = (fx: number, fy: number) => DRIVABLE.has(this.floorAt(fx, fy) ?? '') && this.floorAt(fx, fy) !== 'forecourt';
    return onRoad(x, y) && onRoad(x + dy, y - dx);
  }

  /**
   * The best way by road from one tile to another, setting off facing
   * `heading` (any way, if not given), for a vehicle of a given fit: its whole
   * body kept clear of anything standing, and off the road only where allowed.
   * `to` may be several tiles (the width of a road, either lane), to end at
   * whichever comes best. Tiles after `from`, ending there; null if there's no way.
   */
  route(from: Tile, to: Tile | readonly Tile[], heading?: Heading, fit: Fit = {}): Tile[] | null {
    const tiles: readonly Tile[] = typeof to[0] === 'number' ? [to as Tile] : (to as readonly Tile[]);
    return this.routes(from, [{ tiles, arrive: fit.arrive }], heading, fit)[0]?.path ?? null;
  }

  /** The best way to each of several places at once (one search, for working out a bus route): each drive and what it costs, or null where there's no way. */
  routes(from: Tile, goals: readonly Goal[], heading?: Heading, fit: Omit<Fit, 'arrive'> = {}): (Drive | null)[] {
    const found: (Drive | null)[] = goals.map(() => null);
    const mover: Mover = fit.mover ?? MOVERS.car;
    const reach = mover.reach ?? 0;
    const turnRound = turnRoundCost(mover);
    const clear = (x: number, y: number) => {
      for (let j = y - reach; j <= y + reach; j++) for (let i = x - reach; i <= x + reach; i++) if (this.inside(i, j) && this.standing[j * this.w + i]) return false;
      return true;
    };
    // Off paths and pavements, but for any ground it's let onto; and for a car, when it's going up (or coming down) a
    // driveway: a path's where it starts or ends. Never across the pavement to cut a corner.
    const driveway = reach === 0 && [from, ...goals.flatMap((g) => g.tiles)].some((t) => this.floorAt(...t) === 'path');
    const road = (x: number, y: number) => this.drivable(x, y) && !(this.floorAt(x, y) === 'path' && !driveway && !fit.offRoad?.(x, y));
    const offRoad = (x: number, y: number) => !this.drivable(x, y) && this.inside(x, y) && !!fit.offRoad?.(x, y);
    const enter = (x: number, y: number) => (road(x, y) || offRoad(x, y)) && (reach === 0 || clear(x, y));
    if (!enter(...from)) return found;
    const tile = (x: number, y: number) => y * this.w + x;
    // Which goals each tile ends; a goal none of whose tiles can be driven onto is never found.
    const ending = new Map<number, number[]>();
    let left = 0;
    for (const [i, goal] of goals.entries()) {
      const tiles = goal.tiles.filter((t) => enter(...t));
      if (tiles.length) left++;
      for (const t of tiles) ending.set(tile(...t), [...(ending.get(tile(...t)) ?? []), i]);
    }
    if (!left) return found;
    // Each state remembers the last turn for a couple of tiles: two quarter-turns the same way that close
    // together are turning round too (into a side road's mouth, or halfway round a circle, and straight back out).
    const memory = MEMORY;
    // The search's scratch space, kept between searches (it's the whole map, every heading, every memory).
    const states = this.w * this.h * 4 * memory;
    if (this.scratch?.cost.length !== states) this.scratch = { cost: new Float64Array(states), came: new Int32Array(states) };
    const { cost, came } = this.scratch;
    cost.fill(Infinity);
    came.fill(-1);
    const open = new Heap();
    const stateOf = (at: number, d: number, m: number) => (at * 4 + d) * memory + m;
    const pathTo = (end: number): Tile[] => {
      const path: Tile[] = [];
      for (let state = end; came[state] !== -1; state = came[state]!) {
        const at = Math.floor(state / memory / 4);
        path.push([at % this.w, Math.floor(at / this.w)]);
      }
      return path.reverse();
    };
    for (const [d, h] of HEADINGS.entries()) {
      if (heading && h !== heading) continue;
      const start = stateOf(tile(...from), d, 0);
      cost[start] = 0;
      open.push(start, 0);
    }
    while (open.size > 0 && left > 0) {
      const state = open.pop();
      const m = state % memory;
      const d = Math.floor(state / memory) % 4;
      const at = Math.floor(state / memory / 4);
      for (const i of ending.get(at) ?? []) {
        const arrive = goals[i]!.arrive;
        if (found[i] || (arrive !== undefined && HEADINGS[d] !== arrive)) continue;
        found[i] = { path: pathTo(state), cost: cost[state]! };
        left--;
      }
      const x = at % this.w;
      const y = (at - x) / this.w;
      for (const [nd, h] of HEADINGS.entries()) {
        const [dx, dy] = AHEAD[h];
        const [nx, ny] = [x + dx, y + dy];
        if (!enter(nx, ny)) continue;
        // A quarter-turn clockwise (right) or anticlockwise (left), and whether it follows one the same way just now.
        const clockwise = nd === (d + 1) % 4;
        const anticlockwise = nd === (d + 3) % 4;
        const again = (clockwise && (m === 1 || m === 2)) || (anticlockwise && (m === 3 || m === 4));
        const hop = nd !== d && [2, 3].some((k) => !road(x + dx * k, y + dy * k));
        const turn = nd === d ? 0 : (nd + 2) % 4 === d || again ? turnRound : hop ? LANE_CHANGE : TURN;
        const nm = clockwise ? 1 : anticlockwise ? 3 : m === 1 ? 2 : m === 3 ? 4 : 0;
        const next = stateOf(tile(nx, ny), nd, nm);
        const surface = offRoad(nx, ny) ? OFF_ROAD : this.network.costs[this.floorAt(nx, ny)!]!;
        const g = cost[state]! + surface + turn + (this.wrongLane(nx, ny, dx, dy) ? WRONG_LANE : 0);
        if (g >= cost[next]!) continue;
        cost[next] = g;
        came[next] = state;
        open.push(next, g);
      }
    }
    return found;
  }
}

