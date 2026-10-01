import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersonalityBrain } from '../src/sim/brain.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import type { Intent } from '../src/sim/person.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';

const fresh = () => new Simulation(structuredClone(STARTER));
const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
const until = (sim: Simulation, hour: number) => run(sim, Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR));

/** Keep the shop's staff at home: steered, and told nothing. */
const keepStaffHome = (sim: Simulation) => {
  for (const p of sim.staffOf('shop')) sim.interactions.control(p, true);
};

/** Saturday morning, with the shop's staff kept at home since six: nobody else has work to go to, and the shop should be open. */
const saturday = () => {
  const sim = run(fresh(), 5 * TICKS_PER_DAY);
  keepStaffHome(sim);
  return until(sim, 9.5);
};

test('the shop is only open while someone is minding it, and customers leave when it shuts', () => {
  const sim = until(fresh(), 12);
  assert.ok(sim.venueOpen('shop'), 'open at noon, with Wes in');
  // Everyone minding it walks out.
  for (const p of sim.staffOf('shop')) {
    sim.interactions.control(p, true);
    sim.interactions.command(p, { kind: 'wander', to: { level: 'town', p: [110, 49] } });
  }
  for (let t = 0; t < TICKS_PER_HOUR && sim.venueOpen('shop'); t++) sim.step();
  assert.ok(!sim.venueOpen('shop'), 'shut once they’ve gone');
  assert.ok(sim.events.some((e) => e.text.includes('Corner Shop is shut')));
  run(sim, TICKS_PER_HOUR / 2);
  const inside = sim.people.filter((p) => p.level === 'shop' && sim.present(p));
  assert.deepEqual(inside.map((p) => p.name), [], 'nobody left inside');
});

test('people who need the shop queue outside until it opens, and give up if it takes too long', () => {
  const sim = saturday();
  assert.ok(!sim.venueOpen('shop'));
  // Someone at home with nothing in (who hasn't already given up on it this morning): waiting for the shop is on their mind.
  const shopper = sim.people.find((p) => !p.npc && p.home && sim.phaseOf(p) === 'home' && p.company !== 'shop' && p.lastGaveUp < 0)!;
  sim.world.pantries![shopper.home!] = 0;
  const options = sim.peek(() => new PersonalityBrain().options(shopper, sim));
  const queue = options.find((o) => o.intent.kind === 'queue')?.intent as Extract<Intent, { kind: 'queue' }> | undefined;
  assert.ok(queue, 'the shop is on their list, as a queue');

  // Send them, and wait.
  sim.setBrain(shopper.id, { decide: () => queue });
  sim.interrupt(shopper);
  for (let t = 0; t < TICKS_PER_HOUR && !(shopper.intent?.kind === 'queue' && shopper.phase === 'doing'); t++) sim.step();
  assert.equal(shopper.level, 'town', 'outside, on the pavement');
  sim.clearBrain(shopper.id);
  run(sim, TICKS_PER_HOUR);
  assert.ok(sim.events.some((e) => e.text.startsWith(`😤 ${shopper.name} gave up`)), 'fed up after the longest wait');
});

test('when the shop opens, the queue goes in', () => {
  const sim = saturday();
  const shopper = sim.people.find((p) => !p.npc && p.home && sim.phaseOf(p) === 'home' && p.company !== 'shop')!;
  sim.world.pantries![shopper.home!] = 0;
  sim.setBrain(shopper.id, { decide: () => ({ kind: 'queue', level: 'shop', wait: 2 * TICKS_PER_HOUR }) });
  sim.interrupt(shopper);
  for (let t = 0; t < TICKS_PER_HOUR && !(shopper.intent?.kind === 'queue' && shopper.phase === 'doing'); t++) sim.step();
  sim.clearBrain(shopper.id);
  // Wes turns up.
  for (const p of sim.staffOf('shop')) sim.interactions.control(p, false);
  for (let t = 0; t < 2 * TICKS_PER_HOUR && shopper.level !== 'shop'; t++) sim.step();
  assert.equal(shopper.level, 'shop', 'in they went');
});

test('a delivery lorry comes to the Corner Shop first thing on a Monday: pulls up at the kerb (not on the crossing), unloads, and drives off out of town', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const roads = sim.traffic.roads()!;
  let pulledUp: { x: number; y: number } | undefined;
  let came = false;
  for (let t = 0; t < 3 * TICKS_PER_HOUR; t++) {
    sim.step();
    const lorry = sim.traffic.cars.find((c) => c.lorry);
    came ||= !!lorry;
    if (lorry && sim.deliveries.unloading(lorry)) pulledUp ??= { x: lorry.x, y: lorry.y };
  }
  assert.ok(came, 'a lorry came');
  assert.ok(pulledUp, 'and pulled up');
  assert.equal(roads.floorAt(pulledUp!.x, pulledUp!.y), 'road', 'on the road, not on the crossing');
  assert.ok(Math.abs(pulledUp!.x - 104) <= 8, 'outside the shop');
  assert.ok(sim.events.some((e) => /Corner Shop's delivery is here/.test(e.text)));
  assert.ok(!sim.traffic.cars.some((c) => c.lorry), 'and off out of town again');
});
