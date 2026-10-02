import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { FurnitureDef, LevelDef, WorldDef } from '../src/sim/world.ts';
import { buildingMoveProblem, flipHouse, moveBuilding, snapshot } from '../src/worlds/edit.ts';
import { addCrossing, erase, groundProblem, joinsUp, lay, strokeRects } from '../src/worlds/ground.ts';
import { Grid } from '../src/sim/grid.ts';
import { RoadMap } from '../src/sim/roads.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
const townOf = (w: WorldDef) => w.levels.find((l) => l.kind === 'outside')!;
const floorAt = (level: LevelDef, x: number, y: number) =>
  level.rooms.filter((r) => x >= r.rect[0] && y >= r.rect[1] && x < r.rect[0] + r.rect[2] && y < r.rect[1] + r.rect[3]).sort((a, b) => a.rect[2] * a.rect[3] - b.rect[2] * b.rect[3])[0]?.floor;
/** Somewhere empty in the countryside: the hedged field by the river, south-west of town. */
const FIELD = { x: 12, y: 132 };

test('a stroke becomes one rectangle per straight run, overlapping at the corners', () => {
  const along = [0, 1, 2, 3].map((i): [number, number] => [10 + i, 5]);
  const down = [1, 2].map((i): [number, number] => [13, 5 + i]);
  assert.deepEqual(strokeRects([...along, ...down], 'road'), [
    [10, 5, 5, 2],
    [13, 5, 2, 4],
  ]);
  assert.deepEqual(strokeRects([[4, 4]], 'path'), [[4, 4, 1, 1]]);
});

test('a new road clears small things in its way, and is only road: pavement is drawn beside it, and stops at the road', () => {
  const w = world();
  const town = townOf(w);
  town.furniture = town.furniture.filter((f) => !(f.p[1] >= FIELD.y - 2 && f.p[1] < FIELD.y + 8 && f.p[0] >= FIELD.x - 2 && f.p[0] < FIELD.x + 12));
  const tree: FurnitureDef = { t: 'tree', p: [FIELD.x + 4, FIELD.y] };
  town.furniture.push(tree);
  const stroke = [0, 1, 2, 3, 4, 5, 6].map((i): [number, number] => [FIELD.x + i, FIELD.y]).concat([1, 2, 3].map((i): [number, number] => [FIELD.x + 6, FIELD.y + i]));
  const cleared = lay(town, strokeRects(stroke, 'road'), 'road');
  assert.deepEqual(cleared, [tree]);
  assert.equal(floorAt(town, FIELD.x + 3, FIELD.y + 1), 'road');
  assert.equal(floorAt(town, FIELD.x + 3, FIELD.y - 1), 'grass', 'no pavement of its own');
  // Pavement drawn along it, and down across the road: it's laid either side, not on the road.
  lay(town, strokeRects([0, 1, 2, 3, 4, 5].map((i): [number, number] => [FIELD.x + i, FIELD.y - 1]), 'pavement'), 'pavement');
  lay(town, [[FIELD.x + 2, FIELD.y - 1, 1, 4]], 'pavement');
  assert.equal(floorAt(town, FIELD.x + 3, FIELD.y - 1), 'path');
  assert.equal(floorAt(town, FIELD.x + 2, FIELD.y), 'road', 'the road stays road');
  assert.equal(floorAt(town, FIELD.x + 2, FIELD.y + 2), 'path', 'and the pavement carries on the other side');
});

test('the starter town has pavement along every road, laid as it was built', () => {
  const town = townOf(world());
  assert.equal(floorAt(town, 30, 67), 'path', 'along the Street');
  assert.equal(floorAt(town, 59, 44), 'path', 'down Hill Road');
});

