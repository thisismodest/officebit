// Office interiors for new companies (docs/VENTURES.md). Tier 1 is a
// four-desk studio; tier 2 a proper office with a meeting room and an arcade
// machine. Each returns its level and entry tile (just inside the front door).
import type { LevelDef, Tile } from '../sim/world.ts';
import { LevelBuilder } from './layout.ts';

export interface Office {
  level: LevelDef;
  entry: Tile;
  /** The town building that goes with it. */
  building: 'startupSmall' | 'startupLarge';
}

export type Tier = 1 | 2;

export function buildOffice(tier: Tier, id: string, name: string): Office {
  return tier === 1 ? studio(id, name) : office(id, name);
}

/** 14×10: four laptops, a sofa, coffee. */
function studio(id: string, name: string): Office {
  const b = new LevelBuilder(`${id}-office`, name, 'building', 14, 10)
    .room(`${id}-office`, name, [0, 0, 14, 10], 'wood', { walled: true })
    .door([6, 9])
    .desks('laptopDesk', [[1, 2], [4, 2], [7, 2], [10, 2]], [])
    .put('whiteboard', 4, 5)
    .put('coffee', 1, 6)
    .put('fridge', 2, 6)
    .put('sofa', 9, 6)
    .put('armchair', 11, 6)
    .put('plant', 12, 1)
    .put('plant', 12, 7);
  return { level: b.build(), entry: [6, 8], building: 'startupSmall' };
}

/** 24×14: eight desks, a meeting room, a kitchen corner, an arcade machine. */
function office(id: string, name: string): Office {
  const b = new LevelBuilder(`${id}-office`, name, 'building', 24, 14)
    .room(`${id}-office`, name, [0, 0, 24, 14], 'carpetGrey', { walled: true })
    .room(`${id}-meeting`, 'Meeting room', [16, 0, 8, 7], 'carpetBlue', { walled: true })
    .room(`${id}-kitchen`, 'Kitchen', [0, 9, 9, 5], 'tiles')
    .door([19, 6], [12, 13])
    .desks('computerDesk', [[1, 2], [4, 2], [7, 2], [10, 2], [1, 6], [4, 6], [7, 6], [10, 6]], [])
    .put('meetingTable', 18, 2)
    .put('plant', 22, 1)
    .put('counter', 1, 10)
    .put('coffee', 2, 10)
    .put('fridge', 3, 10)
    .put('sink', 4, 10)
    .put('smallTable', 6, 10)
    .put('arcade', 14, 10)
    .put('sofa', 17, 10)
    .put('sofa', 19, 10)
    .put('plant', 22, 12);
  return { level: b.build(), entry: [12, 12], building: 'startupLarge' };
}
