// Turns furniture into drawable sprites (docs/FURNITURE.md#art). Every catalog
// type needs a painter here; see common.ts for the Painter contract.
import type { Item } from '../../sim/sim.ts';
import { hash } from '../palette.ts';
import { TILE, canvas } from '../pixels.ts';
import type { Painter, Rect } from './common.ts';
import { AIRFIELD } from './airfield.ts';
import { HOME } from './home.ts';
import { LEISURE } from './leisure.ts';
import { OFFICE } from './office.ts';
import { OUTDOOR } from './outdoor.ts';
import { SCHOOL } from './school.ts';
import { VENUE } from './venue.ts';

export const PAINTERS: Record<string, Painter> = { ...OFFICE, ...HOME, ...OUTDOOR, ...VENUE, ...SCHOOL, ...LEISURE, ...AIRFIELD };

export interface Prop {
  item: Item;
  img: HTMLCanvasElement;
  /** Night version with the windows lit, if the painter has one. */
  lit?: HTMLCanvasElement;
  /** One image per stage, for things that change as they're built. */
  stages?: HTMLCanvasElement[];
  /** Top-left draw position, in world pixels. */
  x: number;
  y: number;
  /** Draw order: people whose feet are below this line are drawn in front. */
  sortY: number;
  /** Screen that glows while in use, in world pixels. */
  screen?: Rect;
  /** Where its spotlight goes, in world pixels. */
  poster?: Rect;
}

/** Pieces that join up with their neighbours in a row (terraces): drawn as one where they meet. */
const JOINING = new Set(['terrace']);
/** Tile-sized pieces that join up with their own kind on every side (a hedge, a fence), whichever way they run. */
const TILED = new Set(['hedge', 'fence']);

export function buildProps(items: readonly Item[]): Prop[] {
  // Which joining pieces have another of their kind right up against them, either side (same row, same way round).
  const rows = items.filter((i) => JOINING.has(i.def.t) && !i.gone);
  const touching = (item: Item, side: -1 | 1) =>
    rows.some(
      (o) =>
        o !== item &&
        o.def.t === item.def.t &&
        o.def.p[1] === item.def.p[1] &&
        (o.def.faces ?? '') === (item.def.faces ?? '') &&
        (side < 0 ? o.def.p[0] + o.type.size[0] === item.def.p[0] : item.def.p[0] + item.type.size[0] === o.def.p[0]),
    );
  const tiled = new Set(items.filter((i) => TILED.has(i.def.t) && !i.gone).map((i) => `${i.def.t}:${i.def.p[0]},${i.def.p[1]}`));
  const tiledAt = (item: Item, dx: number, dy: number) => tiled.has(`${item.def.t}:${item.def.p[0] + dx},${item.def.p[1] + dy}`);
  return items.flatMap((item): Prop[] => {
    const painter = PAINTERS[item.def.t];
    if (!painter) return [];
    const w = item.type.size[0] * TILE;
    const h = item.type.size[1] * TILE;
    const seed = hash(item.def.p[0], item.def.p[1], item.index);
    const joins = JOINING.has(item.def.t)
      ? { left: touching(item, -1), right: touching(item, 1) }
      : TILED.has(item.def.t)
        ? { left: tiledAt(item, -1, 0), right: tiledAt(item, 1, 0), up: tiledAt(item, 0, -1), down: tiledAt(item, 0, 1) }
        : undefined;
    const paint = (lit: boolean, def = item.def) => {
      const { canvas: img, ctx } = canvas(w, painter.up + h + (painter.down ?? 0));
      painter.paint(ctx, w, h, painter.up, seed, def, joins);
      if (lit) painter.lit?.(ctx, w, h, painter.up, seed, def, joins);
      return img;
    };
    const x = item.def.p[0] * TILE;
    const y = item.def.p[1] * TILE - painter.up;
    const screen = painter.screen?.(w, h, painter.up);
    const poster = painter.poster?.(w, h, painter.up);
    return [
      {
        item,
        img: paint(false),
        lit: painter.lit ? paint(true) : undefined,
        stages: painter.stages
          ? Array.from({ length: painter.stages }, (_, i) => paint(false, { ...item.def, progress: i / painter.stages! }))
          : undefined,
        x,
        y,
        sortY: painter.flat ? -Infinity : (item.def.p[1] + item.type.size[1]) * TILE + (painter.sortOffset ?? 0),
        screen: screen && [x + screen[0], y + screen[1], screen[2], screen[3]],
        poster: poster && [x + poster[0], y + poster[1], poster[2], poster[3]],
      },
    ];
  });
}
