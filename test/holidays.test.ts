import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR, tickAt } from '../src/sim/clock.ts';
import { bankHoliday, partyDay } from '../src/sim/holidays.ts';
import type { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { restore, snapshot } from '../src/sim/snapshot.ts';
import { freshFrom as townFrom, untilDay as until } from './town.ts';

/** A town from this date, its clock jumped on to `hour` on story day `day` (nothing needed from the days between). */
const jumped = (start: Parameters<typeof townFrom>[0], day: number, hour: number) => {
  const sim = townFrom(start);
  sim.tick = tickAt(day, hour);
  return sim;
};

/** Just after midnight on New Year's Day (from the Monday before): once, for both New Year tests. */
let newYear: ReturnType<typeof snapshot> | undefined;
const midnight = () => {
  newYear ??= snapshot(until(jumped([2026, 12, 28], 3, 18), 4, 0.1));
  return restore(structuredClone(newYear));
};

const news = (sim: Simulation, pattern: RegExp) => sim.events.some((e) => pattern.test(e.text));

test('bank holidays move to the next weekday when they fall at a weekend; the party is the last working day', () => {
  // 2021: Christmas on a Saturday, Boxing Day a Sunday.
  assert.ok(bankHoliday({ year: 2021, month: 12, day: 27 }));
  assert.ok(bankHoliday({ year: 2021, month: 12, day: 28 }));
  assert.ok(!bankHoliday({ year: 2021, month: 12, day: 29 }));
  assert.ok(bankHoliday({ year: 2027, month: 1, day: 1 }));
  assert.ok(!bankHoliday({ year: 2026, month: 12, day: 24 }));
  assert.ok(partyDay({ year: 2026, month: 12, day: 24 }), 'Christmas Eve 2026 is a Thursday');
  assert.ok(partyDay({ year: 2021, month: 12, day: 24 }), 'and 2021, a Friday');
});

test('a crew puts the Christmas tree up on the Green in December, and a town that starts at Christmas has it already', () => {
  const sim = until(townFrom([2026, 11, 30]), 0, 23);
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'christmasTree'), 'not in November');
  until(sim, 2, 17);
  assert.ok(sim.activeItems().some((i) => i.def.t === 'christmasTree'), 'up by the second of December');
  assert.ok(sim.construction.jobs.every((j) => j.finished), 'and the crew have gone home');
  assert.deepEqual(validate(sim.world), []);
  const already = townFrom([2026, 12, 21]);
  already.step();
  assert.ok(already.activeItems().some((i) => i.def.t === 'christmasTree'));
});

test("Christmas Day: the office is shut, and there are presents at home", () => {
  const sim = until(jumped([2026, 12, 21], 4, 0), 4, 11);
  assert.equal(sim.holiday()?.id, 'christmas');
  const office = sim.people.filter((p) => ['ground', 'first'].includes(p.level));
  assert.equal(office.length, 0, `nobody at the office (${office.map((p) => p.name)})`);
  assert.ok(news(sim, /Presents at/));
});

test('Bonfire Night: a crew builds it, the town turns out, and it is cleared away the next day', () => {
  const sim = until(townFrom([2026, 11, 2]), 3, 18);
  const fire = sim.activeItems().find((i) => i.def.t === 'bonfire');
  assert.ok(fire, 'built');
  // The most round it at once, over the evening (people come and go).
  let most = 0;
  for (let t = 0; t < 4 * TICKS_PER_HOUR; t++) {
    sim.step();
    if (t % 30 === 0) most = Math.max(most, sim.people.filter((p) => p.level === fire.level && Math.hypot(p.x - fire.def.p[0], p.y - fire.def.p[1]) < 4).length);
  }
  assert.ok(most >= 3, `a crowd round it (${most})`);
  until(sim, 4, 17);
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'bonfire'), 'and gone');
});

test("New Year's Eve: grown-ups see the new year in", () => {
  const sim = until(midnight(), 4, 0.25);
  assert.equal(sim.holiday()?.id, 'newYearsDay');
  const adults = sim.people.filter((p) => p.species === 'human' && !p.npc);
  const up = adults.filter((p) => p.intent?.kind !== 'sleep');
  assert.ok(up.length > adults.length / 2, `${up.length} of ${adults.length} still up`);
  assert.ok(news(sim, /Happy New Year/));
});

test('Halloween: children go trick-or-treating', () => {
  const sim = jumped([2026, 10, 26], 5, 12);
  let out = 0;
  until(sim, 5, 17.5);
  for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
    sim.step();
    if (t % 60 === 0) out = Math.max(out, sim.people.filter((p) => p.role === 'child' && p.level === sim.traffic.level).length);
  }
  assert.ok(out >= 2, `children out in the street (${out})`);
});

test('New Year: people go out on the Green to see the fireworks, and homes put their trees up', () => {
  const sim = midnight();
  const [gx, gy, gw, gh] = sim.levels.get('town')!.rooms.find((r) => r.square)!.rect;
  const green = sim.people.filter((p) => p.level === sim.traffic.level && p.x >= gx && p.x < gx + gw && p.y >= gy && p.y < gy + gh);
  assert.ok(green.length >= 5, `a crowd on the Green at midnight (${green.length})`);
  const homes = sim.housing.homes().filter((h) => sim.housing.residents(h).length > 0);
  const trees = homes.filter((h) => sim.activeItems().some((i) => i.def.t === 'homeTree' && sim.baseOf(i.level) === h.level.id));
  assert.ok(trees.length >= homes.length * 0.8, `trees up in ${trees.length} of ${homes.length} homes`);
  assert.ok(sim.activeItems().some((i) => i.def.t === 'homeTree' && i.level === 'ground'), 'and one at the office');
  assert.deepEqual(validate(sim.world), []);
});
