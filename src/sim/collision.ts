// Collision (docs/MOVEMENT.md#collision): the other half of movement.ts. What
// takes up space, and who's in whose way. Everything on the move, or parked, is
// a body in `Space`, each level's index of where bodies are, in two layers: on
// foot and on wheels. Fixed things (walls, furniture) are the planners'
// business, through `blocks`. `inTheWay` is the one question everything asks
// before a step: how much of it to take, from who's just in front, by the
// mover's manners (on its entry in movement.ts).
import { AHEAD, OPPOSITE, type Heading } from './movement.ts';
import type { Rect } from './world.ts';

export type Layer = 'foot' | 'wheels';

/**
 * Anything taking up space: where it is (its middle), which way it faces,
 * whether it's moving, and whether it's here at all right now (not offstage or
 * in a doorway). Bodies are live views of the people and vehicles they stand
 * for, so they're always where those are.
 */
export interface Body {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: Heading;
  readonly moving: boolean;
  readonly here: boolean;
  /** The level it's on now (bodies are found by where they were when the layer was filled, and people go through doors). */
  readonly level: string;
  /** Settled at its own spot (a desk, a seat, a bed): in nobody's way. */
  readonly settled?: boolean;
  /** The tiles it stands on, if more than the one under its middle (a parked truck: its pitch). */
  readonly rect?: Rect;
  /** How far it reaches from its middle (tiles), front and back: a bus or a food truck on the road, one. */
  readonly reach?: number;
}

/** How a mover behaves around others. */
export interface Manners {
  /** Someone just ahead (tiles, along the way): slow down within `slow`, and wait within `stop`. */
  slow: number;
  stop: number;
  /** How far to the side (tiles) someone still counts as in front. */
  width: number;
  /** Someone coming the other way: step aside to pass them (walkers), or no concern (vehicles, each in their own lane). */
  oncoming: 'pass' | 'ignore';
  /** Someone on the move crossing your way: give way (walkers; when each is in the other's way, the earlier id goes first), or no concern (vehicles). */
  crossing: 'yield' | 'ignore';
  /** How long (steps) to wait before squeezing past anyway; Infinity to wait as long as it takes. */
  patience: number;
}


/** Bodies are bucketed in square cells this many tiles across, so looking round a point reads a few buckets, not every tile. */
const CELL = 4;

/** A body, and the tile it was on when its layer was filled. */
interface Entry {
  tx: number;
  ty: number;
  body: Body;
}

/** Each level's bodies, by layer, bucketed by where they were when the layer was filled (they move less than a tile a step). */
export class Space {
  /** Layer, then level, then cell: the bodies there. */
  private readonly layers: Record<Layer, Map<string, Map<number, Entry[]>>> = { foot: new Map(), wheels: new Map() };

  /** Put a layer's bodies in (each on its level), in place of whatever was there. */
  fill(layer: Layer, bodies: Iterable<Body>): void {
    const levels = new Map<string, Map<number, Entry[]>>();
    for (const body of bodies) {
      let cells = levels.get(body.level);
      if (!cells) {
        cells = new Map();
        levels.set(body.level, cells);
      }
      const [tx, ty] = [Math.round(body.x), Math.round(body.y)];
      const cell = cellKey(Math.floor(tx / CELL), Math.floor(ty / CELL));
      const here = cells.get(cell);
      if (here) here.push({ tx, ty, body });
      else cells.set(cell, [{ tx, ty, body }]);
    }
    this.layers[layer] = levels;
  }

  /** A layer's bodies on a level within `radius` tiles (square) of a point, that are here now. */
  near(level: string, layer: Layer, x: number, y: number, radius: number): Body[] {
    const cells = this.layers[layer].get(level);
    if (!cells) return [];
    const found: Body[] = [];
    const [cx, cy] = [Math.round(x), Math.round(y)];
    const r = Math.ceil(radius) + 1;
    for (let j = Math.floor((cy - r) / CELL); j <= Math.floor((cy + r) / CELL); j++) {
      for (let i = Math.floor((cx - r) / CELL); i <= Math.floor((cx + r) / CELL); i++) {
        for (const { tx, ty, body } of cells.get(cellKey(i, j)) ?? []) {
          if (Math.abs(tx - cx) <= r && Math.abs(ty - cy) <= r && body.here && body.level === level) found.push(body);
        }
      }
    }
    return found;
  }

  /** A layer's bodies on a level that are standing still (a parked vehicle), for walkers' routes to go round. */
  still(level: string, layer: Layer): Body[] {
    return [...(this.layers[layer].get(level)?.values() ?? [])].flat().map((e) => e.body).filter((b) => b.here && !b.moving);
  }
}

/** Where `q` is from `me`, going `facing`: how far ahead, and how far to the side. */
export function relative(me: { x: number; y: number }, facing: Heading, q: { x: number; y: number }): { ahead: number; aside: number } {
  const [ux, uy] = AHEAD[facing];
  const [rx, ry] = [q.x - me.x, q.y - me.y];
  return { ahead: rx * ux + ry * uy, aside: Math.abs(rx * uy - ry * ux) };
}

/**
 * How much of its step (0 to 1) a body going `facing` takes, from `others`
 * near it, by its manners: slowing and waiting behind someone going the same
 * way or stopped in the way; passing (and saying so) someone coming the other
 * way, or paying them no mind; giving way to someone crossing, or not.
 */
export function inTheWay(me: Body, facing: Heading, others: readonly Body[], manners: Manners): { step: number; passing: boolean } {
  let step = 1;
  let passing = false;
  for (const q of others) {
    if (q.id === me.id || q.settled) continue;
    const { ahead: middles, aside } = relative(me, facing, q);
    // The gap between them: from my front to their back (a long vehicle reaches past its middle).
    const ahead = middles - (me.reach ?? 0) - (q.reach ?? 0);
    if (aside >= manners.width || middles <= 0) continue;
    if (q.moving && q.facing !== facing) {
      if (q.facing === OPPOSITE[facing]) {
        if (manners.oncoming === 'pass' && ahead < manners.slow * 2) passing = true;
        continue;
      }
      if (manners.crossing === 'ignore') continue;
      // Each in the other's way: the earlier id goes first.
      const back = relative(q, q.facing, me);
      const behind = back.ahead - (me.reach ?? 0) - (q.reach ?? 0);
      if (back.ahead > 0 && behind < manners.slow && back.aside < manners.width && me.id < q.id) continue;
    }
    if (ahead < manners.stop) step = 0;
    else if (ahead < manners.slow) step = Math.min(step, 0.5);
  }
  return { step, passing };
}

function cellKey(x: number, y: number): number {
  return (y + 1024) * 4096 + (x + 1024);
}

/** Passing someone coming the other way, each steps this far (tiles) to their left, easing in and out this much a step. */
const ASIDE = 0.3;
const EASE = 0.2;

/** A step to the left while passing someone, and back again after: `aside` eased towards where it should be. */
export function easeAside(aside: number, passing: boolean): number {
  const next = aside + ((passing ? ASIDE : 0) - aside) * EASE;
  return Math.abs(next) < 0.01 ? 0 : next;
}

/** The sideways offset (tiles) of a step to the left, facing a way: for drawing people as they pass. */
export function asideOffset(facing: Heading, aside: number): [number, number] {
  const [ux, uy] = AHEAD[facing];
  // Your left, going (ux, uy), is (uy, -ux).
  return [uy * aside, -ux * aside];
}
