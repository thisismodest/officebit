// Routes across levels (docs/BUILDINGS.md). Portals (doors, stairs) join
// levels; a route is a chain of legs, each walked with A* on one level.
import { manhattan } from './geometry.ts';
import type { Grid } from './grid.ts';
import type { Place, PortalDef, Tile } from './world.ts';

export interface Leg {
  level: string;
  /** Tiles to walk, excluding the starting tile. */
  tiles: Tile[];
}

/** Ticks spent passing through a portal (climbing stairs, opening a door). */
export const PORTAL_TICKS = 8;
/** Route cost of passing through a portal, in tiles. */
const PORTAL_COST = 6;

interface Anchor {
  place: Place;
  /** The anchor on the far side of the portal. */
  partner: number;
}

export class Navigator {
  private readonly grids: ReadonlyMap<string, Grid>;
  private readonly anchors: Anchor[] = [];
  /**
   * The cheapest way from each anchor (about to go through it) to each other
   * anchor (about to go through that), across any number of levels: worked
   * out once, so a distance estimate is a few lookups, not a search.
   */
  private between: Float64Array | null = null;
  /** Anchors on each level. */
  private readonly onLevel = new Map<string, number[]>();

  constructor(grids: ReadonlyMap<string, Grid>, portals: readonly PortalDef[]) {
    this.grids = grids;
    for (const portal of portals) {
      const i = this.anchors.length;
      this.anchors.push({ place: portal.a, partner: i + 1 }, { place: portal.b, partner: i });
    }
    for (const [i, anchor] of this.anchors.entries()) this.onLevel.set(anchor.place.level, [...(this.onLevel.get(anchor.place.level) ?? []), i]);
  }

  /**
   * Cheap distance estimate in tiles (Manhattan within levels, via portals
   * between them): the same as the route's cost would be, from the table of
   * the ways between portals.
   */
  estimate(from: Place, to: Place): number {
    if (from.level === to.level) return manhattan(from.p, to.p);
    const between = this.table();
    const n = this.anchors.length;
    let best = Infinity;
    for (const i of this.onLevel.get(from.level) ?? []) {
      const start = manhattan(from.p, this.anchors[i]!.place.p);
      if (start >= best) continue;
      for (let j = 0; j < n; j++) {
        const arrive = this.anchors[this.anchors[j]!.partner]!.place;
        if (arrive.level !== to.level) continue;
        const cost = start + between[i * n + j]! + PORTAL_COST + manhattan(arrive.p, to.p);
        if (cost < best) best = cost;
      }
    }
    return best;
  }

  /** The table of cheapest ways between anchors (Floyd–Warshall over going through one and walking to the next on the far side). */
  private table(): Float64Array {
    if (this.between) return this.between;
    const n = this.anchors.length;
    const d = new Float64Array(n * n).fill(Infinity);
    for (let i = 0; i < n; i++) {
      d[i * n + i] = 0;
      const arrive = this.anchors[this.anchors[i]!.partner]!.place;
      for (const k of this.onLevel.get(arrive.level) ?? []) {
        if (k === this.anchors[i]!.partner) continue;
        const c = PORTAL_COST + manhattan(arrive.p, this.anchors[k]!.place.p);
        if (c < d[i * n + k]!) d[i * n + k] = c;
      }
    }
    for (let k = 0; k < n; k++)
      for (let i = 0; i < n; i++) {
        const ik = d[i * n + k]!;
        if (ik === Infinity) continue;
        for (let j = 0; j < n; j++) {
          const c = ik + d[k * n + j]!;
          if (c < d[i * n + j]!) d[i * n + j] = c;
        }
      }
    this.between = d;
    return d;
  }

  /** Full walkable route, or null if there's no way there. */
  route(from: Place, to: Place): Leg[] | null {
    const plan = this.plan(from, to);
    if (!plan) return null;
    const legs: Leg[] = [];
    let start = from;
    for (const anchor of plan.via) {
      // Walk to this anchor, then step through to its partner.
      const tiles = this.walk(start, anchor.place);
      if (!tiles) return null;
      legs.push({ level: start.level, tiles });
      start = this.anchors[anchor.partner]!.place;
    }
    const tiles = this.walk(start, to);
    if (!tiles) return null;
    legs.push({ level: start.level, tiles });
    return legs;
  }

  private walk(from: Place, to: Place): Tile[] | null {
    return this.grids.get(from.level)?.findPath(from.p, to.p) ?? null;
  }

  /** Dijkstra over portal anchors. `via` lists the entry anchor of each portal used. */
  private plan(from: Place, to: Place): { cost: number; via: Anchor[] } | null {
    if (from.level === to.level) return { cost: manhattan(from.p, to.p), via: [] };

    const n = this.anchors.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    this.anchors.forEach((anchor, i) => {
      if (anchor.place.level === from.level) cost[i] = manhattan(from.p, anchor.place.p);
    });

    let best = Infinity;
    let bestExit = -1;
    for (;;) {
      let current = -1;
      for (let i = 0; i < n; i++) if (!done[i] && cost[i]! < (current < 0 ? Infinity : cost[current]!)) current = i;
      if (current < 0 || cost[current]! >= best) break;
      done[current] = 1;

      // Step through the portal, arriving at its partner.
      const through = this.anchors[current]!.partner;
      const arrive = this.anchors[through]!.place;
      const base = cost[current]! + PORTAL_COST;
      if (arrive.level === to.level && base + manhattan(arrive.p, to.p) < best) {
        best = base + manhattan(arrive.p, to.p);
        bestExit = current;
      }
      // From the partner, walk to any other anchor on that level.
      this.anchors.forEach((next, i) => {
        if (done[i] || i === through || next.place.level !== arrive.level) return;
        const c = base + manhattan(arrive.p, next.place.p);
        if (c < cost[i]!) {
          cost[i] = c;
          prev[i] = current;
        }
      });
    }

    if (bestExit < 0) return null;
    const via: Anchor[] = [];
    for (let i = bestExit; i >= 0; i = prev[i]!) via.unshift(this.anchors[i]!);
    return { cost: best, via };
  }
}
