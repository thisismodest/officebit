import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';

test('the weather: about as wet as an English year, snow only in winter, the same for the same seed, and snow lies a while after', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const spells = Array.from({ length: (365 * 24) / 4 }, (_, i) => i * 4 * TICKS_PER_HOUR);
  const skies = spells.map((t) => ({ t, ...sim.weather.at(t), month: sim.dateOf(t).month }));
  const wet = skies.filter((s) => s.wet > 0).length / skies.length;
  assert.ok(wet > 0.22 && wet < 0.42, `${(wet * 100).toFixed(0)}% of spells wet`);
  assert.ok(skies.every((s) => s.sky !== 'snow' || [12, 1, 2].includes(s.month)), 'snow only in December to February');
  assert.ok(skies.some((s) => s.sky === 'snow'), 'but some');
  assert.ok(skies.every((s) => (s.wet > 0) === (s.sky === 'rain' || s.sky === 'snow')));
  const again = new Simulation(structuredClone(STARTER));
  assert.deepEqual(spells.slice(0, 200).map((t) => again.weather.at(t)), skies.slice(0, 200).map(({ sky, wet: w }) => ({ sky, wet: w })), 'the same seed, the same weather');
  // A last spell of snow, with none for a while after.
  const last = skies.findIndex((s, i) => s.sky === 'snow' && skies.slice(i + 1, i + 5).every((n) => n.sky !== 'snow'));
  assert.equal(sim.weather.snowLying(skies[last]!.t), 1, 'lying while it falls');
  assert.ok(sim.weather.snowLying(skies[last + 2]!.t) > 0, 'still lying a while after');
  assert.equal(sim.weather.snowLying(skies[last + 4]!.t), 0, 'and gone half a day after it stops');
});

test('a swim in the river: on summer days only (June to August, by day, dry), and people go', () => {
  const sim = new Simulation(structuredClone(STARTER));
  sim.calendar = { ...sim.calendar, start: [2026, 7, 6] };
  const buoy = sim.activeItems().find((i) => i.def.t === 'lifebuoy')!;
  let swims = 0;
  let outOfSeason = 0;
  for (let t = 0; t < 10 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const p of sim.people) {
      if (p.intent?.kind !== 'use' || p.intent.item !== buoy.index || p.phase !== 'doing' || p.timer !== sim.dt) continue;
      swims++;
      if (!sim.summerDay()) outOfSeason++;
    }
  }
  assert.ok(swims >= 2, `${swims} swims in ten July days`);
  const winter = new Simulation(structuredClone(STARTER));
  winter.calendar = { ...winter.calendar, start: [2026, 12, 7] };
  assert.ok(!winter.isOpen(winter.activeItems().find((i) => i.def.t === 'lifebuoy')!), 'not in December');
  assert.ok(outOfSeason <= 1, 'and only on summer days');
});
