import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Space, asideOffset, easeAside, inTheWay, type Body } from '../src/sim/collision.ts';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { MOVERS } from '../src/sim/movement.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';

const body = (id: string, x: number, y: number, facing: Body['facing'], moving = true, extra: Partial<Body> = {}): Body => ({ id, x, y, facing, moving, here: true, level: 'town', ...extra });
const walking = MOVERS.walker.manners;
const driving = MOVERS.car.manners;

test('the space: who is near, on which layer and level, and only if they are here', () => {
  const space = new Space();
  space.fill('foot', [body('a', 5, 5, 'right'), body('gone', 5, 6, 'right', true, { here: false }), body('b', 5, 5, 'right', true, { level: 'home' })]);
  space.fill('wheels', [body('car', 6, 5, 'left', false)]);
  assert.deepEqual(space.near('town', 'foot', 5, 5, 1).map((b) => b.id), ['a']);
  assert.deepEqual(space.still('town', 'wheels').map((b) => b.id), ['car']);
  // Near means the square of tiles round the point, wherever the buckets fall.
  space.fill('foot', [3, 4, 7, 8, 9].map((x) => body(`at${x}`, x, 5, 'right')));
  assert.deepEqual(space.near('town', 'foot', 5, 5, 2).map((b) => b.id).sort(), ['at3', 'at4', 'at7', 'at8']);
  // Refilling a layer replaces it, leaving the other be.
  space.fill('foot', []);
  assert.equal(space.near('town', 'foot', 5, 5, 3).length, 0);
  assert.equal(space.near('town', 'wheels', 5, 5, 3).length, 1);
});

test('walking manners: slow behind someone, wait right behind them, pass someone coming the other way, give way to someone crossing', () => {
  const me = body('m', 0, 0, 'right');
  assert.equal(inTheWay(me, 'right', [body('q', 0.7, 0, 'right')], walking).step, 0.5, 'slowing');
  assert.equal(inTheWay(me, 'right', [body('q', 0.4, 0, 'right')], walking).step, 0, 'waiting');
  const oncoming = inTheWay(me, 'right', [body('q', 1, 0, 'left')], walking);
  assert.deepEqual(oncoming, { step: 1, passing: true }, 'passing, stepping aside');
  assert.equal(inTheWay(me, 'right', [body('q', 0.4, 0, 'up', false, { settled: true })], walking).step, 1, 'someone at their own spot is in nobody’s way');
  // Meeting at a corner, each in the other's way: the earlier id goes first, the other waits.
  const a = body('a', 0, 0, 'right');
  const c = body('c', 0.4, 0.2, 'up');
  assert.equal(inTheWay(a, 'right', [c], walking).step, 1, 'a (earlier) goes');
  assert.equal(inTheWay(c, 'up', [a], walking).step, 0, 'c waits');
  // Crossing right in front of someone who isn't in their way: that someone waits.
  assert.equal(inTheWay(a, 'right', [body('x', 0.4, 0, 'up')], walking).step, 0);
});

test('driving manners: keep the gap to the car in front, wait behind one stopped in the lane, give way at junctions, and never mind other lanes', () => {
  const me = body('m', 0, 0, 'left');
  assert.equal(inTheWay(me, 'left', [body('q', -1.2, 0, 'left')], driving).step, 0, 'too close');
  assert.equal(inTheWay(me, 'left', [body('q', -2, 0, 'left')], driving).step, 1, 'far enough');
  // A bus or a van reaches a tile past its middle: the gap is to its back.
  assert.equal(inTheWay(me, 'left', [body('bus', -2, 0, 'left', true, { reach: 1 })], driving).step, 0, 'right up behind a bus');
  assert.equal(inTheWay(body('van', 0, 0, 'left', true, { reach: 1 }), 'left', [body('q', -2, 0, 'left')], driving).step, 0, 'a van keeps its front clear too');
  assert.equal(inTheWay(me, 'left', [body('q', -1, 0, 'right', false)], driving).step, 0, 'stopped in the lane, whichever way it faces');
  assert.equal(inTheWay(me, 'left', [body('q', -1, 0, 'right')], driving).step, 1, 'oncoming, in its own lane');
  assert.equal(inTheWay(me, 'left', [body('q', -1, 0, 'up')], driving).step, 0, 'crossing just in front: it got there first');
  assert.equal(inTheWay(me, 'left', [body('q', -1, 2, 'up')], driving).step, 1, 'crossing, but further off: I go first');
  assert.equal(inTheWay(me, 'left', [body('q', -1, -2, 'up')], driving).step, 1, 'already across');
  assert.equal(inTheWay(me, 'left', [body('q', -1, 1, 'left')], driving).step, 1, 'the next lane over');
});

test('stepping aside: to your own left, easing in and back out', () => {
  assert.deepEqual(asideOffset('right', 0.3), [0, -0.3], 'heading east, left is north');
  assert.deepEqual(asideOffset('down', 0.3), [0.3, -0], 'heading south, left is east');
  let aside = 0;
  for (let i = 0; i < 30; i++) aside = easeAside(aside, true);
  assert.ok(aside > 0.29);
  for (let i = 0; i < 60; i++) aside = easeAside(aside, false);
  assert.equal(aside, 0);
});

test('in the town: people give way and pass each other, and nobody is ever stuck', async () => {
  const { Simulation } = await import('../src/sim/sim.ts');
  const { STARTER } = await import('../src/worlds/starter.ts');
  const sim = new Simulation(structuredClone(STARTER));
  let waited = 0;
  let passed = 0;
  let longest = 0;
  for (let t = 0; t < 14400; t++) {
    sim.step();
    for (const p of sim.people) {
      if (p.phase !== 'moving') continue;
      if ((p.held ?? 0) > 0) waited++;
      if ((p.aside ?? 0) > 0.05) passed++;
      longest = Math.max(longest, p.held ?? 0);
    }
  }
  assert.ok(waited > 0 && passed > 0, `some giving way (${waited}) and passing (${passed})`);
  // Patience runs out after a second or so, and then they squeeze past: a long wait means threading through a crowd, still moving.
  assert.ok(longest < 400, `the longest anyone was held up: ${longest} steps`);
});

test('the town keeps an index of who is on each level, always the same as looking through everyone', () => {
  const sim = new Simulation(structuredClone(STARTER));
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    if (t % 50) continue;
    for (const level of sim.levels.keys()) {
      assert.deepEqual(sim.peopleOn(level), sim.people.filter((p) => p.level === level), `${level} at ${t}`);
    }
  }
});
