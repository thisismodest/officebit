import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { departure } from '../src/sim/planes.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, onMap } from './town.ts';

test('flights leave the first airfield on the hour and the next on the half hour, by day', () => {
  const at = (hour: number) => Math.round((hour - 6) * TICKS_PER_HOUR);
  assert.equal(hourOf(departure(at(8.5), 0)), 9);
  assert.equal(hourOf(departure(at(8.6), 1)), 9.5);
  assert.equal(hourOf(departure(at(20.75), 0)), 8, 'none at night: the first in the morning');
});

test('the plane takes off, flies over, lands on the far stand, and its passengers walk on from the gate', () => {
  const sim = fresh();
  const plane = () => sim.activeItems().find((i) => i.type.airfield === 'plane')!;
  const [west, east] = [onMap('West Field'), onMap('East Field')];
  assert.deepEqual(plane().def.p, [28, 48], 'on its stand at West Field');
  // Someone at West Field's gate before the 08:00, flying to East Field.
  while (hourOf(sim.tick) < 7.8) sim.step();
  const p = sim.people.find((q) => !q.npc)!;
  // Steered, so they stick to it (it's early: left to themselves they'd go back to bed).
  sim.interactions.control(p, true);
  const gates = sim.activeItems().filter((i) => i.type.airfield === 'gate');
  const [from, to] = [gates.find((g) => g.def.p.join() === west.join())!, gates.find((g) => g.def.p.join() === east.join())!];
  const then = { kind: 'wander' as const, to: { level: 'town', p: [east[0] + 1, east[1] + 6] as [number, number] } };
  Object.assign(p, { level: 'town', x: west[0] + 1, y: west[1] + 1, px: west[0] + 1, py: west[1] + 1 });
  sim.setLevel(p, 'town');
  (sim as unknown as { begin(p: unknown, i: unknown, walk: boolean): void }).begin(p, { kind: 'fly', from: from.index, to: to.index, after: then }, true);
  let flew = false;
  let high = 0;
  for (let t = 0; t < TICKS_PER_HOUR && !(flew && !p.riding); t++) {
    sim.step();
    flew ||= !!p.riding;
    high = Math.max(high, sim.planes.poseOf(plane())?.up ?? 0);
  }
  assert.ok(flew, 'aboard');
  assert.equal(high, 1, 'up in the air');
  assert.ok(!p.riding, 'and off again');
  assert.deepEqual(plane().def.p, [128, 48], 'on its stand at East Field');
  assert.ok(Math.abs(p.x - (east[0] + 1)) + Math.abs(p.y - (east[1] + 1)) < 3, 'got off at East Field’s gate');
  assert.ok(sim.events.some((e) => e.text.includes('flew to East Field')));
  assert.deepEqual(validate(sim.world), []);
});

test('no pilot in, no flight: it says so in the News', () => {
  const sim = fresh();
  const plane = () => sim.activeItems().find((i) => i.type.airfield === 'plane')!;
  sim.removePerson('jo');
  let flew = false;
  while (hourOf(sim.tick) < 9.5) {
    sim.step();
    flew ||= !!sim.planes.poseOf(plane());
  }
  assert.ok(!flew, 'the plane stayed on its stand');
  assert.ok(sim.events.some((e) => /No flight from West Field: the pilot isn't in/.test(e.text)));
});

test('the pilot flies with the plane, and works from the hangar it lands at', () => {
  const sim = fresh();
  const jo = sim.person('jo')!;
  while (hourOf(sim.tick) < 8.6) sim.step();
  assert.equal(jo.works, 'hangar-east', 'over at East Field now');
});
