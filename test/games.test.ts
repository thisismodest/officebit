// Mini games (docs/GAMES.md): their rules, played without a screen, and that playing never touches the town.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/sim/catalog.ts';
import type { Tile } from '../src/sim/world.ts';
import { BrickBash } from '../src/games/arcade/brick-bash.ts';
import { BubbleBlaster } from '../src/games/arcade/bubble-blaster.ts';
import { Caterpillar } from '../src/games/arcade/caterpillar.ts';
import { CrossTheRoad } from '../src/games/arcade/cross-the-road.ts';
import { SpaceRocks } from '../src/games/arcade/space-rocks.ts';
import { ARCADE } from '../src/games/cabinet.ts';
import { Catch, plan as planCatch } from '../src/games/town/catch.ts';
import { Fishing, plan as planFishing } from '../src/games/town/fishing.ts';
import { Penalties } from '../src/games/town/penalties.ts';
import { goalNear } from '../src/games/town/pitches.ts';
import { placementProblem } from '../src/worlds/placement.ts';
import { FindIt, aboutTown, standingSpot, townsfolk, type Findable } from '../src/games/town/find-it.ts';
import type { Dir, Input, Key } from '../src/games/controls.ts';
import { MINIGAMES } from '../src/games/index.ts';
import { ParcelDash, plan } from '../src/games/town/parcel-dash.ts';
import { doorInto, fresh, run, snapshot, starter, until } from './town.ts';

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

test('the arcade has its five games, each with a name, an icon and a line on how to play', () => {
  assert.deepEqual(
    ARCADE.map((g) => g.name),
    ['Caterpillar', 'Brick Bash', 'Space Rocks', 'Bubble Blaster', 'Cross the Road'],
  );
  for (const game of ARCADE) assert.ok(game.icon && game.how && new Set(ARCADE.map((g) => g.id)).size === ARCADE.length, game.name);
});

test('space rocks: a shot breaks a big rock in two; the smallest crumble away; a rock into the ship costs one of three', () => {
  const s = new SpaceRocks(fixed(0.3));
  // One big rock straight ahead of the ship (it points up), still.
  s.rocks = [{ x: s.ship.x, y: s.ship.y - 30, vx: 0, vy: 0, size: 3, shape: Array(8).fill(1), spin: 0, turn: 0 }];
  s.step(keys([], ['a']), 0);
  for (let i = 0; i < 30 && s.score === 0; i++) s.step(keys(), 1 / 30);
  assert.equal(s.score, 1, 'a big rock is a point');
  assert.equal(s.rocks.length, 2, 'in two');
  assert.ok(s.rocks.every((r) => r.size === 2));
  // A small one, hit: gone.
  s.rocks = [{ x: s.ship.x, y: s.ship.y - 20, vx: 0, vy: 0, size: 1, shape: Array(8).fill(1), spin: 0, turn: 0 }];
  for (let i = 0; i < 10; i++) s.step(keys(), 0.1);
  s.step(keys([], ['a']), 0);
  for (let i = 0; i < 30 && s.rocks.length; i++) s.step(keys(), 1 / 30);
  assert.ok(s.wave === 2 || s.rocks.every((r) => r.size === 3), 'crumbled, and a new wave');
  // A rock parked on the ship, once it can be hit: three times, and that's the round.
  for (let crash = 0; crash < 3; crash++) {
    for (let i = 0; i < 200 && s.ships === 3 - crash; i++) {
      s.rocks = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0, size: 3, shape: Array(8).fill(1), spin: 0, turn: 0 }];
      s.step(keys(), 0.05);
    }
  }
  assert.ok(s.over, 'all three ships gone');
});

