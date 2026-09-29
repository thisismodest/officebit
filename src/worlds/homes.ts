// Home interiors (docs/BUILDINGS.md#homes), one per size of house on the town
// map: a terrace is a one-bed, a semi (`house`) a two-bed, and a detached house
// a family home with a kids' room and a study. Each returns a level plus its
// entry tile (just inside the front door) for linking to the town map.
import type { LevelDef, Tile } from '../sim/world.ts';
import { LevelBuilder } from './layout.ts';

export interface Home {
  level: LevelDef;
  entry: Tile;
  /** Where a console goes, beside the TV. */
  consoleAt: Tile;
}

/** Matches the house types on the town map. */
export type HomeStyle = 'terrace' | 'house' | 'detached';

const BEDROOM_FLOORS = ['carpetBlue', 'carpetPurple', 'carpetGreen', 'carpetGrey'];
const LIVING_FLOORS = ['wood', 'darkWood'];

export interface HomeOptions {
  /** A games console under the TV. */
  console?: boolean;
}

export function buildHome(style: HomeStyle, owner: string, name: string, variant: number, options: HomeOptions = {}): Home {
  const build = { terrace: oneBed, house: twoBed, detached: family }[style];
  const home = build(owner, name, variant);
  if (options.console) home.level.furniture.push({ t: 'console', p: home.consoleAt });
  return home;
}

/** A one-bed terrace: bedroom, kitchen along the top, sofa facing the TV. 12×9. */
function oneBed(owner: string, name: string, variant: number): Home {
  const b = new LevelBuilder(`home-${owner}`, `${name}'s house`, 'home', 12, 9)
    .room(`${owner}-home`, `${name}'s house`, [0, 0, 12, 9], pick(LIVING_FLOORS, variant), { walled: true })
    .room(`${owner}-bedroom`, 'Bedroom', [0, 0, 5, 4], pick(BEDROOM_FLOORS, variant), { walled: true })
    .room(`${owner}-kitchen`, 'Kitchen', [5, 0, 7, 3], 'tiles')
    .door([4, 2], [6, 8])
    .put('bed', 1, 1, owner)
    .put('counter', 6, 1)
    .put('stove', 7, 1)
    .put('sink', 8, 1)
    .put('fridge', 9, 1)
    .put('plant', 10, 1)
    .put('smallTable', 7, 4)
    .put('homeDesk', 9, 4, owner)
    .put('rug', 1, 5)
    .put('sofa', 2, 5)
    .put('tv', 2, 7)
    .put('petBed', 5, 7)
    .put('bookshelf', 8, 7)
    .put('plant', 10, 7);
  return { level: b.build(), entry: [6, 7], consoleAt: [4, 7] };
}

/** A two-bed semi: a double room, a small second bedroom with a desk, kitchen, and a living room. 13×10. */
function twoBed(owner: string, name: string, variant: number): Home {
  const b = new LevelBuilder(`home-${owner}`, `${name}'s house`, 'home', 13, 10)
    .room(`${owner}-home`, `${name}'s house`, [0, 0, 13, 10], pick(LIVING_FLOORS, variant), { walled: true })
    .room(`${owner}-bedroom`, 'Bedroom', [0, 0, 5, 5], pick(BEDROOM_FLOORS, variant), { walled: true })
    .room(`${owner}-spare`, 'Second bedroom', [0, 4, 5, 6], pick(BEDROOM_FLOORS, variant + 1), { walled: true })
    .room(`${owner}-kitchen`, 'Kitchen', [5, 0, 8, 3], 'tiles')
    .door([4, 2], [4, 7], [6, 9])
    .put('bed', 1, 1, owner)
    .put('homeDesk', 2, 5, owner)
    .put('singleBed', 1, 7)
    .put('counter', 6, 1)
    .put('stove', 7, 1)
    .put('sink', 8, 1)
    .put('fridge', 9, 1)
    .put('plant', 11, 1)
    .put('smallTable', 8, 4)
    .put('rug', 6, 6)
    .put('sofa', 6, 6)
    .put('armchair', 10, 6)
    .put('tv', 7, 8)
    .put('petBed', 11, 8);
  return { level: b.build(), entry: [6, 8], consoleAt: [9, 8] };
}

/** A detached family house: main bedroom, a kids' room with two beds, a study, a big kitchen-diner and living room. 16×11. */
function family(owner: string, name: string, variant: number): Home {
  const b = new LevelBuilder(`home-${owner}`, `${name}'s house`, 'home', 16, 11)
    .room(`${owner}-home`, `${name}'s house`, [0, 0, 16, 11], pick(LIVING_FLOORS, variant), { walled: true })
    .room(`${owner}-bedroom`, 'Bedroom', [0, 0, 6, 5], pick(BEDROOM_FLOORS, variant), { walled: true })
    .room(`${owner}-kids`, "Kids' room", [0, 4, 6, 7], pick(BEDROOM_FLOORS, variant + 1), { walled: true })
    .room(`${owner}-study`, 'Study', [11, 6, 5, 5], pick(BEDROOM_FLOORS, variant + 2), { walled: true })
    .room(`${owner}-kitchen`, 'Kitchen', [8, 0, 8, 3], 'tiles')
    .door([5, 2], [5, 6], [11, 8], [7, 10])
    .put('bed', 1, 1, owner)
    .put('plant', 4, 1)
    .put('singleBed', 1, 5)
    .put('singleBed', 3, 5)
    .put('bookshelf', 2, 9)
    .put('homeDesk', 12, 7, owner)
    .put('bookshelf', 13, 9)
    .put('counter', 9, 1)
    .put('stove', 10, 1)
    .put('sink', 11, 1)
    .put('fridge', 12, 1)
    .put('counter', 13, 1)
    .put('plant', 14, 1)
    .put('smallTable', 10, 4)
    .put('rug', 6, 6)
    .put('sofa', 6, 6)
    .put('armchair', 9, 6)
    .put('tv', 6, 8)
    .put('petBed', 9, 9);
  return { level: b.build(), entry: [7, 9], consoleAt: [8, 8] };
}

function pick<T>(items: readonly T[], i: number): T {
  return items[Math.abs(i) % items.length]!;
}
