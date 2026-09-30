// Turns furniture into drawable sprites (docs/FURNITURE.md#art). Every catalog
// type needs a painter here; see common.ts for the Painter contract.
import type { Item } from '../../sim/sim.ts';
import { hash } from '../palette.ts';
import { TILE, canvas } from '../pixels.ts';
import type { Painter, Rect } from './common.ts';
import { HOME } from './home.ts';
import { OFFICE } from './office.ts';
import { OUTDOOR } from './outdoor.ts';
import { SCHOOL } from './school.ts';
import { VENUE } from './venue.ts';

export const PAINTERS: Record<string, Painter> = { ...OFFICE, ...HOME, ...OUTDOOR, ...VENUE, ...SCHOOL };

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

export function buildProps(items: readonly Item[]): Prop[] {
  return items.flatMap((item): Prop[] => {
    const painter = PAINTERS[item.def.t];
    if (!painter) return [];
    const w = item.type.size[0] * TILE;
    const h = item.type.size[1] * TILE;
    const seed = hash(item.def.p[0], item.def.p[1], item.index);
    const paint = (lit: boolean, def = item.def) => {
      const { canvas: img, ctx } = canvas(w, painter.up + h + (painter.down ?? 0));
      painter.paint(ctx, w, h, painter.up, seed, def);
      if (lit) painter.lit?.(ctx, w, h, painter.up, seed, def);
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