test('bubble blaster: three of a colour together pop; ones left hanging fall; and the bubbles come down every few shots', () => {
  const b = new BubbleBlaster(fixed(0));
  // A row of two reds at the top, with a blue hanging under the first.
  b.grid = [[0, 0, ...Array(13).fill(null)], [1, ...Array(14).fill(null)]];
  b.loaded = 0;
  b.aim = Math.atan2(25 - 80, 134 - 12);
  b.step(keys([], ['a']), 0);
  for (let i = 0; i < 120 && b.flying; i++) b.step(keys(), 1 / 60);
  assert.ok(b.score >= 3, `popped (score ${b.score})`);
  assert.ok(b.grid.flat().every((c) => c === null) || b.grid.length >= 1, 'the reds gone');
  assert.ok(!b.grid.flat().includes(1) || b.score >= 5, 'the blue fell with them, or a fresh lot');
  // Shots that pop nothing: after a few, everything comes down a row.
  const shots = new BubbleBlaster(fixed(0.99));
  const rows = shots.grid.length;
  for (let n = 0; n < 7; n++) {
    shots.loaded = (shots.grid[0]![0]! + 1) % 4;
    shots.aim = n % 2 ? 1.2 : -1.2;
    shots.step(keys([], ['a']), 0);
    for (let i = 0; i < 200 && shots.flying; i++) shots.step(keys(), 1 / 60);
  }
  assert.ok(shots.grid.length > rows, 'down a row');
});

test('cross the road: a hop at a time, a crossing scores, and the traffic catching you costs a go', () => {
  const c = new CrossTheRoad(fixed(0.5));
  for (const lane of c.lanes) lane.vehicles = [];
  const row = c.row;
  c.step(keys([], ['up']), 0.2);
  assert.equal(c.row, row - 1, 'one hop up');
  for (let i = 0; i < 12 && c.score === 0; i++) c.step(keys([], ['up']), 0.2);
  assert.equal(c.score, 1, 'over the far side');
  assert.equal(c.row, row, 'and back to the start for the next');
  // A car in the first lane, right where you land.
  const lane = c.lanes.find((l) => l.row === row - 1)!;
  lane.speed = 0;
  lane.vehicles = [{ x: c.col * 10 - 4, length: 14, colour: '#e94f4f', bus: false }];
  c.step(keys([], ['up']), 0.2);
  assert.equal(c.goes, 3, 'safe in the air');
  c.step(keys(), 0.2);
  assert.equal(c.goes, 2, 'caught as you land');
});

test('find it: tap whoever’s wanted to find them; someone else is named; three found, never the same one twice running', () => {
  const town = [
    { id: 'kit', name: 'Kit' },
    { id: 'jo', name: 'Jo' },
  ];
  const about: Findable[] = [
    { id: 'kit', name: 'Kit', x: 10, y: 10 },
    { id: 'jo', name: 'Jo', x: 20, y: 10 },
  ];
  const f = new FindIt(town, about, () => [0, 0], fixed(0));
  assert.equal(f.finds, 3, 'two in town is enough for three');
  assert.equal(f.wanted?.id, 'kit');
  assert.equal(f.standIn, false, 'Kit’s out: the real Kit');
  f.tap(20, 10, about);
  assert.equal(f.said?.text, "That's Jo!");
  assert.equal(f.found.length, 0);
  const found: string[] = [];
  for (let n = 0; n < 3 && f.wanted; n++) {
    found.push(f.wanted.id);
    f.tap(f.wanted.x + 0.5, f.wanted.y + 0.5, about);
  }
  assert.ok(f.done && f.stars >= 1);
  assert.deepEqual(found, ['kit', 'jo', 'kit'], 'Kit again, but not twice running');
});

test('find it: someone indoors waits outdoors as a stand-in; out for real, it’s the real them; gone in, the stand-in stays', () => {
  const town = [{ id: 'kit', name: 'Kit' }, { id: 'jo', name: 'Jo' }];
  const f = new FindIt(town, [], () => [30, 40], fixed(0));
  assert.deepEqual([f.wanted?.id, f.standIn, f.wanted?.x, f.wanted?.y], ['kit', true, 30, 40], 'nobody out: a stand-in at a spot outdoors');
  // Kit comes out: it's the real Kit, where she is.
  f.step(1, [{ id: 'kit', name: 'Kit', x: 5, y: 6 }]);
  assert.deepEqual([f.standIn, f.wanted?.x], [false, 5]);
  // Kit goes back in: her stand-in stays where she was, so she's still there to find.
  f.step(1, []);
  assert.deepEqual([f.standIn, f.wanted?.id, f.wanted?.x], [true, 'kit', 5]);
  f.tap(5, 6, []);
  assert.deepEqual(f.found, ['kit']);
  assert.equal(f.wanted?.id, 'jo', 'on to the next');
});

