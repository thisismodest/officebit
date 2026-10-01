// Movement (docs/MOVEMENT.md): how anything gets about. What each kind of
// mover is (how fast it goes, on each surface, and what gets in its way), and
// one stepper that moves any of them along a route: people and pets walking, babies crawling, cars and
// food trucks driving. Where they may go, and the routes, come from the
// planners (grid.ts and navigation.ts on foot, roads.ts on wheels).
import type { FurnitureType } from "./catalog.ts";
import type { Manners } from "./collision.ts";
import type { Tile } from "./world.ts";

export type Heading = "up" | "right" | "down" | "left";
/** One tile's step in each direction, and the way back. */
export const AHEAD: Record<Heading, Tile> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
export const OPPOSITE: Record<Heading, Heading> = { up: "down", right: "left", down: "up", left: "right" };

/** A kind of mover: whether it goes on foot or on wheels, its speed (tiles per step), and on particular surfaces (floors), if different. */
export interface Mover {
  on: "foot" | "wheels";
  speed: number;
  surfaces?: Record<string, number>;
  /** Off the map (a vehicle driving on or off it, where the highway goes). */
  offMap?: number;
  /** How far its body reaches from its middle (tiles), for keeping all of it clear of things: 0 for anything a tile or less. */
  reach?: number;
  /** How it behaves around others (collision.ts). */
  manners: Manners;
}

/** Walking pace, a baby's crawl as a share of it, and hurrying to catch someone up. */
const WALK = 0.2;
const CRAWL = 0.3;
const HURRY = 1.5;
/** Tiles per step for vehicles: in town, on the highway, and creeping over a path or pavement. */
const TOWN = 0.45;
const HIGHWAY = 0.9;
const CREEP = 0.2;

/** On foot: slow for someone just ahead, wait right behind them, step aside for someone coming the other way, give way to someone crossing, and after a second or so squeeze past. */
const WALKING: Manners = { slow: 0.9, stop: 0.55, width: 0.5, oncoming: "pass", crossing: "yield", patience: 12 };
/** On wheels: keep this far (tiles) behind the vehicle in front, each in its own lane, give way at junctions, and wait as long as it takes. */
const DRIVING: Manners = { slow: 1.6, stop: 1.6, width: 0.5, oncoming: "ignore", crossing: "junction", patience: Infinity };

export const MOVERS = {
  walker: { on: "foot", speed: WALK, manners: WALKING },
  crawler: { on: "foot", speed: WALK * CRAWL, manners: WALKING },
  hurrying: { on: "foot", speed: WALK * HURRY, manners: WALKING },
  car: { on: "wheels", speed: TOWN, surfaces: { highway: HIGHWAY, path: CREEP }, offMap: HIGHWAY, manners: DRIVING },
  // A food truck: a car's pace, three tiles wide.
  truck: { on: "wheels", speed: TOWN, surfaces: { highway: HIGHWAY, path: CREEP }, offMap: HIGHWAY, reach: 1, manners: DRIVING },
  // A bus: a car's pace, three tiles long.
  bus: { on: "wheels", speed: TOWN, surfaces: { highway: HIGHWAY, path: CREEP }, offMap: HIGHWAY, reach: 1, manners: DRIVING }
} satisfies Record<string, Mover>;

/**
 * Does a piece of furniture stand in a mover's way? On foot, anything solid
 * does (a desk, a tree, a lamppost). On wheels, anything standing on the
 * ground at all, except the places vehicles are meant to stop: parking bays
 * and food-truck pitches. A catalog type can say otherwise (`blocks`).
 */
export function blocks(type: FurnitureType, mover: Mover): boolean {
  const own = type.blocks?.[mover.on];
  if (own !== undefined) return own;
  return mover.on === "foot" ? !!type.solid : !type.parking && !type.street;
}

/** How fast a mover goes on a surface (a floor id, or undefined off the map). */
export function speedOn(mover: Mover, floor: string | undefined): number {
  if (floor === undefined) return mover.offMap ?? mover.speed;
  return mover.surfaces?.[floor] ?? mover.speed;
}

/** Anything that moves: where it is, where it was a step ago (for drawing in between), and which way it faces. */
export interface Moving {
  x: number;
  y: number;
  px: number;
  py: number;
  facing: Heading;
  /** Backing up: it keeps facing the way it was. */
  reversing?: boolean;
}

/** Which way a step from one point to the next goes. */
export function headingOf(dx: number, dy: number, otherwise: Heading): Heading {
  if (dx === 0 && dy === 0) return otherwise;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

/**
 * Move `distance` tiles along `path` (tile to tile, eating the path as it
 * goes; across then along, on the way to a tile that's off both ways). Faces
 * the way it's going, unless it's reversing. Returns true once it's at the end.
 */
export function advance(m: Moving, path: Tile[], distance: number): boolean {
  m.px = m.x;
  m.py = m.y;
  let budget = distance;
  while (budget > 0 && path.length > 0) {
    const [tx, ty] = path[0]!;
    const dx = tx - m.x;
    const dy = ty - m.y;
    if (!m.reversing) m.facing = headingOf(dx, dy, m.facing);
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget) {
      [m.x, m.y] = [tx, ty];
      path.shift();
      budget -= dist;
      if (m.reversing) m.reversing = false;
    } else {
      m.x += Math.sign(dx) * Math.min(budget, Math.abs(dx));
      m.y += Math.sign(dy) * Math.max(0, budget - Math.abs(dx));
      budget = 0;
    }
  }
  return path.length === 0;
}

