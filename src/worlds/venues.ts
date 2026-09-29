// Public venues (docs/BUILDINGS.md#venues): places anyone awake can drop into.
// Some are workplaces too (the shop).
// Each returns its level and entry tile (just inside the front door).
import type { LevelDef, Tile } from '../sim/world.ts';
import { LevelBuilder } from './layout.ts';

export interface Venue {
  level: LevelDef;
  entry: Tile;
}

/** A 24/7 diner, 20×12: a long counter with stools, booths, a jukebox, a till. */
export function buildDiner(id: string, name: string): Venue {
  const b = new LevelBuilder(id, name, 'venue', 20, 12)
    .room(id, name, [0, 0, 20, 12], 'checker', { walled: true })
    .door([10, 11])
    // Behind the counter
    .put('counter', 1, 1).put('sink', 2, 1).put('counter', 3, 1).put('counter', 4, 1)
    .put('till', 7, 1)
    .put('dinerCounter', 2, 3).put('dinerCounter', 6, 3)
    // Booths: three down the left, two up the right
    .put('booth', 2, 7).put('booth', 5, 7).put('booth', 8, 7)
    .put('booth', 13, 2).put('booth', 16, 2)
    .put('jukebox', 18, 7)
    .put('plant', 13, 9).put('plant', 18, 10);
  return { level: b.build(), entry: [10, 10] };
}

/** A small supermarket, 16×12: three aisles, fruit and veg, chillers, three checkouts. Also a workplace. */
export function buildShop(id: string, name: string, staff: string[]): Venue {
  const b = new LevelBuilder(id, name, 'venue', 16, 12)
    .room(id, name, [0, 0, 16, 12], 'stone', { walled: true })
    .door([8, 11])
    .row('shelf', [2, 6, 10], 2)
    .row('shelf', [2, 6, 10], 5)
    .put('produce', 13, 2)
    .put('chiller', 13, 5)
    .desks('checkout', [[2, 8], [5, 8], [11, 8]], staff)
    .put('plant', 14, 10)
    .put('plant', 1, 10);
  return { level: b.build(), entry: [8, 10] };
}
