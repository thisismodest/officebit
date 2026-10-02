import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourOf } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh } from './town.ts';

const until = (sim: ReturnType<typeof fresh>, hour: number) => {
  while (hourOf(sim.tick) < hour) sim.step();
  return sim;
};

test('the parcel vans go round homes in the morning, each with its own driver, and come back to their bays', () => {
  const sim = fresh();
  // A van in each bay from the first step.
  sim.step();
  const vans = sim.parcels.vans.map((v) => v.car);
  assert.equal(vans.length, 3, 'three bays, three vans');
  const homes = vans.map((van) => [van.x, van.y].join());
  until(sim, 10.2);
  const drivers = vans.map((van) => sim.people.find((p) => p.riding === van.id)?.id);
  assert.ok(vans.every((van) => !van.parked), 'all out on their rounds');
  assert.deepEqual([...drivers].sort(), ['kit', 'rio', 'tam'], 'Kit, Rio and Tam driving one each');
  until(sim, 13.5);
  const parcels = sim.events.filter((e) => /📦 A parcel for/.test(e.text));
  assert.ok(parcels.length >= 6, `${parcels.length} parcels delivered`);
  assert.deepEqual(vans.map((van) => van.parked && [van.x, van.y].join()), homes, 'each back in its bay');
  assert.ok(['kit', 'rio', 'tam'].every((id) => !sim.person(id)!.riding), 'and the drivers are out');
  assert.deepEqual(validate(sim.world), []);
});

test('no driver in, no round', () => {
  const sim = fresh();
  for (const id of ['kit', 'rio', 'tam']) sim.removePerson(id);
  until(sim, 11.2);
  assert.ok(sim.parcels.vans.every((v) => v.car.parked));
  assert.ok(sim.events.some((e) => /No parcel round/.test(e.text)));
});

test('a loading bay put in later gets a van, which drives in to it', () => {
  const sim = fresh();
  sim.step();
  // Beside the others in the depot yard.
  const [last] = sim.activeItems().filter((i) => i.type.loading).sort((a, b) => b.def.p[0] - a.def.p[0]);
  const bay = sim.addItem('town', { t: 'loadingBay', p: [last!.def.p[0] + 2, last!.def.p[1]] })!;
  sim.step();
  const van = sim.parcels.vans.find((v) => v.bay === bay.index)!.car;
  const [w, h] = sim.levels.get('town')!.size;
  assert.ok(!van.parked && (van.x < 0 || van.y < 0 || van.x >= w || van.y >= h), 'on its way in from the edge of town');
  for (let t = 0; t < 2000 && !van.parked; t++) sim.step();
  assert.ok(van.parked, 'parked');
  assert.deepEqual([van.x, van.y], [bay.def.p[0], bay.def.p[1] + 0.5], 'in its bay');
});
