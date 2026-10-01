// Food at home: the pantry and the shop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { fresh } from './town.ts';

test('groceries: cooking uses the pantry, and people shop before it runs dry', () => {
  const sim = fresh();
  const pantries = sim.world.pantries!;
  let shops = 0;
  sim.onEvent((e) => (shops += e.text.includes('food shop') ? 1 : 0));
  let empty = 0;
  for (let t = 0; t < 14 * TICKS_PER_DAY; t++) {
    sim.step();
    if (t % TICKS_PER_HOUR === 0) empty += Object.values(pantries).filter((v) => v < 1).length;
  }
  assert.ok(shops > 0, 'someone did a food shop');
  const homeHours = Object.keys(pantries).length * 14 * 24;
  assert.ok(empty < homeHours * 0.02, `kitchens were bare for ${empty} of ${homeHours} home-hours`);
});
