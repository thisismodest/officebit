import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/sim/catalog.ts';
import { Grid } from '../src/sim/grid.ts';
import { MOVERS, advance, blocks, speedOn, type Moving } from '../src/sim/movement.ts';
import { RoadMap } from '../src/sim/roads.ts';
import { Simulation } from '../src/sim/sim.ts';
import type { LevelDef, Tile } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';

test('one table of speeds: cars and trucks alike, faster on the highway, slow over pavement; people walk, babies crawl', () => {
  assert.equal(speedOn(MOVERS.car, 'road'), speedOn(MOVERS.truck, 'road'));
  assert.ok(speedOn(MOVERS.car, 'highway') > speedOn(MOVERS.car, 'road'));
  assert.ok(speedOn(MOVERS.car, 'path') < speedOn(MOVERS.car, 'road'));
  assert.equal(speedOn(MOVERS.car, undefined), speedOn(MOVERS.car, 'highway'), 'off the map is the highway');
  assert.ok(speedOn(MOVERS.crawler, 'path') < speedOn(MOVERS.walker, 'path'));
  assert.ok(speedOn(MOVERS.hurrying, 'path') > speedOn(MOVERS.walker, 'path'), 'hurrying to catch someone up');
});

test('one stepper: along a route at a pace, facing the way it goes, remembering where it was', () => {
  const m: Moving = { x: 0, y: 0, px: 0, py: 0, facing: 'down' };
  const path: Tile[] = [[1, 0], [1, 2]];
  assert.equal(advance(m, path, 0.5), false);
  assert.deepEqual([m.x, m.y, m.facing, m.px], [0.5, 0, 'right', 0]);
  assert.equal(advance(m, path, 1.5), false);
  assert.deepEqual([m.x, m.y, m.facing], [1, 1, 'down']);
  assert.equal(advance(m, path, 5), true, 'there');
  assert.deepEqual([m.x, m.y], [1, 2]);
  // Reversing, it keeps facing the way it was.
  const back: Moving = { x: 0, y: 0, px: 0, py: 0, facing: 'up', reversing: true };
  advance(back, [[0, 1]], 0.5);
  assert.equal(back.facing, 'up');
});

test('what blocks what: lampposts stop everyone; benches stop vehicles but not walkers; bays and pitches stop neither', () => {
  assert.ok(blocks(CATALOG.lamppost!, MOVERS.walker) && blocks(CATALOG.lamppost!, MOVERS.car));
  assert.ok(blocks(CATALOG.bench!, MOVERS.car));
  assert.equal(blocks(CATALOG.bench!, MOVERS.walker), !!CATALOG.bench!.solid);
  assert.ok(!blocks(CATALOG.parkingBay!, MOVERS.car) && !blocks(CATALOG.foodTruck!, MOVERS.car));
});

/** A strip of road two lanes wide with pavement either side, and a lamppost on the north pavement. */
const street = (): LevelDef => ({
  id: 'street',
  name: 'Street',
  kind: 'outside',
  size: [20, 6],
  rooms: [
    { id: 'grass', name: 'Grass', rect: [0, 0, 20, 6], floor: 'grass' },
    { id: 'north', name: 'Pavement', rect: [0, 1, 20, 1], floor: 'path' },
    { id: 'road', name: 'Road', rect: [0, 2, 20, 2], floor: 'road' },
    { id: 'south', name: 'Pavement', rect: [0, 4, 20, 1], floor: 'path' },
  ],
  doors: [],
  furniture: [{ t: 'lamppost', p: [10, 1] }],
});

test('size-aware routes: a truck keeps its whole body clear of a lamppost by the road; a car needn’t', () => {
  const level = street();
  const roads = new RoadMap(level, new Grid(level));
  const car = roads.route([0, 2], [19, 2], 'right')!;
  assert.ok(car.some(([x, y]) => x === 10 && y === 2), 'a car drives right past it');
  const truck = roads.route([0, 3], [19, 3], 'right', { reach: MOVERS.truck.reach })!;
  assert.ok(truck, 'a truck finds a way');
  for (const [x, y] of truck) assert.ok(Math.abs(x - 10) > 1 || Math.abs(y - 1) > 1, `and never has the lamppost within reach (${x},${y})`);
});

test('parked vehicles: people walk round them (unless it’s their car they’re walking to), and cars wait behind one stopped in the lane', () => {
  const level = street();
  const grid = new Grid(level);
  grid.parked[grid.i(5, 4)] = 1;
  const round = grid.findPath([3, 4], [7, 4])!;
  assert.ok(!round.some(([x, y]) => x === 5 && y === 4), 'round it');
  assert.ok(grid.findPath([3, 4], [5, 4]), 'but up to it, if that’s where they’re going');
  // In the town: a car stopped in the lane holds up the one behind.
  const sim = new Simulation(structuredClone(STARTER));
  const lane = sim.traffic.lanes().find((l) => l.heading === 'left')!;
  const stopped = sim.traffic.add(0, [lane.first[0] - 4, lane.y], []);
  stopped.parked = true;
  const behind = sim.traffic.add(0, [lane.first[0] - 2, lane.y], [lane.last]);
  behind.facing = 'left';
  for (let i = 0; i < 20; i++) sim.traffic.step();
  assert.ok(behind.x > stopped.x, 'it waited behind');
});