test('paths stop at roads; rubbing out a road cuts right across it; crossings go across', () => {
  const w = world();
  const town = townOf(w);
  const main = 68;
  lay(town, [[30, main - 3, 1, 8]], 'path');
  assert.equal(floorAt(town, 30, main), 'road', 'the road is still road where the path met it');
  assert.equal(floorAt(town, 30, main - 3), 'path');

  assert.equal(addCrossing(town, [130, main]), null);
  assert.equal(floorAt(town, 131, main + 1), 'zebra');
  assert.match(addCrossing(town, [130, main]) ?? '', /already/);
  assert.match(addCrossing(town, [30, 20]) ?? '', /across a road/);

  assert.ok(erase(town, [140, main]));
  // The road's gone at both lanes, to grass; its pavements stay where they are.
  assert.equal(floorAt(town, 140, main), 'grass', 'the road is gone at both lanes');
  assert.equal(floorAt(town, 140, main + 1), 'grass');
  assert.equal(floorAt(town, 140, main - 1), 'path', 'with the pavement still running past');
  assert.equal(floorAt(town, 142, main), 'road', 'and the road carrying on beyond');

  // Pavement rubs out too, to grass, and stays rubbed out (another road drawn doesn't bring it back); drawing pavement does.
  assert.ok(erase(town, [92, main - 1]));
  assert.equal(floorAt(town, 92, main - 1), 'grass');
  lay(town, [[60, 140, 3, 1]], 'road');
  assert.equal(floorAt(town, 92, main - 1), 'grass', 'still grass after another road');
  lay(town, [[92, main - 1, 1, 1]], 'pavement');
  assert.equal(floorAt(town, 92, main - 1), 'path');
});

test('a house moves with its door (its path stays where it was laid), and turns round', () => {
  const w = world();
  const town = townOf(w);
  const house = town.furniture.find((f) => f.t === 'detached' && !f.faces)!;
  const doorOf = () => w.portals.flatMap((p) => [p.a, p.b]).find((e) => e.level === 'town' && e.p[1] === house.p[1] + 3 && e.p[0] === house.p[0] + 1);
  const door = doorOf()!;
  const to: [number, number] = [FIELD.x, FIELD.y - 10];
  town.furniture = town.furniture.filter((f) => f === house || !(Math.abs(f.p[0] - to[0]) < 8 && Math.abs(f.p[1] - to[1]) < 8));
  const lot = town.furniture.find((f) => f.t === 'lot')!;
  assert.match(buildingMoveProblem(w, 'town', house, [lot.p[0] - 2, lot.p[1] + 2]) ?? '', /lot/, 'not onto an empty lot');
  assert.equal(buildingMoveProblem(w, 'town', house, to), null);
  const [oldX, oldY] = door.p;
  moveBuilding(w, 'town', house, to);
  assert.deepEqual(house.p, to);
  assert.deepEqual(door.p, [to[0] + 1, to[1] + 3], 'the door came too');
  assert.equal(floorAt(town, to[0] + 1, to[1] + 3), 'grass', 'but no path: that’s laid separately');
  assert.equal(floorAt(town, oldX, oldY), 'path', 'and the old one is still where it was');
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

test('water: nobody walks in it and nothing drives on it; a road drawn across it is a bridge, with no pavement on the water, and rubbing it out takes the bridge too', () => {
  const town = structuredClone(STARTER).levels.find((l) => l.kind === 'outside')!;
  assert.match(groundProblem(town, [40, 100, 2, 2], 'water') ?? '', /across the water/, 'no water over a road');
  lay(town, strokeRects([[60, 136], [60, 152]], 'road'), 'road');
  const bridge = town.rooms.find((r) => r.floor === 'bridge' && r.rect[0] === 60)!;
  assert.deepEqual(bridge.rect, [60, 142, 2, 5], 'bridged just where it crosses the river');
  const grid = new Grid(town);
  assert.ok(!grid.walkable(50, 146), 'nobody walks in the river');
  assert.ok(grid.walkable(61, 146), 'but over the bridge');
  assert.equal(new RoadMap(town, grid).route([60, 137], [61, 151])?.at(-1)?.join(), '61,151', 'and drives over it');
  assert.ok(!town.rooms.some((r) => r.id.startsWith('pavement-') && r.rect[1] >= 142 && r.rect[1] < 147), 'no pavement on the water');
  erase(town, [60, 146]);
  assert.ok(!town.rooms.some((r) => r.floor === 'bridge' && r.rect[0] === 60), 'rubbed out, bridge and all');
});
