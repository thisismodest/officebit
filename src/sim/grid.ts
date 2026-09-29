// One level's tile grid: walls, furniture footprints, rooms, and A* (docs/BUILDINGS.md).
import { CATALOG } from './catalog.ts';
import type { LevelDef, RoomDef, Tile } from './world.ts';

const DIRS: readonly Tile[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * How much stepping onto a floor costs, relative to a pavement. People take the
 * cheapest route, not the shortest, so outdoors they keep to the paths and
 * only cut across roads and grass when it really saves them a walk. Nobody
 * walks on the highway.
 */
const WALK_COST: Record<string, number> = { path: 1, zebra: 1, zebraSide: 1, forecourt: 1, road: 3, grass: 4, highway: Infinity };

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly wall: Uint8Array;
  readonly blocked: Uint8Array;
  /** Innermost room per tile (index into level.rooms), or -1. */
  readonly room: Int16Array;
  /** Cost of stepping onto each tile (1 for anything not in WALK_COST). */
  readonly cost: Float32Array;

  constructor(level: LevelDef) {
    const [w, h] = level.size;
    this.w = w;
    this.h = h;
    this.wall = new Uint8Array(w * h);
    this.blocked = new Uint8Array(w * h);
    this.room = new Int16Array(w * h).fill(-1);
    this.cost = new Float32Array(w * h).fill(1);

    // Larger rooms first, so inner rooms claim their tiles.
    const order = level.rooms
      .map((room, index) => ({ room, index }))
      .sort((a, b) => area(b.room) - area(a.room));
    for (const { room, index } of order) {
      const [rx, ry, rw, rh] = room.rect;
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          if (!this.inBounds(x, y)) continue;
          this.room[this.i(x, y)] = index;
          const edge = x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1;
          if (room.walled && edge) this.wall[this.i(x, y)] = 1;
        }
      }
    }
    for (let i = 0; i < w * h; i++) this.cost[i] = WALK_COST[level.rooms[this.room[i]!]?.floor ?? ''] ?? 1;
    for (const [x, y] of level.doors) {
      if (this.inBounds(x, y)) this.wall[this.i(x, y)] = 0;
    }
    this.blocked.set(this.wall);
    for (let i = 0; i < w * h; i++) if (this.cost[i] === Infinity) this.blocked[i] = 1;

    for (const item of level.furniture) {
      const type = CATALOG[item.t];
      if (!type?.solid) continue;
      const [fw, fh] = type.size;
      for (let y = item.p[1]; y < item.p[1] + fh; y++) {
        for (let x = item.p[0]; x < item.p[0] + fw; x++) {
          if (this.inBounds(x, y)) this.blocked[this.i(x, y)] = 1;
        }
      }
    }
    // Spots inside a solid footprint stay reachable (the pillow end of a bed).
    for (const item of level.furniture) {
      const type = CATALOG[item.t];
      if (!type?.solid) continue;
      for (const [dx, dy] of type.spots) {
        const inside = dx >= 0 && dy >= 0 && dx < type.size[0] && dy < type.size[1];
        if (inside) this.blocked[this.i(item.p[0] + dx, item.p[1] + dy)] = 0;
      }
    }
  }

  i(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  walkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.blocked[this.i(x, y)] === 0;
  }

  roomAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.room[this.i(x, y)]! : -1;
  }

  /** 4-directional A* over walking costs (see WALK_COST). Returns tiles after `from`, ending at `to`; [] if already there; null if unreachable. */
  findPath(from: Tile, to: Tile): Tile[] | null {
    const [tx, ty] = to;
    if (!this.walkable(tx, ty)) return null;
    const start = this.i(from[0], from[1]);
    const goal = this.i(tx, ty);
    if (start === goal) return [];

    const cost = new Float64Array(this.w * this.h).fill(Infinity);
    const came = new Int32Array(this.w * this.h).fill(-1);
    const open = new Heap();
    cost[start] = 0;
    open.push(start, heuristic(from[0], from[1], tx, ty));

    while (open.size > 0) {
      const current = open.pop();
      if (current === goal) break;
      const cx = current % this.w;
      const cy = (current - cx) / this.w;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.walkable(nx, ny)) continue;
        const next = this.i(nx, ny);
        const g = cost[current]! + this.cost[next]!;
        if (g >= cost[next]!) continue;
        cost[next] = g;
        came[next] = current;
        open.push(next, g + heuristic(nx, ny, tx, ty));
      }
    }

    if (came[goal] === -1) return null;
    const path: Tile[] = [];
    for (let node = goal; node !== start; node = came[node]!) {
      path.push([node % this.w, Math.floor(node / this.w)]);
    }
    return path.reverse();
  }
}

function area(room: RoomDef): number {
  return room.rect[2] * room.rect[3];
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Binary min-heap keyed on priority, with insertion order breaking ties so paths are deterministic. */
export class Heap {
  private nodes: number[] = [];
  private keys: number[] = [];
  private seq: number[] = [];
  private counter = 0;

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.keys.push(priority);
    this.seq.push(this.counter++);
    this.up(this.nodes.length - 1);
  }

  pop(): number {
    const top = this.nodes[0]!;
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.nodes.pop();
    this.keys.pop();
    this.seq.pop();
    this.down(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.keys[a]! < this.keys[b]! || (this.keys[a] === this.keys[b] && this.seq[a]! < this.seq[b]!);
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b]!, this.nodes[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.seq[a], this.seq[b]] = [this.seq[b]!, this.seq[a]!];
  }

  private up(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private down(i: number): void {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let min = i;
      if (l < this.nodes.length && this.less(l, min)) min = l;
      if (r < this.nodes.length && this.less(r, min)) min = r;
      if (min === i) return;
      this.swap(i, min);
      i = min;
    }
  }
}
