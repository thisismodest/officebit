// Where the town games by the water and on the pitch are played (docs/GAMES.md): water near a fishing barrel with
// somewhere to stand at it, and a goal near the football. Pure over a level's design, so the editor can tell before
// something's put down whether it could be played there.
import { CATALOG } from '../../sim/catalog.ts';
import type { Grid } from '../../sim/grid.ts';
import type { FurnitureDef, LevelDef, Tile } from '../../sim/world.ts';

/** How near a fishing barrel the water's edge must be, and the furthest a cast goes (tiles); how far a goal may be from the football. */
export const NEAR = 4;
export const FARTHEST = 5;
const PITCH = 12;
const DIRS: readonly Tile[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export type Water = 'pond' | 'river';

/** Water by a barrel: where to stand (beside it, as near the barrel as can be), the water within a cast, and which kind. */
export interface Swim {
  stand: Tile;
  water: Tile[];
  kind: Water;
}

/** A pitch's goal: where its mouth is (its middle, tiles), which way across it runs, and which way out of it to the spot. */
export interface Goal {
  x: number;
  y: number;
  across: [number, number];
  out: [number, number];
}

/** Water near a barrel at `from` (a pond, or the river and its shallows), and a free tile beside it to stand. Null with none. */
export function swimNear(level: LevelDef, grid: Grid, furniture: readonly FurnitureDef[], from: Tile): Swim | null {
  const ponds = furniture.filter((f) => f.t === 'pond');
  const inPond = (x: number, y: number) =>
    ponds.some(({ t, p }) => x >= p[0] && y >= p[1] && x < p[0] + CATALOG[t]!.size[0] && y < p[1] + CATALOG[t]!.size[1]);
  const river = (x: number, y: number) => grid.inBounds(x, y) && ['water', 'shallows'].includes(level.rooms[grid.roomAt(x, y)]?.floor ?? '');
  const isWater = (x: number, y: number) => inPond(x, y) || river(x, y);
  let stand: Tile | null = null;
  for (let r = 1; r <= NEAR && !stand; r++)
    for (let dy = -r; dy <= r && !stand; dy++)
      for (let dx = -r; dx <= r && !stand; dx++) {
        const [x, y] = [from[0] + dx, from[1] + dy];
        // Beside the barrel, not on it.
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.free(x, y) && !isWater(x, y) && DIRS.some(([ax, ay]) => isWater(x + ax, y + ay))) stand = [x, y];
      }
  if (!stand) return null;
  const water: Tile[] = [];
  for (let y = stand[1] - FARTHEST - 1; y <= stand[1] + FARTHEST + 1; y++)
    for (let x = stand[0] - FARTHEST - 1; x <= stand[0] + FARTHEST + 1; x++)
      if (isWater(x, y) && Math.hypot(x - stand[0], y - stand[1]) <= FARTHEST + 1) water.push([x, y]);
  return { stand, water, kind: water.some(([x, y]) => inPond(x, y)) ? 'pond' : 'river' };
}

/** The goal nearest a football at `from` (close enough to be its pitch's), and which way it faces. Null with no goal near. */
export function goalNear(furniture: readonly FurnitureDef[], from: Tile): Goal | null {
  const far = (f: FurnitureDef) => Math.hypot(f.p[0] - from[0], f.p[1] - from[1]);
  const nearest = furniture.filter((f) => f.t === 'goal' && far(f) <= PITCH).sort((a, b) => far(a) - far(b))[0];
  if (!nearest) return null;
  const [w, h] = CATALOG[nearest.t]!.size;
  const [x, y] = [nearest.p[0] + w / 2 - 0.5, nearest.p[1] + h / 2 - 0.5];
  // A goal taller than it's wide faces along the pitch sideways; out of it is towards the ball.
  const out: [number, number] = h > w ? [Math.sign(from[0] - x) || 1, 0] : [0, Math.sign(from[1] - y) || 1];
  return { x, y, across: h > w ? [0, 1] : [1, 0], out };
}
