import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { placementProblem } from '../src/worlds/placement.ts';
import { STARTER } from '../src/worlds/starter.ts';

test('a boat trip: two take a rowing boat (out of the club, and back in after), three a sailing boat (off its mooring), out on the river and back, and ashore again', () => {
  const sim = new Simulation(structuredClone(STARTER));
  // Out of season, so nobody else goes rowing meanwhile (a trip set off by hand goes all the same).
  sim.calendar = { ...sim.calendar, start: [2026, 12, 7] };
  const jetty: [number, number] = [100, 143];
  const ashore = { level: 'town', p: jetty };
  const [a, b, c, d, e] = sim.people.filter((p) => !p.npc);
  const sailboat = sim.activeItems().find((i) => i.def.t === 'sailboat')!;
  const rowboats = () => sim.activeItems().filter((i) => i.def.t === 'rowboat');
  assert.equal(rowboats().length, 0, 'the rowing boats are kept in the club');
  assert.equal(sim.boats.poseOf(sailboat), undefined, 'the sailing boats are on their moorings');
  assert.ok(sim.boats.launch([a!, b!], ashore), 'two go rowing');
  const club = sim.activeItems().find((i) => i.def.t === 'boathouse')!;
  assert.equal(rowboats().length, 1, 'a rowing boat out of the club');
  assert.ok(Math.abs(rowboats()[0]!.def.p[0] - club.def.p[0]) <= 8, 'onto the water by its doors');
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
  assert.equal(rowboats().length, 0, 'the rowing boat back in the club');
  assert.deepEqual(validate(sim.world), []);
});

test('boats go on the water, and only there; the beach things on sand', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const town = sim.levels.get('town')!;
  assert.equal(placementProblem(town, sim.world.portals, 'sailboat', [30, 146]), null, 'on the river');
  assert.match(placementProblem(town, sim.world.portals, 'sailboat', [30, 130]) ?? '', /on the water/, 'not on the grass');
  assert.match(placementProblem(town, sim.world.portals, 'bench', [30, 146]) ?? '', /grass/, 'and nothing else in it');
  assert.equal(placementProblem(town, sim.world.portals, 'bench', [112, 141]), null, 'a bench on the beach');
});
