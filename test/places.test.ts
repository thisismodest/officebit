import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitAt, interiorOf, occupants } from '../src/sim/places.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';

const sim = new Simulation(structuredClone(STARTER));
const itemOf = (t: string, owner?: string) => sim.items.find((i) => i.def.t === t && (!owner || i.def.owner === owner))!;

test('the office leads to both floors, entry first', () => {
  const inside = interiorOf(sim, itemOf('officeBuilding'))!;
  assert.equal(inside.name, 'Head office');
  assert.deepEqual(inside.levels.map((l) => l.id), ['ground', 'first']);
});

test("a house leads to its owner's home, named after it", () => {
  const inside = interiorOf(sim, itemOf('detached', 'rowan'))!;
  assert.equal(inside.name, "Rowan's house");
  assert.deepEqual(inside.levels.map((l) => l.id), ['home-rowan']);
});

test('things without a door lead nowhere', () => {
  assert.equal(interiorOf(sim, itemOf('tree')), null);
});

test('occupants: everyone at home at the start, family, children and pets included', () => {
  const home = interiorOf(sim, itemOf('detached', 'rowan'))!;
  assert.deepEqual(occupants(sim, home.levels).map((p) => p.id).sort(), ['biscuit', 'finn', 'isla', 'jules', 'rowan']);
});

test('a door is clickable on itself and one tile either side along its wall, and nowhere else', () => {
  const entry = sim.world.portals.find((p) => p.b.level === 'home-rowan')!.b.p;
  const door = sim.levels.get('home-rowan')!.doors.find(([x, y]) => Math.abs(x - entry[0]) + Math.abs(y - entry[1]) === 1)!;
  for (const dx of [-1, 0, 1]) assert.equal(exitAt(sim, 'home-rowan', door[0] + dx, door[1])?.to.level, 'town');
  for (const [x, y] of [[door[0] - 2, door[1]], [door[0], door[1] - 2], [door[0] - 1, door[1] - 1]]) {
    assert.equal(exitAt(sim, 'home-rowan', x!, y!), null, `${x},${y} isn't the door`);
  }
});

test('houses facing up lead inside through the door on the row above them', () => {
  const house = sim.items.find((i) => i.def.faces === 'up' && i.def.owner)!;
  const inside = interiorOf(sim, house)!;
  assert.equal(inside.levels[0]!.id, `home-${house.def.owner}`);
});
