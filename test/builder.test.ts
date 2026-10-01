import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { checkWorld, decodeWorld, encodeWorld } from '../src/ui/world-io.ts';
import { addHouse, addPerson, eraseAt, moveFurniture, parseTeamList, placeFurniture, removePerson, updatePerson } from '../src/worlds/edit.ts';
import { placementProblem } from '../src/worlds/placement.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { OFFICE, OFFICE_DOOR, SHOP } from '../src/worlds/town.ts';

const world = (): WorldDef => structuredClone(STARTER);

test('a pasted list becomes rows, skipping blanks and a header', () => {
  const rows = parseTeamList('Name, Department, Preset\nAsha, Engineering, workhorse\n\nBen\tDesign\nCleo');
  assert.deepEqual(rows, [{ name: 'Asha', dept: 'Engineering', preset: 'workhorse' }, { name: 'Ben', dept: 'Design' }, { name: 'Cleo' }]);
});

test('adding someone gives them a desk, a house to let, and a new department if needed', () => {
  const w = world();
  const { id } = addPerson(w, { name: 'Asha Patel', dept: 'Research', preset: 'Workhorse' });
  const person = w.people.find((p) => p.id === id)!;
  assert.equal(id, 'asha-patel');
  assert.equal(person.preset, 'workhorse');
  assert.equal(w.departments.find((d) => d.id === person.dept)?.name, 'Research');
  assert.ok(w.levels.some((l) => l.furniture.some((f) => f.owner === id)), 'owns a desk');
  assert.equal(w.levels.find((l) => l.id === person.home)?.name, "Asha Patel's house");
  assert.deepEqual(validate(w), []);
  assert.ok(new Simulation(w).person(id), 'and the sim runs with them');
});

test('removing someone frees their desk, and their house goes back up to let', () => {
  const w = world();
  const home = w.people.find((p) => p.id === 'dev')!.home!;
  assert.equal(removePerson(w, 'dev'), null);
  assert.ok(!w.levels.some((l) => l.furniture.some((f) => f.owner === 'dev')));
  assert.equal(w.levels.find((l) => l.id === home)?.name, 'To let');
  assert.deepEqual(validate(w), []);
});

test('renaming someone renames their house', () => {
  const w = world();
  updatePerson(w, 'dev', { name: 'Devika' });
  assert.equal(w.levels.find((l) => l.id === 'home-dev')?.name, "Devika's house");
});

test('furniture fits or explains why not; erasing takes it away, but not buildings people use', () => {
  const w = world();
  assert.equal(placeFurniture(w, 'ground', 'plant', [0, 0]), "That's in a wall.");
  assert.match(placeFurniture(w, 'ground', 'plant', [2, 1]) ?? '', /already/);
  assert.equal(placeFurniture(w, 'ground', 'plant', [14, 12]), null);
  assert.equal(eraseAt(w, 'ground', [14, 12]), null);
  assert.equal(eraseAt(w, 'town', [OFFICE[0] + 1, OFFICE[1] + 1]), 'Buildings with a way in stay put.');
  const rowan = w.levels[0]!.furniture.find((f) => f.owner === 'rowan')!;
  assert.match(eraseAt(w, 'town', rowan.p) ?? '', /Someone lives there/);
});

test('a new house on the town map comes with a home inside, to let', () => {
  const w = world();
  const before = w.levels.length;
  // On the grass across Main Street from the shop.
  assert.equal(addHouse(w, 'town', 'house', [SHOP[0], SHOP[1] + 18]), null);
  assert.equal(w.levels.length, before + 1);
  assert.equal(w.levels.at(-1)!.name, 'To let');
  assert.deepEqual(validate(w), []);
  // Newcomers can move in.
  const sim = new Simulation(w);
  assert.ok(sim.housing.vacant().some((h) => h.level.id === w.levels.at(-1)!.id));
});

test('safe zones: off walls, clear of doorways and stairs, inside one room, and never blocking the way', () => {
  const w = world();
  const ground = w.levels.find((l) => l.id === 'ground')!;
  const at = (t: string, p: [number, number]) => placementProblem(ground, w.portals, t, p);
  assert.equal(at('plant', [14, 12]), null);
  assert.equal(at('plant', [0, 5]), "That's in a wall.");
  assert.equal(at('plant', [6, 8]), 'Keep doorways and stairs clear.', 'just inside the kitchen door');
  assert.equal(at('plant', [19, 13]), 'Keep doorways and stairs clear.', 'beside the stairs');
  assert.equal(at('bookshelf', [16, 12]), 'It has to sit inside one room.', 'straddling the dining area and the lobby');
  // A corridor with a way in at each end: a plant in the middle would cut one off.
  const corridor = { id: 'corridor', name: 'Corridor', kind: 'building' as const, size: [7, 3] as [number, number], rooms: [{ id: 'c', name: 'C', rect: [0, 0, 7, 3] as [number, number, number, number], floor: 'wood', walled: true }], doors: [], furniture: [] };
  const ways = [{ kind: 'door' as const, a: { level: 'corridor', p: [1, 1] as [number, number] }, b: { level: 'town', p: [0, 0] as [number, number] } }, { kind: 'stairs' as const, a: { level: 'corridor', p: [5, 1] as [number, number] }, b: { level: 'x', p: [0, 0] as [number, number] } }];
  assert.equal(placementProblem(corridor, ways, 'plant', [3, 1]), 'That would block the way.');
  const town = w.levels.find((l) => l.id === 'town')!;
  assert.equal(placementProblem(town, w.portals, 'bench', [OFFICE_DOOR[0] - 20, OFFICE_DOOR[1] + 2]), 'Outdoors, things go on the grass (or the beach).', 'in Main Street');
  // The charging station's things go on hard ground: the canopy can be moved and put back on the forecourt, but not the grass.
  const canopy = town.furniture.find((f) => f.t === 'chargingCanopy')!;
  assert.equal(placementProblem(town, w.portals, 'chargingCanopy', canopy.p, canopy), null, 'back where it was');
  assert.match(placementProblem(town, w.portals, 'chargingCanopy', [canopy.p[0], canopy.p[1] - 3], canopy) ?? '', /forecourt or paving/);
});

