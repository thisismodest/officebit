import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { CATALOG } from '../src/sim/catalog.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { buildingProblem, existing, inUse, newBuilding, putUp, takeDown } from '../src/worlds/buildings.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
/** Somewhere clear in the countryside, east of the cottages. */
const SPOT: [number, number] = [130, 72];

test('a house from the picker comes with a home to let, and newcomers can move in', () => {
  const w = world();
  assert.equal(buildingProblem(w, 'town', 'house', SPOT), null);
  const b = newBuilding([w], 'town', 'house', SPOT);
  putUp(w, b);
  assert.deepEqual(validate(w), []);
  const sim = new Simulation(w);
  assert.ok(sim.housing.vacant().some((h) => h.level.id === b.level.id), 'to let');
  takeDown(w, b);
  assert.ok(!w.levels.some((l) => l.id === b.level.id) && !w.portals.some((p) => p.b.level === b.level.id));
  assert.deepEqual(validate(w), []);
});

test('a shop from the picker is a company of its own, with a made-up name, that takes people on', () => {
  const w = world();
  const b = newBuilding([w], 'town', 'supermarket', SPOT);
  assert.ok(b.company?.walkIn && b.item.label && b.level.name === b.item.label, `called ${b.item.label}`);
  assert.notEqual(newBuilding([w, { ...w, companies: [...w.companies, b.company!] }], 'town', 'supermarket', SPOT).item.label, b.item.label, 'the next one gets another name');
  putUp(w, b);
  assert.deepEqual(validate(w), []);
  // The shop's checkouts the only jobs going (nobody else has a spare desk), so who takes one isn't down to luck.
  for (const level of w.levels) if (!b.company!.levels.includes(level.id)) level.furniture = level.furniture.filter((f) => !CATALOG[f.t]?.desk || !!f.owner);
  const sim = new Simulation(w);
  // People looking for work apply anywhere with a free desk: the new shop's checkouts too.
  for (const p of sim.people.filter((q) => q.company === 'head').slice(0, 6)) sim.careers.leave(p, 'fired');
  for (let t = 0; t < 7 * TICKS_PER_DAY && !sim.people.some((p) => p.company === b.company!.id); t++) sim.step();
  assert.ok(sim.people.some((p) => p.company === b.company!.id), 'someone works there within the week');
});

test('buildings someone lives or works in stay; empty ones can come down', () => {
  const w = world();
  const town = w.levels[0]!;
  const diner = existing(w, 'town', town.furniture.find((f) => f.t === 'diner')!)!;
  assert.deepEqual(inUse(w, diner).sort(), ['Dot', 'Ray']);
  const rowans = existing(w, 'town', town.furniture.find((f) => f.owner === 'rowan')!)!;
  assert.ok(inUse(w, rowans).includes('Rowan'));
  const toLet = town.furniture.find((f) => ['house', 'terrace', 'detached'].includes(f.t) && !f.owner)!;
  assert.deepEqual(inUse(w, existing(w, 'town', toLet)!), []);
});

test('not on the road, and a narrowboat only on the water, its door onto the bank', () => {
  const w = world();
  assert.ok(buildingProblem(w, 'town', 'house', [40, 68]));
  assert.ok(buildingProblem(w, 'town', 'narrowboat', SPOT), 'not on dry land');
  assert.equal(buildingProblem(w, 'town', 'narrowboat', [10, 146]), null, 'on the river by the bank');
});
