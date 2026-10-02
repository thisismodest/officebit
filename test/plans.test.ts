import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR } from '../src/sim/calendar.ts';
import { ACTIVITIES, type ActivityId } from '../src/sim/plans.ts';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { STARTER } from '../src/worlds/starter.ts';

/** Four weeks of a town, watching its plans (long enough for every kind, whichever way the dice fall): run once, and shared by the tests. */
let watched: ReturnType<typeof look> | undefined;
const watch = () => (watched ??= look());
const look = () => {
  const sim = new Simulation(structuredClone(STARTER));
  sim.calendar = { ...DEFAULT_CALENDAR, start: [2026, 6, 1] };
  const seen = new Map<number, { activity: ActivityId; begun: boolean; members: string[]; level: string }>();
  let blanket = false;
  let laptops = false;
  let games = false;
  let doubleBooked = 0;
  for (let t = 0; t < 28 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const plan of sim.plans.list) seen.set(plan.id, { activity: plan.activity, begun: !!plan.begun, members: plan.members, level: plan.level });
    const members = sim.plans.list.flatMap((plan) => plan.members);
    if (new Set(members).size !== members.length) doubleBooked++;
    if (t % 30) continue;
    blanket ||= sim.activeItems().some((i) => i.def.t === 'picnicBlanket');
    games ||= sim.people.some((p) => p.intent?.kind === 'play' && p.phase === 'doing');
    laptops ||= sim.people.some((p) => p.intent?.kind === 'hustle' && p.phase === 'doing' && !sim.items[p.intent.item]!.type.study);
  }
  return { sim, plans: [...seen.values()], blanket, laptops, games, doubleBooked };
};

test('friends make plans and keep them: frisbee, picnics, catching up, a meal, and working on projects together', () => {
  const { sim, plans, blanket, laptops, games } = watch();
  for (const activity of ['catch', 'picnic', 'meetup', 'meal', 'cowork']) assert.ok(plans.some((p) => p.activity === activity && p.begun), `a ${activity} happened`);
  assert.ok(plans.filter((p) => p.begun).length >= plans.length * 0.7, 'most plans come off');
  assert.ok(games, 'a game in the park');
  assert.ok(blanket, 'a picnic laid out');
  assert.ok(laptops, 'laptops out, away from a desk');
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'picnicBlanket' && !sim.plans.list.some((p) => p.item === i.index)), 'and packed up after');
  assert.ok(sim.events.some((e) => /are meeting at/.test(e.text)) || plans.length > 0);
  assert.deepEqual(validate(sim.world), []);
});

test('nobody is in two plans at once, and plans go only where they belong', () => {
  const { plans, doubleBooked } = watch();
  assert.equal(doubleBooked, 0, 'never in two plans at once');
  assert.ok(plans.every((p) => p.members.length >= 2 && p.members.length <= ACTIVITIES[p.activity].group[1]), 'no more than it takes, family and all');
  // Parks for the games and picnics; a café's booths (the diner's, the garden centre's) or a bench for the rest.
  for (const plan of plans) assert.ok(plan.activity === 'catch' || plan.activity === 'picnic' ? plan.level === 'town' : ['diner', 'garden', 'town'].includes(plan.level), `${plan.activity} at ${plan.level}`);
});
