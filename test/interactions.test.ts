import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { atDesk } from '../src/sim/person.ts';
import { STARTER } from '../src/worlds/starter.ts';

const fresh = () => new Simulation(structuredClone(STARTER));
const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
const until = (sim: Simulation, hour: number) => run(sim, Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR));
const kindOf = (sim: Simulation, id: string) => sim.levels.get(sim.person(id)!.level)!.kind;

test('a fire drill empties the building, then everyone goes back in', () => {
  const sim = until(fresh(), 10.5);
  const inside = () => sim.people.filter((p) => ['ground', 'first'].includes(p.level) && sim.present(p)).length;
  assert.ok(inside() > 5);
  assert.equal(sim.interactions.drill('head'), null);
  run(sim, 0.45 * TICKS_PER_HOUR);
  assert.equal(inside(), 0, `${inside()} still inside`);
  run(sim, 0.55 * TICKS_PER_HOUR);
  assert.ok(sim.events.some((e) => e.text.includes('All clear')));
  assert.ok(inside() > 5, 'back at their desks');
});

test('pizza is brought in by a rider, eaten, cleared away, and the rider leaves', () => {
  const sim = until(fresh(), 12);
  assert.equal(sim.interactions.pizza('head'), null);
  const rider = sim.people.find((p) => p.role === 'courier')!;
  assert.ok(rider, 'a rider sets off from the edge of town');
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'pizza'), 'no pizza out of thin air');
  let delivered = false;
  for (let i = 0; i < 2 * TICKS_PER_HOUR && !delivered; i++) {
    sim.step();
    delivered = sim.activeItems().some((item) => item.def.t === 'pizza');
  }
  assert.ok(delivered, 'the pizza arrives');
  run(sim, 3 * TICKS_PER_HOUR);
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'pizza'), 'eaten or cleared away');
  assert.ok(sim.items.find((i) => i.def.t === 'pizza')!.uses > 0, 'somebody had some');
  assert.equal(sim.person(rider.id), undefined, 'the rider has gone');
});

test('taking control: they go where they are told, then their personality takes over again', () => {
  // Early enough that they're back at their desk before lunch (and the food trucks).
  const sim = until(fresh(), 8.5);
  const bea = sim.person('bea')!;
  sim.interactions.control(bea, true);
  const green: [number, number] = [56, 80];
  sim.interactions.command(bea, { kind: 'wander', to: { level: 'town', p: green } });
  run(sim, TICKS_PER_HOUR);
  assert.equal(bea.level, 'town');
  assert.ok(Math.abs(bea.x - green[0]) + Math.abs(bea.y - green[1]) < 1, 'standing where they were sent');
  run(sim, TICKS_PER_HOUR);
  assert.ok(Math.abs(bea.x - green[0]) + Math.abs(bea.y - green[1]) < 1, 'and staying put');
  sim.interactions.control(bea, false);
  run(sim, TICKS_PER_HOUR);
  assert.equal(kindOf(sim, 'bea'), 'building', 'back to work');
});

test('talking to people while in control: keeping them from work grates, a free moment brings you closer', () => {
  const sim = until(fresh(), 10.5);
  const bea = sim.person('bea')!;
  sim.interactions.control(bea, true);
  const chatWith = (id: string, atWork: boolean) => {
    const other = sim.person(id)!;
    sim.interactions.command(bea, { kind: 'chat', with: id });
    let talked = false;
    let grew = false;
    /** How much it changed while they were still at their desk, and while they were free. */
    let atTheirDesk = 0;
    let free = 0;
    for (let t = 0; t < TICKS_PER_HOUR && !(talked && !bea.talkingTo); t++) {
      const was = sim.relationships.affinity(bea, other);
      const working = atDesk(other);
      // No room beside them just now? Ask again, as you would.
      if (!talked && bea.intent?.kind !== 'chat') sim.interactions.command(bea, { kind: 'chat', with: id });
      sim.step(1);
      talked ||= bea.talkingTo === id;
      const change = sim.relationships.affinity(bea, other) - was;
      if (talked && working && atDesk(other)) {
        atTheirDesk += change;
        if (change > 0) grew = true;
      } else if (talked && !working && !atDesk(other) && other.distracted === 0) {
        free += change;
      }
    }
    assert.ok(!grew, 'never any closer while keeping them from work');
    assert.ok(talked, `talked to ${id}`);
    return atWork ? atTheirDesk : free;
  };
  // Someone nearby, well into a spell at their desk, so they're still at it when Bea gets there.
  const working = sim.people
    .filter((p) => p !== bea && p.company === bea.company && p.level === bea.level && atDesk(p) && p.timer > 150)
    .sort((a, b) => Math.hypot(a.x - bea.x, a.y - bea.y) - Math.hypot(b.x - bea.x, b.y - bea.y))[0]!;
  assert.ok(chatWith(working.id, true) < 0, 'pulling someone off their work');
  sim.interactions.control(bea, false);

  // Someone Bea would get on with better than she does now, free (steered, so they stay put) and standing next to her.
  const free = sim.people.find((p) => p !== bea && p !== working && !p.npc && p.home && sim.relationships.compatibility(bea, p) > sim.relationships.affinity(bea, p))!;
  sim.interactions.control(free, true);
  // Beside her, or as near as there's room.
  const grid = sim.grids.get(bea.level)!;
  const room = [1, 2, 3].flatMap((r) => [-r, 0, r].flatMap((dy) => [-r, 0, r].map((dx): [number, number] => [Math.round(bea.x) + dx, Math.round(bea.y) + dy])));
  const spot = sim.beside(free, bea) ?? { level: bea.level, p: room.find(([x, y]) => grid.walkable(x, y) && !sim.isClaimed({ level: bea.level, p: [x, y] }))! };
  sim.setLevel(free, spot.level);
  Object.assign(free, { x: spot.p[0], y: spot.p[1], px: spot.p[0], py: spot.p[1], hidden: false, transit: 0, distracted: 0 });
  sim.interrupt(free);
  sim.interactions.control(bea, true);
  assert.ok(chatWith(free.id, false) > 0, 'a chat on good terms');
});
