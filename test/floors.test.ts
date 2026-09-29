import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { Tile, WorldDef } from '../src/sim/world.ts';
import { addFloor, floorToRemove, planFloor, removeFloor, type Floor } from '../src/worlds/edit.ts';
import { placementProblem } from '../src/worlds/placement.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
const until = (sim: Simulation, hour: number) => {
  for (let t = Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR); t > 0; t--) sim.step();
  return sim;
};

/** Somewhere on a level the stairs can go. */
const stairsSpot = (w: WorldDef, level: string): Tile => {
  const l = w.levels.find((x) => x.id === level)!;
  for (let y = 1; y < l.size[1]; y++) for (let x = 1; x < l.size[0]; x++) if (!placementProblem(l, w.portals, 'stairs', [x, y])) return [x, y];
  throw new Error('nowhere for stairs');
};

test('stairs up make a new floor: the same size, its own walls, and stairs back down in the same spot', () => {
  const w = world();
  const at = stairsSpot(w, 'home-rowan');
  const floor = planFloor(w, 'home-rowan', at) as Floor;
  assert.equal(typeof floor, 'object');
  addFloor(w, floor);
  const up = w.levels.find((l) => l.id === floor.level.id)!;
  assert.equal(up.name, 'First floor');
  assert.equal(up.floorOf, 'home-rowan');
  assert.deepEqual(up.size, w.levels.find((l) => l.id === 'home-rowan')!.size);
  assert.ok(up.furniture.some((f) => f.t === 'stairs' && f.p[0] === at[0] && f.p[1] === at[1]));
  assert.ok(w.levels.find((l) => l.id === 'home-rowan')!.furniture.some((f) => f.t === 'stairs'));
  assert.ok(w.portals.some((p) => p.kind === 'stairs' && p.a.level === 'home-rowan' && p.b.level === up.id));
  assert.deepEqual(validate(w), []);
  // Another floor on top is the second.
  const again = planFloor(w, up.id, stairsSpot(w, up.id)) as Floor;
  assert.equal(again.level.name, 'Second floor');
});

test('upstairs is home: a bed moved up there is where they sleep', () => {
  const w = world();
  const floor = planFloor(w, 'home-rowan', stairsSpot(w, 'home-rowan')) as Floor;
  addFloor(w, floor);
  // Rowan's bed goes upstairs.
  const home = w.levels.find((l) => l.id === 'home-rowan')!;
  const up = w.levels.find((l) => l.id === floor.level.id)!;
  const bed = home.furniture.find((f) => f.t === 'bed' && f.owner === 'rowan') ?? home.furniture.find((f) => f.t === 'bed')!;
  home.furniture.splice(home.furniture.indexOf(bed), 1);
  const spot = (() => {
    for (let y = 1; y < up.size[1]; y++) for (let x = 1; x < up.size[0]; x++) if (!placementProblem(up, w.portals, bed.t, [x, y])) return [x, y] as Tile;
    throw new Error('no room');
  })();
  up.furniture.push({ ...bed, p: spot });
  assert.deepEqual(validate(w), [], 'a bed upstairs counts');
  const sim = until(new Simulation(w), 3);
  const rowan = sim.person('rowan')!;
  assert.equal(rowan.level, up.id, 'asleep upstairs');
  assert.equal(rowan.intent?.kind, 'sleep');
});

test('only floors you added come off, from the top, and the house goes back to how it was', () => {
  const w = world();
  const before = structuredClone(w);
  const first = planFloor(w, 'home-rowan', stairsSpot(w, 'home-rowan')) as Floor;
  addFloor(w, first);
  const second = planFloor(w, first.level.id, stairsSpot(w, first.level.id)) as Floor;
  addFloor(w, second);
  assert.match(floorToRemove(w, first.level.id) as string, /floor above/);
  assert.match(floorToRemove(w, 'home-rowan') as string, /added/);
  removeFloor(w, floorToRemove(w, second.level.id) as Floor);
  removeFloor(w, floorToRemove(w, first.level.id) as Floor);
  assert.deepEqual(w, before);
  // And in a running town: anyone up there is brought back down.
  const w2 = world();
  addFloor(w2, planFloor(w2, 'home-rowan', stairsSpot(w2, 'home-rowan')) as Floor);
  const sim = new Simulation(w2);
  const up = w2.levels.find((l) => l.floorOf)!.id;
  const rowan = sim.person('rowan')!;
  rowan.level = up;
  sim.removeLevel(up, { level: 'home-rowan', p: [2, 2] });
  assert.equal(rowan.level, 'home-rowan');
  assert.ok(!sim.levels.has(up));
  for (let i = 0; i < 200; i++) sim.step();
});

test('a floor added to an office is part of the company: its people may work up there', () => {
  const w = world();
  const floor = planFloor(w, 'first', stairsSpot(w, 'first')) as Floor;
  assert.equal(floor.level.name, 'Second floor', 'the office already has two');
  addFloor(w, floor);
  assert.ok(w.companies.find((c) => c.id === 'head')!.levels.includes(floor.level.id));
  assert.deepEqual(validate(w), []);
});

test('one floor above each: more stairs on a floor that has one don’t stack another, and there’s a limit', () => {
  const w = world();
  const first = planFloor(w, 'home-rowan', stairsSpot(w, 'home-rowan')) as Floor;
  addFloor(w, first);
  assert.match(planFloor(w, 'home-rowan', stairsSpot(w, 'home-rowan')) as string, /already a floor above/);
  assert.equal(typeof planFloor(w, 'first', stairsSpot(w, 'first')), 'object', 'the office can still go up from its top floor');
  assert.match(planFloor(w, 'ground', stairsSpot(w, 'ground')) as string, /already a floor above/, 'but not from its ground floor');
  const second = planFloor(w, first.level.id, stairsSpot(w, first.level.id)) as Floor;
  addFloor(w, second);
  assert.match(planFloor(w, second.level.id, stairsSpot(w, second.level.id)) as string, /as tall as a house goes/);
  assert.deepEqual(validate(w), []);
});