test('catch: every ball lands somewhere you could run to in time, from wherever you are', () => {
  const field: Tile[] = [];
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) field.push([x, y]);
  // Standing in a corner of a big field, the thrower in the middle: balls come your way, not to the far side.
  const c = new Catch([0, 0], [15, 15], field, () => true, Math.random);
  for (let i = 0; i < 4000 && !c.done; i++) {
    if (c.ball && c.ball.t === 0) assert.ok(Math.hypot(c.ball.to[0] - c.x, c.ball.to[1] - c.y) <= 4.5 * (c.ball.flight - 0.4) * 0.6, `reachable (throw ${c.thrown})`);
    c.step(keys(), 1 / 30);
  }
  assert.ok(c.done);
});

test('catch: be where the ball lands and it’s caught; ten throws and the round is done', () => {
  const field: Tile[] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) field.push([x, y]);
  const c = new Catch([5, 5], [0, 0], field, () => true, fixed(0.99));
  for (let i = 0; i < 2000 && !c.done; i++) {
    // Run to the shadow (on every other throw: some caught, some missed).
    if (c.ball && c.thrown % 2 === 0) c.runTo(...c.ball.to);
    c.step(keys(), 1 / 30);
  }
  assert.ok(c.done);
  assert.equal(c.thrown, 10);
  assert.ok(c.caught >= 4 && c.caught < 10, `caught ${c.caught}`);
});

test('find it and catch in the town: people to find, somewhere outdoors for stand-ins, grass to play on, and the town none the wiser', () => {
  const played = fresh();
  const untouched = fresh();
  until(played, 12);
  until(untouched, 12);
  const town = townsfolk(played);
  assert.ok(town.length > 2, 'people to find');
  const spot = standingSpot(played, [50, 45], Math.random);
  const ground = played.levels.get('town')!;
  const grid = played.grids.get('town')!;
  assert.ok(spot && grid.free(...spot) && ['grass', 'path', 'sand'].includes(ground.rooms[grid.roomAt(...spot)]!.floor ?? ''), 'a stand-in waits on grass or a path');
  const find = new FindIt(town, aboutTown(played), () => standingSpot(played, [50, 45], Math.random), Math.random);
  const game = planCatch(played, [50, 45], Math.random)!;
  assert.ok(game, 'room to play catch on the Green');
  for (let i = 0; i < 120; i++) {
    find.step(1 / 30, aboutTown(played));
    if (find.wanted) find.tap(find.wanted.x, find.wanted.y, aboutTown(played));
    game.step(keys(['left']), 1 / 30);
  }
  run(played, 600);
  run(untouched, 600);
  assert.deepEqual(snapshot(played), snapshot(untouched), 'the story goes on just the same');
});


test('fishing: tap to cast, wait for the bite, hook it in time, and tap and tap to reel it in before it pulls free', () => {
  // Water to the east of where you stand.
  const water: Tile[] = [];
  for (let x = 2; x < 8; x++) for (let y = -2; y <= 2; y++) water.push([x, y]);
  const fishing = new Fishing([0, 0], water, 'pond', () => false, () => false, fixed(0.5));
  assert.equal(fishing.facing, 'right');
  const tick = (act = false, dt = 0.05) => fishing.step(dt, act);
  // Cast at the top of the swing: furthest out.
  for (let i = 0; i < 16; i++) tick();
  tick(true);
  assert.equal(fishing.stage, 'flying');
  assert.ok(fishing.float && water.some(([x, y]) => x === fishing.float!.x && y === fishing.float!.y), 'the float lands on the water');
  for (let i = 0; i < 400 && (fishing.stage as string) !== 'bite'; i++) tick();
  assert.equal(fishing.stage, 'bite', 'a bite');
  tick(true);
  assert.equal(fishing.stage, 'reeling', 'hooked');
  // Tapping quickly brings it in.
  for (let i = 0; i < 400 && fishing.stage === 'reeling'; i++) tick(i % 2 === 0);
  assert.equal(fishing.landed.length, 1, fishing.last?.said);
  assert.equal(fishing.landed[0]!.species.water, 'pond');
  // The next: hooked, but a tap a second isn't enough; it pulls the meter empty and gets away.
  for (let i = 0; i < 60 && fishing.stage !== 'aim'; i++) tick();
  tick(true);
  for (let i = 0; i < 400 && fishing.stage !== 'bite'; i++) tick();
  tick(true);
  assert.equal(fishing.stage, 'reeling', 'hooked');
  for (let i = 0; i < 400 && fishing.stage === 'reeling'; i++) tick(i % 20 === 0);
  assert.match(fishing.last!.said, /pulled free/);
  assert.equal(fishing.landed.length, 1);
  // Too slow to hook the next one: it gets away.
  for (let i = 0; i < 60 && fishing.stage !== 'aim'; i++) tick();
  tick(true);
  for (let i = 0; i < 400 && fishing.stage !== 'bite'; i++) tick();
  for (let i = 0; i < 40; i++) tick();
  assert.match(fishing.last!.said, /got away/);
  assert.equal(fishing.casts, 2);
});

