// Food at home: the pantry and the shop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { PANTRY_FULL } from '../src/sim/needs.ts';
import { fresh, until } from './town.ts';

test('groceries: cooking uses the pantry', () => {
  const sim = fresh();
  const pantries = sim.world.pantries!;
  const before = { ...pantries };
  let cooked = 0;
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    cooked += sim.people.filter((p) => p.intent?.kind === 'use' && p.phase === 'doing' && sim.items[p.intent.item]!.type.usesPantry).length;
  }
  assert.ok(cooked > 0, 'people cooked at home');
  assert.ok(Object.keys(before).some((home) => pantries[home]! < before[home]!), 'and it came out of the pantry');
  assert.ok(Object.values(pantries).every((v) => v >= 0), 'never below empty');
});

test('groceries: running low, people do a food shop before the kitchen is bare', () => {
  const sim = fresh();
  const pantries = sim.world.pantries!;
  // Three households on office hours, nearly out.
  const homes = ['ines', 'sam', 'cal'].map((id) => sim.person(id)!.home!);
  for (const home of homes) pantries[home] = 3;
  const stocked = new Set<string>();
  const bare = new Set<string>();
  for (let t = 0; t < 2 * TICKS_PER_DAY && stocked.size < homes.length; t++) {
    sim.step();
    for (const home of homes) {
      if (pantries[home] === PANTRY_FULL) stocked.add(home);
      if (pantries[home]! < 1 && !stocked.has(home)) bare.add(home);
    }
  }
  assert.deepEqual([...stocked].sort(), [...homes].sort(), 'every one of them shopped');
  assert.deepEqual([...bare], [], 'before it ran out');
});

test('groceries: someone on long shifts with no time off to shop pops out on shift instead', () => {
  // Mid-morning, Jo's well into a shift that runs to 21:00, and the kitchen at home is nearly bare.
  const sim = until(fresh(), 10);
  const jo = sim.person('jo')!;
  assert.equal(sim.phaseOf(jo), 'work');
  sim.world.pantries![jo.home!] = 3;
  let shoppedOnShift = false;
  for (let t = 0; t < TICKS_PER_DAY && sim.world.pantries![jo.home!] !== PANTRY_FULL; t++) {
    sim.step();
    shoppedOnShift ||= jo.level === 'shop' && sim.phaseOf(jo) === 'work';
  }
  assert.equal(sim.world.pantries![jo.home!], PANTRY_FULL, 'stocked up');
  assert.ok(shoppedOnShift, 'during their shift');
});
