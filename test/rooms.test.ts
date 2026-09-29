import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/sim/grid.ts';
import { validate } from '../src/sim/validate.ts';
import type { LevelDef, Rect, WorldDef } from '../src/sim/world.ts';
import { addRoom, removeRoom, resizeRoom, roomProblem, snap, toggleDoor } from '../src/worlds/rooms.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
const home = (w: WorldDef) => w.levels.find((l) => l.id === 'home-rowan')!;

/** The first spot in the house a room of this size can go (wherever the furniture leaves room). */
const firstFit = (w: WorldDef, level: LevelDef, size: number): Rect => {
  for (let y = 0; y < level.size[1]; y++) {
    for (let x = 0; x < level.size[0]; x++) {
      const rect: Rect = [x, y, size, size];
      const trial = structuredClone(level);
      if (typeof addRoom(trial, w.portals, rect) !== 'string') return rect;
    }
  }
  throw new Error('nowhere');
};

test('a new room gets its walls and a doorway, and the house still works', () => {
  const w = world();
  const level = home(w);
  const rect = firstFit(w, level, 4);
  const room = addRoom(level, w.portals, rect, 'Snug');
  assert.equal(typeof room, 'object');
  assert.ok(level.rooms.some((r) => r.name === 'Snug' && r.walled));
  const [x, y, rw, rh] = rect;
  const onEdge = ([dx, dy]: [number, number]) => dx >= x && dy >= y && dx < x + rw && dy < y + rh && (dx === x || dy === y || dx === x + rw - 1 || dy === y + rh - 1);
  assert.ok(level.doors.some(onEdge), 'with a doorway in its walls');
  // Its inside can be walked into from the front door.
  const grid = new Grid(level);
  assert.ok(grid.findPath(w.portals.find((p) => p.b.level === level.id || p.a.level === level.id)!.b.p, [x + 1, y + 1]), 'reachable');
  assert.deepEqual(validate(w), []);
});

test('rooms can’t cross each other, go outside, or be too small; edges snap onto walls nearby', () => {
  const w = world();
  const level = home(w);
  const bedroom = level.rooms.find((r) => r.id === 'rowan-bedroom')!;
  // Straddling the bedroom's wall.
  assert.match(roomProblem(level, [3, 2, 6, 5]) ?? '', /not across/);
  assert.match(roomProblem(level, [2, 2, 2, 2]) ?? '', /at least a tile/);
  assert.match(roomProblem(level, [10, 6, 10, 4]) ?? '', /inside the building/);
  // Drawn a tile off the bedroom's right-hand wall: it snaps on, sharing it.
  const [bx, , bw] = bedroom.rect;
  const snapped = snap(level, [bx + bw, 0, 4, 4]);
  assert.equal(snapped[0], bx + bw - 1);
});

test('resizing and knocking through keep doorways tidy, and nothing gets shut in', () => {
  const w = world();
  const level = home(w);
  const rect = firstFit(w, level, 4);
  const room = addRoom(level, w.portals, rect) as { id: string };
  const doorsBefore = level.doors.length;
  assert.equal(removeRoom(level, w.portals, room.id), null);
  assert.ok(!level.rooms.some((r) => r.id === room.id));
  assert.equal(level.doors.length, doorsBefore - 1, 'its doorway went with it');
  assert.match(removeRoom(level, w.portals, 'rowan-home') ?? '', /outside walls/);
  // A room's only doorway can't be closed: even an empty room needs a way in.
  const snug = addRoom(level, w.portals, rect, 'Snug') as { id: string; rect: Rect };
  const [sx, sy, sw, sh] = snug.rect;
  const own = level.doors.filter(([dx, dy]) => dx >= sx && dy >= sy && dx < sx + sw && dy < sy + sh);
  assert.equal(own.length, 1);
  assert.match(toggleDoor(level, w.portals, own[0]!) ?? '', /snug needs a way in/);
  // Making the bedroom bigger than the house isn't on.
  assert.match(resizeRoom(level, w.portals, 'rowan-bedroom', [0, 0, 20, 5]) ?? '', /inside the building/);
  assert.deepEqual(validate(w), []);
});

test('doorways go along walls: not in the outside wall, not at a corner, not on the front door', () => {
  const w = world();
  const level = home(w);
  assert.match(toggleDoor(level, w.portals, [0, 3]) ?? '', /outside walls/);
  const front = w.portals.find((p) => p.a.level === level.id || p.b.level === level.id)!;
  const inside = front.a.level === level.id ? front.a.p : front.b.p;
  assert.match(toggleDoor(level, w.portals, inside) ?? '', /way in/);
  const bedroom = level.rooms.find((r) => r.id === 'rowan-bedroom')!;
  const [bx, by, bw, bh] = bedroom.rect;
  assert.match(toggleDoor(level, w.portals, [bx + bw - 1, by + bh - 1]) ?? '', /corner/);
});

test('an area is a floor of its own with no walls: it can go round furniture, and comes away leaving it', () => {
  const w = world();
  const level = home(w);
  const doors = level.doors.length;
  const walls = [...new Grid(level).wall];
  // Somewhere round a piece of furniture (where walls couldn't go).
  const fits = (r: Rect) => typeof addRoom(structuredClone(level), w.portals, r, undefined, false) !== 'string';
  const sofa = level.furniture.find((f) => fits([f.p[0], f.p[1] - 1, 4, 4]))!;
  const rect: Rect = [sofa.p[0], sofa.p[1] - 1, 4, 4];
  assert.match(roomProblem(level, rect) ?? '', /where the wall would go/);
  const area = addRoom(level, w.portals, rect, undefined, false) as { id: string; name: string; floor: string; walled: boolean };
  assert.equal(typeof area, 'object', String(area));
  assert.equal(area.name, 'Area');
  assert.equal(area.walled, false);
  assert.notEqual(area.floor, level.rooms.find((r) => r.id !== area.id && r.rect[0] <= rect[0] && r.rect[1] <= rect[1] && r.walled)?.floor, 'a floor you can see');
  assert.equal(level.doors.length, doors, 'no doorway needed');
  assert.deepEqual([...new Grid(level).wall], walls, 'and no new walls');
  assert.deepEqual(validate(w), []);
  assert.match(roomProblem(level, [rect[0], rect[1], 1, 1], undefined, false) ?? '', /at least 2/);
  assert.equal(removeRoom(level, w.portals, area.id), null);
  assert.ok(level.furniture.includes(sofa));
  assert.deepEqual(validate(w), []);
});
