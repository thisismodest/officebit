// Public venues (docs/BUILDINGS.md#venues): places anyone awake can drop into.
// Some are workplaces too (the shop).
// Each returns its level and entry tile (just inside the front door).
import type { LevelDef, Tile } from '../sim/world.ts';
import { LevelBuilder } from './layout.ts';

export interface Venue {
  level: LevelDef;
  entry: Tile;
}

/** A 24/7 diner, 20×12: a long counter with stools, booths, a jukebox, a till, and a grill for a cook it takes on. */
export function buildDiner(id: string, name: string): Venue {
  const b = new LevelBuilder(id, name, 'venue', 20, 12)
    .room(id, name, [0, 0, 20, 12], 'checker', { walled: true })
    .door([10, 11])
    // Behind the counter
    .put('counter', 1, 1).put('sink', 2, 1).put('counter', 3, 1).put('counter', 4, 1)
    .put('till', 7, 1)
    .put('grill', 9, 1)
    .put('dinerCounter', 2, 3).put('dinerCounter', 6, 3)
    // Booths: three down the left, two up the right
    .put('booth', 2, 7).put('booth', 5, 7).put('booth', 8, 7)
    .put('booth', 13, 2).put('booth', 16, 2)
    .put('jukebox', 18, 7)
    .put('plant', 13, 9).put('plant', 18, 10);
  return { level: b.build(), entry: [10, 10] };
}

/** The boating club's clubhouse, 12×8: the rowing boats on their racks along the back wall, a corner for a cup of tea, and lockers. */
export function buildClubhouse(id: string, name: string): Venue {
  const b = new LevelBuilder(id, name, 'venue', 12, 8)
    .room(id, name, [0, 0, 12, 8], 'wood', { walled: true })
    .door([6, 7])
    .put('boatRack', 1, 1)
    .put('boatRack', 5, 1)
    .put('counter', 9, 1)
    .put('sink', 10, 1)
    .put('smallTable', 8, 4)
    .put('sofa', 8, 6)
    .put('bookshelf', 1, 5)
    .put('plant', 10, 5);
  return { level: b.build(), entry: [6, 6] };
}

/** The leisure centre, 22×14: a pool hall, a gym with treadmills and weights, and a foyer with the reception desk and a drinks cooler. */
export function buildLeisure(id: string, name: string): Venue {
  const b = new LevelBuilder(id, name, 'venue', 22, 14)
    .room(id, name, [0, 0, 22, 14], 'stone', { walled: true })
    .room(`${id}-pool`, 'Pool hall', [0, 0, 14, 9], 'tiles', { walled: true })
    .room(`${id}-gym`, 'Gym', [13, 0, 9, 9], 'carpetBlue', { walled: true })
    .door([7, 8], [17, 8], [11, 13])
    .put('pool', 2, 2)
    .put('plant', 1, 7)
    .put('plant', 12, 1)
    .row('treadmill', [15, 17, 19], 1)
    .put('weightBench', 15, 5)
    .put('weightBench', 18, 5)
    .put('reception', 9, 10)
    .put('cooler', 2, 10)
    .put('sofa', 15, 11)
    .put('plant', 1, 12)
    .put('plant', 20, 12);
  return { level: b.build(), entry: [11, 12] };
}

/** A hangar, 18×12: the plane in for a service, a workbench and tool chests along the wall, and a corner with a desk and a sofa for the crew between flights. */
export function buildHangar(id: string, name: string): Venue {
  const b = new LevelBuilder(id, name, 'venue', 18, 12)
    .room(id, name, [0, 0, 18, 12], 'concrete', { walled: true })
    .door([8, 11])
    .put('plane', 3, 3)
    .put('stand', 3, 3)
    .put('workbench', 11, 1)
    .put('toolChest', 15, 1)
    .put('toolChest', 16, 1)
    .put('opsDesk', 12, 6)
    .put('sofa', 13, 9)
    .put('cooler', 16, 6)
    .put('plant', 1, 10);
  return { level: b.build(), entry: [8, 10] };
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