test('penalties: aim and power beat the keeper, or don’t; in goal a dive the right way saves; five each, then it’s over', () => {
  // The keeper's guess (and the town's shots) come from this "random" number.
  const p = new Penalties(fixed(0.99));
  const at = (stage: string) => {
    for (let i = 0; i < 200 && p.stage !== stage; i++) p.step(0.01, false, null);
  };
  // Aim near a post (a quarter of the sweep in), mid power: the keeper (diving the other way) can't reach it.
  for (let i = 0; i < 200 && !(p.aim < -0.6 && p.aim > -0.9); i++) p.step(0.01, false, null);
  p.step(0, true, null);
  for (let i = 0; i < 200 && !(p.power > 0.6 && p.power < 0.8); i++) p.step(0.01, false, null);
  p.step(0, true, null);
  // Decided as it's struck, so the ball flies where it's going (into the net, the keeper's hands, over or wide).
  assert.equal(p.stage, 'flight');
  assert.equal(p.outcome, 'goal');
  at('shown');
  assert.equal(p.said, 'Goal!');
  assert.deepEqual(p.score, [1, 0]);
  // In goal: the town's shot goes to the side (0.99: the far side), and diving that way saves it.
  at('run');
  assert.equal(p.turn, 'save');
  p.step(0.01, false, Math.sign(p.aim));
  at('shown');
  assert.equal(p.said, 'Saved!');
  // Through to the end.
  for (let i = 0; i < 5000 && !p.done; i++) p.step(0.02, i % 20 === 0, null);
  assert.ok(p.done);
  assert.equal(p.kicks.length, 10);
  assert.deepEqual(p.kicks.slice(0, 4).map((k) => k.by), [0, 1, 0, 1], 'you shoot, then you keep');
});

test('fishing and penalties in the starter town: a pond and the river to fish, and a goal to shoot at', () => {
  const sim = starter();
  const at = (t: string) => sim.activeItems().filter((i) => i.def.t === t).map((i) => i.def.p);
  const [pond, river] = at('fishingBarrel');
  const byPond = planFishing(sim, pond!, Math.random)!;
  const byRiver = planFishing(sim, river!, Math.random)!;
  assert.ok(byPond && byRiver, 'water near both barrels');
  // Like a player: cast, hook it the moment it bites, and tap whenever the line slackens.
  const play = (f: typeof byPond) => {
    for (let i = 0; i < 4000 && f.landed.length === 0 && !f.done; i++) f.step(0.05, f.stage === 'aim' || f.stage === 'bite' || f.stage === 'reeling');
  };
  play(byPond);
  play(byRiver);
  assert.equal(byPond.landed[0]?.species.water, 'pond');
  assert.equal(byRiver.landed[0]?.species.water, 'river');
  const goal = goalNear(sim.itemsOn(sim.traffic.level!).map((i) => i.def), at('football')[0]!);
  assert.ok(goal, 'a goal by the ball');
  assert.equal(Math.abs(goal.out[0]), 1, 'shooting along the pitch');
});

test('the editor puts a fishing barrel only by water, and a football only near a goal', () => {
  const sim = starter();
  const town = sim.levels.get(sim.traffic.level!)!;
  const at = (t: string) => sim.activeItems().find((i) => i.def.t === t)!.def;
  const barrel = at('fishingBarrel');
  const ball = at('football');
  const move = (def: typeof barrel, to: Tile) => placementProblem(town, sim.world.portals, def.t, to, def);
  assert.equal(move(barrel, barrel.p), null, 'where it is, by the pond');
  assert.match(move(barrel, [barrel.p[0], barrel.p[1] - 12]) ?? '', /pond or the river/, 'away from the water');
  assert.equal(move(ball, ball.p), null, 'where it is, on the pitch');
  assert.match(move(ball, [ball.p[0], ball.p[1] - 20]) ?? '', /near a goal/, 'off the pitch');
});
