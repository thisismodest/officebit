// Mini games (docs/GAMES.md): their rules, played without a screen, and that playing never touches the town.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/sim/catalog.ts';
import type { Tile } from '../src/sim/world.ts';
import { BrickBash } from '../src/games/arcade/brick-bash.ts';
import { Caterpillar } from '../src/games/arcade/caterpillar.ts';
import type { Dir, Input, Key } from '../src/games/controls.ts';
import { MINIGAMES } from '../src/games/index.ts';
import { ParcelDash, plan } from '../src/games/town/parcel-dash.ts';
import { doorInto, fresh, run, snapshot } from './town.ts';

/** Controls for one frame: keys held, and keys pressed this frame. */
const keys = (held: Dir[] = [], pressed: Key[] = []): Input => ({ held: new Set(held), pressed: new Set(pressed), pointer: null, tap: null });
/** Always the same "random" number, for leaves that land where a test expects. */
const fixed = (n: number) => () => n;

test('every kind of thing you can play has a card to say so', () => {
  for (const type of Object.values(CATALOG)) if (type.minigame) assert.ok(MINIGAMES[type.minigame], type.name);
});

test('caterpillar: moves a cell at a time, turns but never straight back, and running into the wall ends the round', () => {
  const c = new Caterpillar(fixed(0.99));
  const [x, y] = c.body[0]!;
  c.step(keys(), c.pace);
  assert.deepEqual(c.body[0], [x + 1, y], 'on to the right');
  c.step(keys([], ['left']), c.pace);
  assert.deepEqual(c.body[0], [x + 2, y], 'not straight back on itself');
  c.step(keys([], ['down']), c.pace);
  assert.deepEqual(c.body[0], [x + 2, y + 1], 'down');
  let moves = 0;
  for (; moves < 40 && !c.over; moves++) c.step(keys(), c.pace);
  assert.ok(c.over, 'into the bottom wall');
  assert.ok(moves > 1, 'not straight away');
  assert.ok(c.body.every(([bx, by]) => bx >= 0 && by >= 0 && by < 16), 'never through it');
});

test('caterpillar: answers the stick quickly, and takes two quick turns one after the other', () => {
  const c = new Caterpillar(fixed(0.99));
  const [x, y] = c.body[0]!;
  // Halfway to its next move, a turn down: it turns now.
  c.step(keys(), c.pace / 2);
  c.step(keys([], ['down']), 0.001);
  assert.deepEqual(c.body[0], [x, y + 1], 'turned straight away');
  // Up isn't allowed (straight back), but left then up, pressed together, are both taken in turn.
  c.step(keys([], ['left', 'up']), 0.001);
  c.step(keys(), c.pace);
  c.step(keys(), c.pace);
  assert.equal(c.heading, 'up', 'left, then up');
});

test('caterpillar: a leaf makes it longer and a little quicker; bumping into itself ends the round', () => {
  const c = new Caterpillar(fixed(0.99));
  const [x, y] = c.body[0]!;
  c.leaf = [x + 1, y];
  const pace = c.pace;
  c.step(keys(), c.pace);
  assert.equal(c.score, 1);
  assert.ok(c.pace < pace, 'quicker');
  c.leaf = [x + 2, y];
  c.step(keys(), c.pace);
  c.step(keys(), c.pace);
  assert.equal(c.body.length, 5, 'longer');
  // Round in a tight square: it runs into its own middle.
  for (const way of ['down', 'left', 'up'] as const) c.step(keys([], [way]), c.pace);
  assert.ok(c.over, 'bumped into itself');
});

test('brick bash: the ball waits on the bat till you serve, breaks bricks, and three lost balls end the round', () => {
  const b = new BrickBash();
  b.step(keys(), 1);
  assert.ok(b.waiting, 'waiting to be served');
  b.step(keys([], ['a']), 0);
  assert.ok(!b.waiting);
  for (let i = 0; i < 400 && b.score === 0; i++) b.step(keys(), 1 / 60);
  assert.ok(b.score > 0, 'a brick knocked out');
  // Bat out of the way: the ball goes past it, three times.
  for (let lost = 0; lost < 3; lost++) {
    b.step(keys([], ['a']), 0);
    for (let i = 0; i < 2000 && !b.waiting; i++) {
      b.bat = b.ball.x < 80 ? 150 : 10;
      b.step(keys(), 1 / 60);
    }
  }
  assert.ok(b.over, 'all three balls gone');
});

