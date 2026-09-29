import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { FurnitureDef, LevelDef, WorldDef } from '../src/sim/world.ts';
import { buildingMoveProblem, flipHouse, moveBuilding, snapshot } from '../src/worlds/edit.ts';
import { addCrossing, erase, joinsUp, lay, strokeRects } from '../src/worlds/ground.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
const townOf = (w: WorldDef) => w.levels.find((l) => l.kind === 'outside')!;
const floorAt = (level: LevelDef, x: number, y: number) =>
  level.rooms.filter((r) => x >= r.rect[0] && y >= r.rect[1] && x < r.rect[0] + r.rect[2] && y < r.rect[1] + r.rect[3]).sort((a, b) => a.rect[2] * a.rect[3] - b.rect[2] * b.rect[3])[0]?.floor;
/** Somewhere empty in the countryside at the bottom of the map. */
const FIELD = { x: 20, y: 146 };

test('a stroke becomes one rectangle per straight run, overlapping at the corners', () => {
  const along = [0, 1, 2, 3].map((i): [number, number] => [10 + i, 5]);
  const down = [1, 2].map((i): [number, number] => [13, 5 + i]);
  assert.deepEqual(strokeRects([...along, ...down], 'road'), [
    [10, 5, 5, 2],
    [13, 5, 2, 4],
  ]);
  assert.deepEqual(strokeRects([[4, 4]], 'path'), [[4, 4, 1, 1]]);
});

test('a new road clears small things, and gets pavements that wrap round its corner', () => {
  const w = world();
  const town = townOf(w);
  town.furniture = town.furniture.filter((f) => !(f.p[1] >= FIELD.y - 2 && f.p[1] < FIELD.y + 8 && f.p[0] >= FIELD.x - 2 && f.p[0] < FIELD.x + 12));
  const tree: FurnitureDef = { t: 'tree', p: [FIELD.x + 4, FIELD.y] };
  town.furniture.push(tree);
  const stroke = [0, 1, 2, 3, 4, 5, 6].map((i): [number, number] => [FIELD.x + i, FIELD.y]).concat([1, 2, 3].map((i): [number, number] => [FIELD.x + 6, FIELD.y + i]));
  const cleared = lay(town, strokeRects(stroke, 'road'), 'road');
  assert.deepEqual(cleared, [tree]);
  assert.equal(floorAt(town, FIELD.x + 3, FIELD.y + 1), 'road');
  // Pavement above the road, and round the outside of the corner.
  assert.equal(floorAt(town, FIELD.x + 3, FIELD.y - 1), 'path');
  assert.equal(floorAt(town, FIELD.x + 8, FIELD.y - 1), 'path');
  assert.equal(floorAt(town, FIELD.x + 8, FIELD.y + 3), 'path');
});

test('paths stop at roads; rubbing out a road cuts right across it; crossings go across', () => {
  const w = world();
  const town = townOf(w);
  const main = 50;
  lay(town, [[30, main - 3, 1, 8]], 'path');
  assert.equal(floorAt(town, 30, main), 'road', 'the road is still road where the path met it');
  assert.equal(floorAt(town, 30, main - 3), 'path');

  assert.equal(addCrossing(town, [120, main]), null);
  assert.equal(floorAt(town, 121, main + 1), 'zebra');
  assert.match(addCrossing(town, [120, main]) ?? '', /already/);
  assert.match(addCrossing(town, [30, 20]) ?? '', /across a road/);

  assert.ok(erase(town, [140, main]));
  assert.equal(floorAt(town, 140, main), 'grass', 'the road is gone at both lanes, back to grass');
  assert.equal(floorAt(town, 140, main + 1), 'grass');
  assert.equal(floorAt(town, 140, main - 1), 'path', 'with the pavement still running past');
  assert.equal(floorAt(town, 142, main), 'road', 'and the road carrying on beyond');

  // Pavement rubs out too, to grass, and stays rubbed out when the pavements are laid again; a path drawn over it brings it back.
  assert.ok(erase(town, [100, main - 1]));
  assert.equal(floorAt(town, 100, main - 1), 'grass');
  lay(town, [[60, 140, 3, 1]], 'road');
  assert.equal(floorAt(town, 100, main - 1), 'grass', 'still grass after the pavements are laid again');
  lay(town, [[100, main - 1, 1, 1]], 'path');
  assert.equal(floorAt(town, 100, main - 1), 'path');
});

test('a house moves with its door and front path, and turns round', () => {
  const w = world();
  const town = townOf(w);
  const house = town.furniture.find((f) => f.t === 'house' && !f.faces)!;
  const doorOf = () => w.portals.flatMap((p) => [p.a, p.b]).find((e) => e.level === 'town' && e.p[1] === house.p[1] + 3 && e.p[0] === house.p[0] + 1);
  const door = doorOf()!;
  const to: [number, number] = [FIELD.x, FIELD.y - 10];
  town.furniture = town.furniture.filter((f) => f === house || !(Math.abs(f.p[0] - to[0]) < 8 && Math.abs(f.p[1] - to[1]) < 8));
  const lot = town.furniture.find((f) => f.t === 'lot')!;
  assert.match(buildingMoveProblem(w, 'town', house, [lot.p[0] - 2, lot.p[1] + 2]) ?? '', /lot/, 'not onto an empty lot');
  assert.equal(buildingMoveProblem(w, 'town', house, to), null);
  moveBuilding(w, 'town', house, to);
  assert.deepEqual(house.p, to);
  assert.deepEqual(door.p, [to[0] + 1, to[1] + 3], 'the door came too');
  assert.equal(floorAt(town, to[0] + 1, to[1] + 3), 'path', 'and its front path');
  assert.equal(joinsUp(town, door.p), false, 'out in the fields, it doesn’t join up with anything');
  assert.deepEqual(validate(w), []);

  assert.equal(typeof flipHouse(w, 'town', house), 'object');
  assert.equal(house.faces, 'up');
  assert.deepEqual(door.p, [to[0] + 1, to[1] - 1], 'the door is round the other side');
});

test('undo puts a map back as it was, with the same pieces', () => {
  const w = world();
  const sim = new Simulation(w);
  const town = sim.levels.get('town')!;
  const tree = town.furniture.find((f) => f.t === 'tree')!;
  const item = sim.items.find((i) => i.def === tree)!;
  const before = snapshot(w, 'town');
  const rooms = town.rooms.length;
  lay(town, [[tree.p[0], tree.p[1], 2, 2]], 'path');
  sim.edited('town');
  assert.ok(item.gone, 'the tree was cleared');
  before.restore();
  sim.edited('town');
  assert.equal(town.rooms.length, rooms);
  assert.ok(!item.gone, 'and it’s back, the same tree');
  assert.equal(sim.items.filter((i) => i.def === tree).length, 1);
});
