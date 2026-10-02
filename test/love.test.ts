// Love and moving in; homes to let.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, until } from './town.ts';

test('love: friends with a spark start seeing each other, date, and move in together; freed homes go to let', () => {
  const sim = until(fresh(), 17);
  const singles = sim.people.filter((p) => sim.love.available(p) && !p.npc);
  const pair = singles.flatMap((a) => singles.filter((b) => b !== a && sim.love.spark(a, b) && sim.relationships.compatibility(a, b) > 0.4).map((b) => [a, b] as const))[0]!;
  const [a, b] = pair;
  // Make them close friends, then let them talk until one asks.
  for (let i = 0; i < 20; i++) sim.relationships.together(a, b, 1000, 2);
  for (let i = 0; i < 200 && !sim.love.coupleOf(a); i++) sim.love.met(a, b);
  assert.equal(sim.love.partnerOf(a), b);
  const homes = [a.home, b.home];

  // As if they'd been seeing each other a week.
  sim.love.coupleOf(a)!.since -= 8 * TICKS_PER_DAY;
  for (let i = 0; i < 20; i++) sim.relationships.together(a, b, 1000, 2);
  until(sim, 11);
  assert.ok(sim.love.coupleOf(a)?.together, 'living together');
  assert.equal(a.home, b.home);
  // The home they left is free: to let, or already taken by a newcomer.
  const left = homes.find((h) => h !== a.home)!;
  assert.ok(sim.housing.vacant().some((h) => h.level.id === left) || sim.people.some((p) => p.home === left && p !== a && p !== b), 'someone else can move into the home they left');
  assert.ok(homes.some((h) => h !== a.home) || homes[0] === homes[1]);
  assert.match(sim.levels.get(a.home!)!.name, / and /);
  assert.deepEqual(validate(sim.world), []);
});

test('love: a world can opt out', () => {
  const sim = fresh({ love: false });
  const [a, b] = sim.people.filter((p) => sim.love.available(p));
  for (let i = 0; i < 20; i++) sim.relationships.together(a!, b!, 1000, 2);
  for (let i = 0; i < 200; i++) sim.love.met(a!, b!);
  assert.equal(sim.love.couples.length, 0);
});

test('newcomers move into a house that is to let', () => {
  const sim = fresh();
  const free = sim.housing.vacant().length;
  const p = sim.hire({ id: 'newbie', name: 'Newbie', look: [0, 0, 0, 0] });
  assert.ok(p.home?.startsWith('home-to-let'));
  assert.equal(sim.housing.vacant().length, free - 1);
  assert.equal(sim.levels.get(p.home!)!.name, "Newbie's house");
});
