// The diner, round the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { fresh, until, employees } from './town.ts';

test('the diner: open all hours, staffed through the night, a treat rather than a habit', () => {
  const sim = until(fresh(), 3);
  const ray = sim.person('ray')!;
  assert.equal(ray.level, 'diner', 'Ray works nights');
  assert.notEqual(ray.intent?.kind, 'sleep');
  assert.equal(sim.person('dot')!.level, 'home-dot', 'Dot is home asleep before her day shift');
  until(sim, 11);
  assert.equal(sim.person('dot')!.level, 'diner', 'and on shift by late morning');

  const outings = new Map<string, number>();
  const inside = new Set<string>();
  for (let t = 0; t < 14 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const p of employees(sim)) {
      const there = p.level === 'diner';
      if (there && !inside.has(p.id)) outings.set(p.id, (outings.get(p.id) ?? 0) + 1);
      if (there) inside.add(p.id);
      else inside.delete(p.id);
    }
  }
  assert.ok(outings.size > 0, 'someone went to the diner');
  for (const [id, n] of outings) assert.ok(n <= 14, `${id} went ${n} times in a fortnight`);
});
