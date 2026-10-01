import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { STARTER } from '../src/worlds/starter.ts';

test('a boat trip: two take a rowing boat (out of the club), three a sailing boat (off its mooring), out on the river and back, and ashore again', () => {
  const sim = new Simulation(structuredClone(STARTER));
  // Out of season, so nobody else goes rowing meanwhile (a trip set off by hand goes all the same).
  sim.calendar = { ...sim.calendar, start: [2026, 12, 7] };
  const jetty: [number, number] = [100, 143];
  const ashore = { level: 'town', p: jetty };
  const [a, b, c, d, e] = sim.people.filter((p) => !p.npc);
  const rowboat = sim.activeItems().find((i) => i.def.t === 'rowboat')!;
  const sailboat = sim.activeItems().find((i) => i.def.t === 'sailboat')!;
  assert.equal(sim.boats.poseOf(rowboat), null, 'the rowing boats are kept in the club');
  assert.equal(sim.boats.poseOf(sailboat), undefined, 'the sailing boats are on their moorings');
  assert.ok(sim.boats.launch([a!, b!], ashore), 'two go rowing');
  assert.ok(sim.boats.launch([c!, d!, e!], ashore), 'three go sailing');
  assert.ok(a!.riding && c!.riding, 'aboard');
  let far = 0;
  let landed: [string, number, number] | undefined;
  for (let t = 0; t < 3 * TICKS_PER_HOUR && (a!.riding || c!.riding); t++) {
    sim.step();
    if (!a!.riding && !landed) landed = [a!.level, Math.round(a!.x), Math.round(a!.y)];
    const out = sim.activeItems().filter((i) => i.type.boat && sim.boats.poseOf(i));
    for (const boat of out) far = Math.max(far, Math.abs(sim.boats.poseOf(boat)!.x - boat.def.p[0]));
  }
  assert.ok(far >= 15, `out along the river (${far.toFixed(0)} tiles)`);
  assert.ok(!a!.riding && !c!.riding, 'back, and ashore');
  assert.deepEqual(landed, ['town', ...jetty], 'stepping off at the jetty');
  assert.equal(sim.boats.poseOf(rowboat), null, 'the rowing boat put away again');
  assert.deepEqual(validate(sim.world), []);
});
