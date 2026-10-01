import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { manhattan } from '../src/sim/geometry.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, run } from './town.ts';

test('people with a car keep it near home, drive it a long way, park in a bay and walk on', () => {
  const sim = run(fresh(), 1);
  assert.ok(sim.cars.owned.length >= 4, `${sim.cars.owned.length} cars, each in a bay`);
  for (const own of sim.cars.owned) {
    const p = sim.person(own.owner)!;
    const door = sim.world.portals.find((d) => d.b.level === p.home)!.a.p;
    assert.ok(manhattan(own.bay.def.p, door) <= 25, `${p.name}'s car is near home`);
    assert.deepEqual([own.car.x, own.car.y], own.bay.def.p);
  }
  let drove: string | undefined;
  let parkedAway = false;
  for (let t = 0; t < 2 * TICKS_PER_DAY && !parkedAway; t++) {
    sim.step();
    const trip = sim.cars.trips[0];
    if (trip) drove ??= trip.own.owner;
    const own = drove ? sim.cars.owned.find((o) => o.owner === drove) : undefined;
    if (own && !sim.cars.trips.some((tr) => tr.own === own) && own.car.parked) {
      parkedAway = true;
      const p = sim.person(drove!)!;
      assert.ok(!p.riding, 'out of the car');
      assert.deepEqual([own.car.x, own.car.y], own.bay.def.p, 'parked in the bay it drove to');
    }
  }
  assert.ok(drove && parkedAway, 'someone drove somewhere and parked');
  assert.deepEqual(validate(sim.world), []);
});

test('leaving town, the car goes too', () => {
  const sim = run(fresh(), 1);
  const own = sim.cars.owned[0]!;
  sim.removePerson(own.owner);
  run(sim, 600);
  assert.ok(!sim.cars.owned.includes(own));
  assert.ok(own.car.removed, 'driven off out of town');
});
