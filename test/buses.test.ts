import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { departureAfter } from '../src/sim/buses.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { placementProblem } from '../src/worlds/placement.ts';
import { STARTER } from '../src/worlds/starter.ts';

/** Every departure in the day after `from`, as hours. */
const timetable = (from: number) => {
  const times: number[] = [];
  for (let t = departureAfter(from); t < from + TICKS_PER_DAY; t = departureAfter(t)) times.push(Math.round(hourOf(t) * 60) / 60);
  return times;
};

test('the timetable: hourly by day, rush hour too, and a night bus every two hours', () => {
  const times = timetable(0);
  const between = (a: number, b: number) => times.filter((h) => h >= a && h < b);
  assert.equal(between(7, 10).length, 3, 'rush hour, morning');
  assert.equal(between(16, 19).length, 3, 'rush hour, evening');
  assert.deepEqual(between(10, 16), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(times.filter((h) => h >= 23 || h < 6).sort((a, b) => a - b), [1, 3, 5, 23]);
});

test('buses call at every stop in turn, both ways round the town, without turning round in the road, and people ride them', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const { runs } = sim.buses.plan()!;
  assert.equal(runs[0].stops.length, 8, 'eight stops');
  assert.deepEqual(runs[1].stops, [...runs[0].stops].reverse(), 'the other way round');
  const news: string[] = [];
  sim.onEvent((e) => news.push(e.text));
  const calls = new Map<string, string[]>();
  let turnedRound = false;
  const facing = new Map<string, string>();
  const OPPOSITE: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    for (const s of sim.buses.services) {
      // Each stop it's moved on from, in turn (an empty stop it pulls straight away from).
      const called = calls.get(s.car.id) ?? [];
      for (let i = called.length; i < Math.min(s.next, runs[s.run]!.stops.length); i++) called.push(runs[s.run]!.stops[i]!.def.label!);
      calls.set(s.car.id, called);
      if (facing.get(s.car.id) === OPPOSITE[s.car.facing]) turnedRound = true;
      facing.set(s.car.id, s.car.facing);
    }
  }
  const full = [...calls.values()].filter((c) => c.length === 8);
  assert.ok(full.length >= 40, `${full.length} buses went all the way round`);
  const orders = runs.map((run) => run.stops.map((s) => s.def.label).join());
  assert.ok(full.every((c) => orders.includes(c.join())), 'every stop, in order');
  assert.ok(orders.every((order) => full.some((c) => c.join() === order)), 'both ways round');
  assert.ok(!turnedRound, 'never straight back the way it came');
  const rides = news.filter((text) => /got on the bus/.test(text)).length;
  assert.ok(rides >= 3, `${rides} rides in a day`);
  assert.ok(sim.people.every((p) => !p.riding || sim.buses.services.some((s) => s.car.id === p.riding)), 'nobody left on a bus that has gone');
  assert.deepEqual(validate(sim.world), []);
});

test('waiting too long, they walk instead', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const plan = sim.buses.plan()!.runs[0];
  // Late at night (no bus for a while), someone at the first stop, going to the last.
  while (hourOf(sim.tick) < 23.5) sim.step();
  const p = sim.people.find((q) => !q.npc)!;
  const then = { kind: 'wander' as const, to: { level: 'town', p: sim.buses.waitAt(plan.stops.at(-1)!, 0) } };
  Object.assign(p, { level: 'town', x: sim.buses.waitAt(plan.stops[0]!)[0], y: sim.buses.waitAt(plan.stops[0]!)[1] });
  sim.setLevel(p, 'town');
  // Straight to the stop to wait (as `begin` does when the bus looks worth it).
  (sim as unknown as { begin(p: unknown, i: unknown, walk: boolean): void }).begin(p, { kind: 'bus', from: plan.stops[0]!.index, to: plan.stops.at(-1)!.index, run: 0, after: then }, true);
  for (let t = 0; t < sim.buses.patience + TICKS_PER_HOUR / 6 && p.intent?.kind === 'bus'; t++) sim.step();
  assert.notEqual(p.intent?.kind, 'bus', 'gave up on it');
  assert.ok(!p.riding, 'and walked');
});

test('a bus stop goes beside a road, and the route follows one put up or taken away', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const town = sim.levels.get('town')!;
  assert.match(placementProblem(town, sim.world.portals, 'busStop', [97, 57]) ?? '', /beside a road/, 'out in a field');
  assert.equal(placementProblem(town, sim.world.portals, 'busStop', [97, 53]), null, 'by Main Street');
  const stop = sim.addItem('town', { t: 'busStop', p: [97, 53], label: 'Main Street East' })!;
  const { runs } = sim.buses.plan()!;
  assert.ok(runs.every((run) => run.stops.includes(stop)), 'called at both ways round');
  assert.ok(runs.every((run) => run.legs.every((leg) => leg.length > 0)), 'a way to every stop');
  sim.removeItem(stop);
  assert.equal(sim.buses.plan()!.runs[0].stops.length, 8, 'and gone again');
});
