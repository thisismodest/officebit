// The primary school (docs/BUILDINGS.md#schools): a classroom, a canteen and a
// playground. Pupils have their own desks; the teacher works from the front.
import type { LevelDef, Tile } from '../sim/world.ts';
import { LevelBuilder } from './layout.ts';

export interface School {
  level: LevelDef;
  entry: Tile;
}

/** Pupil desks, two rows of four either side of the aisle. */
const DESKS: Tile[] = [5, 7].flatMap((y) => [2, 4, 8, 10].map((x): Tile => [x, y]));

/** A 24×16 primary school. `pupils` get a desk each, front row first. */
export function buildSchool(id: string, name: string, pupils: string[]): School {
  const b = new LevelBuilder(id, name, 'school', 24, 16)
    .room(id, name, [0, 0, 24, 16], 'concrete', { walled: true })
    .room(`${id}-classroom`, 'Classroom', [0, 0, 13, 10], 'carpetGreen', { walled: true })
    .room(`${id}-canteen`, 'Canteen', [13, 0, 11, 10], 'tiles', { walled: true })
    .room(`${id}-playground`, 'Playground', [0, 10, 24, 6], 'concrete')
    .door([13, 5], [6, 9], [18, 9], [12, 15])
    // Classroom
    .put('blackboard', 5, 1)
    .put('teacherDesk', 5, 3)
    // For a classroom assistant, if the school takes one on.
    .put('laptopDesk', 9, 3)
    .desks('schoolDesk', DESKS, pupils)
    .put('bookshelf', 1, 1)
    .put('plant', 11, 1)
    // Canteen
    .put('counter', 14, 1).put('counter', 15, 1).put('fridge', 16, 1).put('counter', 17, 1)
    .put('canteenTable', 16, 4)
    .put('canteenTable', 16, 7)
    .put('plant', 22, 1)
    // Playground
    .put('swings', 2, 11)
    .put('hopscotch', 9, 11)
    .put('bench', 15, 13)
    .put('tree', 20, 11)
    .put('plant', 1, 14);
  return { level: b.build(), entry: [12, 14] };
}
