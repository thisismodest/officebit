// Traffic lights (docs/TRAFFIC.md#traffic-lights): lights near each other are one junction, and the road between them
// is controlled. A vehicle about to drive into it waits unless its way has a green: east–west (the busier way, the
// longer green), amber, north–south, amber, round again. The phase comes from the clock (each junction a little out of
// step with the next), so there's nothing to save. A light shows its own road's signal (on a corner, alternate corners
// show either way).
import { hashOf } from './rng.ts';
import type { Heading } from './movement.ts';
import type { Grid } from './grid.ts';
import type { Item, Simulation } from './sim.ts';
import type { Rect, Tile } from './world.ts';

/** How long each part of the cycle lasts (ticks: six game seconds each). */
const GREEN_EW = 24;
const GREEN_NS = 14;
const AMBER = 3;
const CYCLE = GREEN_EW + AMBER + GREEN_NS + AMBER;
/** Lights this close (tiles) to another are one junction. */
const SAME_JUNCTION = 8;

export type Lamp = 'red' | 'amber' | 'green';
type Way = 'ns' | 'ew';

/** A junction under lights: the road between them, and how far its cycle is out of step. */
interface Junction {
  rect: Rect;
  lights: Item[];
  offset: number;
}

export class Signals {
  /** Not saved with the town (snapshot.ts): worked out again from the lights. */
  static readonly unsaved = ['cache'];
  private readonly sim: Simulation;
  private cache: { items: readonly Item[]; grid: Grid; junctions: Junction[] } | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Must a vehicle going `heading` wait before driving from `from` into `to`? Only at the edge of a junction under lights, on red or amber. */
  stop(from: Tile, to: Tile, heading: Heading): boolean {
    for (const j of this.junctions()) {
      if (!inside(j.rect, to) || inside(j.rect, from)) continue;
      return this.lamp(j, heading === 'up' || heading === 'down' ? 'ns' : 'ew') !== 'green';
    }
    return false;
  }

  /** What a light's showing now. */
  lampOf(item: Item): Lamp {
    const j = this.junctions().find((junction) => junction.lights.includes(item));
    return j ? this.lamp(j, this.wayOf(item)) : 'red';
  }

  private lamp(j: Junction, way: Way): Lamp {
    const t = (this.sim.tick + j.offset) % CYCLE;
    if (way === 'ew') return t < GREEN_EW ? 'green' : t < GREEN_EW + AMBER ? 'amber' : 'red';
    const ns = t - GREEN_EW - AMBER;
    return ns >= 0 && ns < GREEN_NS ? 'green' : ns >= GREEN_NS ? 'amber' : 'red';
  }

  /** The way a light faces: along the road beside it (one to its left or right runs north–south; above or below, east–west); on a corner of two, alternate corners face either way. */
  private wayOf(item: Item): Way {
    const roads = this.sim.traffic.roads();
    const [x, y] = item.def.p;
    const road = (rx: number, ry: number) => ['road', 'highway'].includes(roads?.floorAt(rx, ry) ?? '');
    const ns = road(x - 1, y) || road(x + 1, y);
    const ew = road(x, y - 1) || road(x, y + 1);
    return ns && ew ? ((x + y) % 2 === 0 ? 'ns' : 'ew') : ns ? 'ns' : 'ew';
  }

  /** The junctions: lights grouped by being near each other (two or more), each controlling the road strictly between them. */
  private junctions(): Junction[] {
    const { sim } = this;
    const items = sim.activeItems();
    const grid = sim.grids.get(sim.traffic.level ?? '');
    if (!grid) return [];
    if (this.cache?.items === items && this.cache.grid === grid) return this.cache.junctions;
    const lights = items.filter((i) => i.type.signal && i.level === sim.traffic.level);
    const groups: Item[][] = [];
    for (const light of lights) {
      const near = groups.filter((g) => g.some((o) => Math.max(Math.abs(o.def.p[0] - light.def.p[0]), Math.abs(o.def.p[1] - light.def.p[1])) <= SAME_JUNCTION));
      const merged = [light, ...near.flat()];
      for (const g of near) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
    const junctions = groups
      .filter((g) => g.length >= 2)
      .map((g): Junction => {
        const xs = g.map((i) => i.def.p[0]);
        const ys = g.map((i) => i.def.p[1]);
        const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        return { rect: [x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1], lights: g, offset: (hashOf(`${x0},${y0}`, sim.world.seed) >>> 0) % CYCLE };
      })
      .filter((j) => j.rect[2] > 0 && j.rect[3] > 0);
    this.cache = { items, grid, junctions };
    return junctions;
  }
}

const inside = ([x, y, w, h]: Rect, [tx, ty]: Tile) => tx >= x && ty >= y && tx < x + w && ty < y + h;
