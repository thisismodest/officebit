import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourOf } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh } from './town.ts';

const until = (sim: ReturnType<typeof fresh>, hour: number) => {
  while (hourOf(sim.tick) < hour) sim.step();
  return sim;
};

test('the parcel van goes round homes in the morning, the driver aboard, and comes back to its bay', () => {
  const sim = fresh();
  // The van's in its bay from the first step.
  sim.step();
  const van = sim.parcels.van!;
  const home = [van.x, van.y];
  until(sim, 10.2);
  assert.ok(!van.parked && sim.person('kit')!.riding === van.id, 'out on its round, with Kit driving');
  until(sim, 13.5);
  const parcels = sim.events.filter((e) => /📦 A parcel for/.test(e.text));
  assert.ok(parcels.length >= 2, `${parcels.length} parcels delivered`);
  assert.ok(van.parked && van.x === home[0] && van.y === home[1], 'back in its bay');
  assert.ok(!sim.person('kit')!.riding, 'and Kit is out');
  assert.deepEqual(validate(sim.world), []);
});

test('no driver in, no round', () => {
  const sim = fresh();
  sim.removePerson('kit');
  until(sim, 11);
  assert.ok(sim.parcels.van?.parked);
  assert.ok(sim.events.some((e) => /No parcel round/.test(e.text)));
});
