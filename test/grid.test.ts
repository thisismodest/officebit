import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/sim/grid.ts';
import { Navigator } from '../src/sim/navigation.ts';
import { Rng } from '../src/sim/rng.ts';
import { LevelBuilder, portal } from '../src/worlds/layout.ts';

/** A 7×5 walled box. */
const box = (id = 'box') => new LevelBuilder(id, 'Box', 'building', 7, 5).room(id, 'Box', [0, 0, 7, 5], 'wood', { walled: true });

test('walls are the walled room edge, minus doors', () => {
  const grid = new Grid(box().door([3, 0]).build());
  assert.equal(grid.walkable(0, 2), false);
  assert.equal(grid.walkable(3, 0), true);
  assert.equal(grid.walkable(3, 2), true);
});

test('findPath walks around solid furniture, in 4-directional steps', () => {
  const grid = new Grid(box().put('plant', 3, 1).put('plant', 3, 2).build());
  const path = grid.findPath([1, 1], [5, 1])!;
  assert.deepEqual(path.at(-1), [5, 1]);
  assert.ok(path.every(([x, y]) => grid.walkable(x, y)));
  assert.ok(path.some(([x, y]) => x === 3 && y === 3), 'should go through the gap');
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1);
  }
});

test('findPath returns null for unreachable or blocked targets', () => {
  const grid = new Grid(box().build());
  assert.equal(grid.findPath([1, 1], [0, 0]), null);
  assert.deepEqual(grid.findPath([1, 1], [1, 1]), []);
});

test('spots inside solid furniture stay walkable (the pillow end of a bed)', () => {
  const grid = new Grid(box().put('bed', 1, 1).build());
  assert.equal(grid.walkable(1, 1), true);
  assert.equal(grid.walkable(1, 2), false);
});

test('routes chain through portals across levels', () => {
  const a = box('a').build();
  const b = box('b').build();
  const grids = new Map([a, b].map((level) => [level.id, new Grid(level)]));
  const nav = new Navigator(grids, [portal('stairs', { level: 'a', p: [5, 3] }, { level: 'b', p: [1, 1] })]);
  const legs = nav.route({ level: 'a', p: [1, 1] }, { level: 'b', p: [5, 3] })!;
  assert.deepEqual(legs.map((leg) => leg.level), ['a', 'b']);
  assert.deepEqual(legs[0]!.tiles.at(-1), [5, 3]);
  assert.deepEqual(legs[1]!.tiles.at(-1), [5, 3]);
  assert.equal(nav.route({ level: 'a', p: [1, 1] }, { level: 'nowhere', p: [1, 1] }), null);
});

test('rng is reproducible from a seed', () => {
  const seq = (seed: number) => {
    const rng = new Rng(seed);
    return Array.from({ length: 5 }, () => rng.next());
  };
  assert.deepEqual(seq(42), seq(42));
  assert.notDeepEqual(seq(42), seq(43));
  assert.ok(seq(42).every((n) => n >= 0 && n < 1));
});

test('outdoors, people keep to the paths rather than cutting across the grass', () => {
  // A grass field with a path round the edge: going corner to corner should follow the path.
  const level = new LevelBuilder('park', 'Park', 'outside', 9, 9)
    .room('grass', 'Grass', [0, 0, 9, 9], 'grass')
    .room('top', 'Path', [0, 0, 9, 1], 'path')
    .room('side', 'Path', [8, 0, 1, 9], 'path')
    .build();
  const grid = new Grid(level);
  const path = grid.findPath([0, 0], [8, 8])!;
  assert.ok(path.every(([x, y]) => y === 0 || x === 8), 'stayed on the path');
});