test('rugs lie on the floor: things stand on them, and they slide under things', () => {
  const w = world();
  const home = w.levels.find((l) => l.id === 'home-dev')!;
  const rug = home.furniture.find((f) => f.t === 'rug')!;
  const sofa = home.furniture.find((f) => f.t === 'sofa')!;
  assert.ok(rug && sofa, 'a home with a rug and a sofa on it');
  // A plant on the rug, beside the sofa.
  const spot = [0, 1, 2].map((dx): [number, number] => [rug.p[0] + dx, rug.p[1] + 1]).find((p) => !placementProblem(home, w.portals, 'plant', p));
  assert.ok(spot, 'somewhere on the rug takes a plant');
  // Rugs are floor: they can go right up to a doorway, where a plant can't.
  const ground = w.levels.find((l) => l.id === 'ground')!;
  assert.equal(placementProblem(ground, w.portals, 'plant', [6, 8]), 'Keep doorways and stairs clear.');
  assert.equal(placementProblem(ground, w.portals, 'rug', [5, 8]), null, 'a rug across the kitchen doorway');
  // The rug moves a tile along, still under the sofa.
  assert.equal(moveFurniture(w, home.id, 'rug', rug.p, [rug.p[0] + 1, rug.p[1]]), null);
  assert.deepEqual(validate(w), []);
});

test('moving furniture keeps its owner, and only goes somewhere safe', () => {
  const w = world();
  const ground = w.levels.find((l) => l.id === 'ground')!;
  const desk = ground.furniture.find((f) => f.owner === 'sam')!;
  const from = desk.p;
  assert.match(moveFurniture(w, 'ground', desk.t, from, [0, 0]) ?? '', /wall/);
  assert.deepEqual(desk.p, from, 'stays put when it cannot go');
  const sofa = ground.furniture.find((f) => f.t === 'sofa')!;
  assert.equal(moveFurniture(w, 'ground', desk.t, from, [sofa.p[0], sofa.p[1] - 1]), 'There needs to be room to use it.', 'not with its chair on the sofa');
  const free = Array.from({ length: 40 * 26 }, (_, i): [number, number] => [i % 40, Math.floor(i / 40)]).find((p) => !placementProblem(ground, w.portals, desk.t, p, desk))!;
  assert.equal(moveFurniture(w, 'ground', desk.t, from, free), null);
  assert.deepEqual(desk.p, free);
  assert.equal(desk.owner, 'sam');
  assert.deepEqual(validate(w), []);
});

test('a world survives the round trip through a share link, and bad ones are turned away', async () => {
  const w = world();
  const encoded = await encodeWorld(w);
  assert.ok(encoded.length < JSON.stringify(w).length / 4, `compressed to ${encoded.length} characters`);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeWorld(encoded), w);
  assert.equal(checkWorld(w).world, w);
  assert.equal(checkWorld({ v: 1 }).world, null);
  const broken = world();
  broken.people[0]!.dept = 'nope';
  assert.ok(checkWorld(broken).problems.some((p) => p.includes('unknown department')));
});

test('a place the story builds comes back as you arranged it (the same layout only), with desks kept for their owners', () => {
  const w = world();
  const place = (id: string, size: [number, number]) => ({
    id,
    name: 'Studio',
    kind: 'building' as const,
    size,
    rooms: [{ id: `${id}-room`, name: 'Studio', rect: [0, 0, size[0], size[1]] as [number, number, number, number], floor: 'wood', walled: true }],
    doors: [],
    furniture: [{ t: 'computerDesk', p: [2, 2] as [number, number] }],
  });
  w.overrides = {
    studio: { size: [10, 8], furniture: [{ t: 'computerDesk', p: [5, 4], owner: 'bea' }, { t: 'plant', p: [1, 1] }] },
    bigger: { size: [10, 8], furniture: [{ t: 'plant', p: [1, 1] }] },
  };
  const sim = new Simulation(w);
  sim.addLevel(place('studio', [10, 8]));
  assert.deepEqual(sim.levels.get('studio')!.furniture.map((f) => [f.t, f.p]), [['computerDesk', [5, 4]], ['plant', [1, 1]]], 'as arranged');
  sim.addLevel(place('bigger', [14, 10]));
  assert.deepEqual(sim.levels.get('bigger')!.furniture.map((f) => f.t), ['computerDesk'], 'a different layout starts from its own');
  // Bea joins the studio's company: her desk is the one she had.
  sim.addCompany({ id: 'studio-co', name: 'Studio', levels: ['studio'] });
  const bea = sim.person('bea')!;
  sim.employ(bea, 'studio-co', 'studio');
  assert.equal(sim.items[bea.desk]?.def.p.join(','), '5,4');
});
