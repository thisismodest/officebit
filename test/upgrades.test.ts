import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CALENDAR } from '../src/sim/calendar.ts';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { VERSION, newer, upgrade } from '../src/worlds/upgrades.ts';

const TODAY = { year: 2026, month: 10, day: 5, hour: 20 };
/** The starter town as 0.4 made it, on the old map. */
const town04 = (): WorldDef => JSON.parse(readFileSync('test/fixtures/town-0.4.json', 'utf8'));
/** A pretend next release, adding a billboard and a bench by the Street. */
const NEXT = '9.0.0';
const RELEASES = [{ version: NEXT, add: [{ level: 'town', furniture: { t: 'billboard', p: [70, 40] as [number, number] } }, { level: 'town', furniture: { t: 'bench', p: [126, 66] as [number, number] } }] }];

test('this release is the version in package.json, and the starter town is made with it', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(VERSION, version);
  assert.equal(STARTER.version, VERSION);
  assert.equal(upgrade(structuredClone(STARTER), TODAY), 0, 'a new town has everything already');
  assert.ok(newer('0.10.0', '0.9.1') && !newer('0.4.0', '0.4.0') && newer('1.0.0', '0.99.99'));
});

test('a town from before 0.5 moves onto the new map, with its people, homes and insides', () => {
  const world = town04();
  const firstFloor = world.levels.find((l) => l.id === 'first')!;
  firstFloor.furniture.push({ t: 'plant', p: [2, 12] });
  const rowansHome = structuredClone(world.levels.find((l) => l.id === 'home-rowan')!);
  assert.equal(upgrade(world, TODAY), 1);
  assert.equal(world.version, VERSION);
  assert.deepEqual(validate(world), []);
  const town = world.levels.find((l) => l.kind === 'outside')!;
  assert.ok(town.rooms.some((r) => r.square), 'the new map');
  assert.ok(world.levels.find((l) => l.id === 'first')!.furniture.some((f) => f.t === 'plant' && f.p.join() === '2,12'), 'your office, as you had it');
  assert.deepEqual(world.levels.find((l) => l.id === 'home-rowan'), rowansHome, 'and the insides of homes');
  assert.ok(town.furniture.some((f) => f.owner === 'rowan' && f.t === 'detached'), 'Rowan’s family home is a family home still');
  for (const p of [...world.people, ...world.npcs]) {
    if (!p.home) continue;
    assert.ok(world.portals.some((d) => d.b.level === p.home || d.a.level === p.home), `${p.name} has a door home`);
  }
  assert.ok(world.companies.some((c) => c.id === 'leisure') && world.npcs.some((n) => n.works === 'leisure'), 'the leisure centre came with its staff');
  assert.equal(upgrade(world, TODAY), 0, 'only the once');
  const sim = new Simulation(world);
  for (let t = 0; t < TICKS_PER_DAY / 4; t++) sim.step();
  assert.deepEqual(validate(sim.world), []);
});

test('a newer release’s pieces become works for a crew, from today, where there’s room', () => {
  const world = structuredClone(STARTER);
  const coming = upgrade(world, TODAY, RELEASES, NEXT);
  assert.equal(coming, 2);
  assert.equal(world.version, NEXT);
  assert.ok(world.works!.every((w) => w.from.join('-') === '2026-10-5-20'), 'from the hour it was opened');
  assert.equal(upgrade(world, TODAY, RELEASES, NEXT), 0, 'only the once');
  // Something of yours where the billboard would go: that one's left out.
  const yours = structuredClone(STARTER);
  yours.levels.find((l) => l.id === 'town')!.furniture.push({ t: 'flowers', p: [71, 40] });
  assert.equal(upgrade(yours, TODAY, RELEASES, NEXT), 1);
});

test('a crew comes to put up what’s new, and the town stays valid', () => {
  const world = structuredClone(STARTER);
  upgrade(world, { year: 2026, month: 6, day: 1, hour: 6 }, RELEASES, NEXT);
  const sim = new Simulation(world);
  sim.calendar = { ...DEFAULT_CALENDAR, start: [2026, 6, 1] };
  const news: string[] = [];
  sim.onEvent((e) => news.push(e.text));
  for (let t = 0; t < 2 * TICKS_PER_DAY; t++) sim.step();
  const town = sim.levels.get('town')!.furniture;
  assert.ok(town.some((f) => f.t === 'billboard' && f.p.join() === '70,40'), 'the billboard went up');
  assert.ok(news.some((text) => /A crew came to put up a billboard/.test(text)));
  assert.ok(news.some((text) => /The new billboard is up/.test(text)));
  assert.deepEqual(validate(sim.world), []);
});
