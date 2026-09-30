import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CALENDAR } from '../src/sim/calendar.ts';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { UPGRADES, VERSION, newer, upgrade } from '../src/worlds/upgrades.ts';

const TODAY = { year: 2026, month: 10, day: 5, hour: 20 };
const NEW = new Set(UPGRADES.flatMap((u) => u.add.map((a) => a.furniture.t)));

/** The starter town as it was before this release: none of the new pieces, and no version. */
const oldTown = (): WorldDef => {
  const world = structuredClone(STARTER);
  delete world.version;
  for (const level of world.levels) level.furniture = level.furniture.filter((f) => !NEW.has(f.t));
  return world;
};

test('this release is the version in package.json, and the starter town is made with it', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(VERSION, version);
  assert.equal(STARTER.version, VERSION);
  assert.equal(upgrade(structuredClone(STARTER), TODAY), 0, 'a new town has everything already');
  assert.ok(newer('0.10.0', '0.9.1') && !newer('0.4.0', '0.4.0') && newer('1.0.0', '0.99.99'));
});

test('an older town gets what’s new as works for a crew, from today, where there’s room', () => {
  const world = oldTown();
  const coming = upgrade(world, TODAY);
  assert.equal(coming, UPGRADES.flatMap((u) => u.add).length);
  assert.equal(world.version, VERSION);
  assert.ok(world.works!.every((w) => w.from.join('-') === '2026-10-5-20'), 'from the hour it was opened');
  assert.equal(upgrade(world, TODAY), 0, 'only the once');
  // Something of yours where a billboard would go: that one's left out.
  const yours = oldTown();
  yours.levels.find((l) => l.id === 'town')!.furniture.push({ t: 'bench', p: [41, 12] });
  assert.equal(upgrade(yours, TODAY), coming - 1);
});

test('a crew comes to put up what’s new, and the town stays valid', () => {
  const world = oldTown();
  upgrade(world, { year: 2026, month: 6, day: 1, hour: 6 });
  const sim = new Simulation(world);
  sim.calendar = { ...DEFAULT_CALENDAR, start: [2026, 6, 1] };
  const news: string[] = [];
  sim.onEvent((e) => news.push(e.text));
  for (let t = 0; t < 3 * TICKS_PER_DAY; t++) sim.step();
  const town = sim.levels.get('town')!.furniture;
  for (const t of NEW) assert.ok(town.some((f) => f.t === t), `a ${t} went up`);
  assert.ok(news.some((text) => /A crew came to put up a billboard/.test(text)));
  assert.ok(news.some((text) => /The new billboard is up/.test(text)));
  assert.deepEqual(validate(sim.world), []);
});
