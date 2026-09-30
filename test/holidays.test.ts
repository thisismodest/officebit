import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR, type Calendar } from '../src/sim/calendar.ts';
import { TICKS_PER_HOUR, tickAt } from '../src/sim/clock.ts';
import { bankHoliday, partyDay } from '../src/sim/holidays.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { STARTER } from '../src/worlds/starter.ts';

/** A town whose first day (a Monday, tick 0) is this date. */
const townFrom = (start: Calendar['start']) => {
  const sim = new Simulation(structuredClone(STARTER));
  sim.calendar = { ...DEFAULT_CALENDAR, start };
  return sim;
};
/** Run to `hour` on story day `day` (0 is the first). */
const until = (sim: Simulation, day: number, hour: number) => {
  const to = tickAt(day, hour);
  while (sim.tick < to) sim.step();
  return sim;
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
  const sim = until(townFrom([2026, 12, 21]), 4, 11);
  assert.equal(sim.holiday()?.id, 'christmas');
  const office = sim.people.filter((p) => ['ground', 'first'].includes(p.level));
  assert.equal(office.length, 0, `nobody at the office (${office.map((p) => p.name)})`);
  assert.ok(news(sim, /Presents at/));
});

test('Bonfire Night: a crew builds it, the town turns out, and it is cleared away the next day', () => {
  const sim = until(townFrom([2026, 11, 2]), 3, 20);
  const fire = sim.activeItems().find((i) => i.def.t === 'bonfire');
  assert.ok(fire, 'built');
  const round = sim.people.filter((p) => p.level === fire.level && Math.hypot(p.x - fire.def.p[0], p.y - fire.def.p[1]) < 4);
  assert.ok(round.length >= 3, `a crowd round it (${round.length})`);
  until(sim, 4, 17);
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'bonfire'), 'and gone');
});

test("New Year's Eve: grown-ups see the new year in", () => {
  const sim = until(townFrom([2026, 12, 28]), 4, 0.25);
  assert.equal(sim.holiday()?.id, 'newYearsDay');
  const adults = sim.people.filter((p) => p.species === 'human' && !p.npc);
  const up = adults.filter((p) => p.intent?.kind !== 'sleep');
  assert.ok(up.length > adults.length / 2, `${up.length} of ${adults.length} still up`);
  assert.ok(news(sim, /Happy New Year/));
});

test('Halloween: children go trick-or-treating', () => {
  const sim = townFrom([2026, 10, 26]);
  let out = 0;
  until(sim, 5, 17.5);
  for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
    sim.step();
    if (t % 60 === 0) out = Math.max(out, sim.people.filter((p) => p.role === 'child' && p.level === sim.traffic.level).length);
  }
  assert.ok(out >= 2, `children out in the street (${out})`);
});

test('New Year: people go out on the Green to see the fireworks, and homes put their trees up', () => {
  const sim = until(townFrom([2026, 12, 28]), 4, 0.1);
  const green = sim.people.filter((p) => p.level === sim.traffic.level && p.x >= 40 && p.x < 68 && p.y >= 33 && p.y < 47);
  assert.ok(green.length >= 5, `a crowd on the Green at midnight (${green.length})`);
  const homes = sim.housing.homes().filter((h) => sim.housing.residents(h).length > 0);
  const trees = homes.filter((h) => sim.activeItems().some((i) => i.def.t === 'homeTree' && sim.baseOf(i.level) === h.level.id));
  assert.ok(trees.length >= homes.length * 0.8, `trees up in ${trees.length} of ${homes.length} homes`);
  assert.ok(sim.activeItems().some((i) => i.def.t === 'homeTree' && i.level === 'ground'), 'and one at the office');
  assert.deepEqual(validate(sim.world), []);
});
