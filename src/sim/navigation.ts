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

  constructor(grids: ReadonlyMap<string, Grid>, portals: readonly PortalDef[]) {
    this.grids = grids;
    for (const portal of portals) {
      const i = this.anchors.length;
      this.anchors.push({ place: portal.a, partner: i + 1 }, { place: portal.b, partner: i });
    }
  }

  /** Cheap distance estimate in tiles (Manhattan within levels, via portals between them). */
  estimate(from: Place, to: Place): number {
    return this.plan(from, to)?.cost ?? Infinity;
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