test('parcel dash: the van keeps to the road, turns at junctions, and delivers when it pulls up outside', () => {
  // A crossroads: a road east–west along row 5, and one north–south down column 5.
  const road = (x: number, y: number) => (y === 5 && x >= 0 && x <= 10) || (x === 5 && y >= 0 && y <= 10);
  const drop = { home: 'home-x', name: 'A house', at: [5, 9] as Tile, door: [6, 9] as Tile, colour: '#e94f4f', done: false };
  // At the far end of the road, pressing on: it stays on the road.
  const end = new ParcelDash([9, 5], [{ ...drop, at: [5, 0] }], road);
  for (let i = 0; i < 60; i++) end.step(keys(['right'], i === 0 ? ['right'] : []), 1 / 30);
  assert.deepEqual([end.x, end.y], [10, 5], 'stopped at the end of the road');
  // Pressing down a long way from a turning: it waits. Just short of one: it drives on to it, then turns.
  const wait = new ParcelDash([0, 5], [drop], road);
  for (let i = 0; i < 30; i++) wait.step(keys(['down'], i === 0 ? ['down'] : []), 1 / 30);
  assert.deepEqual([wait.x, wait.y], [0, 5], 'no turning near: it waits');
  const van = new ParcelDash([3, 5], [drop], road);
  for (let i = 0; i < 90 && !drop.done; i++) van.step(keys(['down'], i === 0 ? ['down'] : []), 1 / 30);
  assert.equal(van.x, 5, 'turned at the junction');
  assert.ok(drop.done, 'delivered');
  assert.ok(van.done && van.stars >= 1);
});

test('parcel dash: on a two-lane road the van moves across into the other lane, either side, to get past', () => {
  // A road two lanes wide, along rows 5 and 6.
  const road = (x: number, y: number) => (y === 5 || y === 6) && x >= 0 && x <= 30;
  const drop = { home: 'home-x', name: 'A house', at: [30, 0] as Tile, door: [30, 0] as Tile, colour: '#e94f4f', done: false };
  const van = new ParcelDash([10, 6], [drop], road);
  for (let i = 0; i < 15; i++) van.step(keys(['right'], i === 0 ? ['right'] : []), 1 / 30);
  assert.equal(van.y, 6, 'it stays in the lane it’s in');
  // Up, while still going right: across into the other lane, and on.
  const x = van.x;
  for (let i = 0; i < 15; i++) van.step(keys(['right', 'up'], i === 0 ? ['up'] : []), 1 / 30);
  assert.equal(van.y, 5, 'over into the other lane');
  assert.ok(van.x > x, 'still going');
  // Up again: there's no road there, so it stays put.
  for (let i = 0; i < 15; i++) van.step(keys(['up'], i === 0 ? ['up'] : []), 1 / 30);
  assert.equal(van.y, 5);
});

test('parcel dash: driving into a vehicle is a crash, with time added; past one in the next lane is not; and you can drive away', () => {
  const road = (x: number, y: number) => (y === 5 || y === 6) && x >= 0 && x <= 30;
  const drop = { home: 'home-x', name: 'A house', at: [30, 0] as Tile, door: [30, 0] as Tile, colour: '#e94f4f', done: false };
  // A bus (three tiles long) in the next lane: overtaking it is fine.
  const bus = { x: 15, y: 5, facing: 'right' as const, reach: 1 };
  const van = new ParcelDash([10, 6], [drop], road);
  for (let i = 0; i < 60; i++) van.step(keys(['right'], i === 0 ? ['right'] : []), 1 / 30, [bus]);
  assert.ok(van.x > 16, 'past the bus');
  assert.equal(van.crashes, 0, 'no crash going past');
  // A bus in its own lane, ahead: a crash.
  const ahead = { x: van.x + 4, y: 6, facing: 'right' as const, reach: 1 };
  const before = van.time;
  for (let i = 0; i < 60 && !van.crashed; i++) van.step(keys(['right']), 1 / 30, [ahead]);
  assert.equal(van.crashes, 1, 'crashed into it');
  assert.ok(van.time - before >= 5, 'five seconds added');
  // Stopped a moment, then back the other way, clear of it, without crashing again.
  for (let i = 0; i < 60; i++) van.step(keys(['left'], i === 0 ? ['left'] : []), 1 / 30, [ahead]);
  assert.ok(van.x < ahead.x - 3, 'drove away');
  assert.equal(van.crashes, 1, 'one crash for one bump');
});

test('parcel dash in the town: parcels for houses the van can reach, and the town none the wiser', () => {
  const played = fresh();
  const untouched = fresh();
  run(played, 600);
  run(untouched, 600);
  const game = plan(played, doorInto('depot'), Math.random)!;
  assert.equal(game.drops.length, 3);
  assert.equal(new Set(game.drops.map((d) => d.home)).size, 3, 'three different houses');
  const roads = played.traffic.roads()!;
  assert.ok(roads.drivable(game.x, game.y), 'the van starts on the road');
  for (const d of game.drops) assert.ok(roads.drivable(...d.at), `${d.name}: pulled up on the road`);
  // Drive about a bit too.
  for (let i = 0; i < 120; i++) game.step(keys(['left']), 1 / 30);
  run(played, 600);
  run(untouched, 600);
  assert.deepEqual(snapshot(played), snapshot(untouched), 'the story goes on just the same');
});
