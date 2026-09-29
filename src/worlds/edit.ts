// World editing (docs/BUILDER.md): plain functions over a WorldDef, with no
// DOM and no sim. Each edits the world in place and returns
// a problem (a sentence for the user) or null. Validate the world afterwards
// for anything subtler.
import { CATALOG } from '../sim/catalog.ts';
import { atDoorOf, covers, doorOf, endsOn, footprint as footprintOf, inRect, overlap, sameTile as same, sides } from '../sim/geometry.ts';
import { TO_LET } from '../sim/housing.ts';
import { PRESETS } from '../sim/personality.ts';
import { hashOf } from '../sim/rng.ts';
import type { DepartmentDef, FurnitureDef, LevelDef, PersonDef, PortalDef, Rect, RoomDef, Tile, WorldDef } from '../sim/world.ts';
import { CLEARABLE, groundProblem } from './ground.ts';
import { outerRoom } from './rooms.ts';
import { buildToLet, type HomeStyle } from './homes.ts';
import { placementProblem, type Problem } from './placement.ts';

/** Colours handed to new departments, in turn. */
const DEPT_COLOURS = ['#c8453a', '#1f9e95', '#7f4aa6', '#3f74b5', '#e4793a', '#379463', '#e7aa2e', '#e27da3'];
const HOUSES = new Set(['terrace', 'house', 'detached']);

export type { Problem };

// ── Team ────────────────────────────────────────────────────────────────────

export interface NewPerson {
  name: string;
  /** Department name or id; created if it doesn't exist. */
  dept?: string;
  preset?: string;
  company?: string;
}

/** Add someone: a free desk in their department (if there is one) and a house that's to let. Returns their id and any notes. */
export function addPerson(world: WorldDef, input: NewPerson): { id: string; notes: string[] } {
  const notes: string[] = [];
  const name = input.name.trim() || 'Someone';
  const id = uniqueId(slug(name), new Set([...world.people, ...world.npcs].map((p) => p.id)));
  const dept = input.dept?.trim() ? departmentFor(world, input.dept) : undefined;
  const company = input.company ?? world.companies[0]?.id;
  const preset = presetFor(input.preset);
  const person: PersonDef = { id, name, look: lookFor(id), preset, ...(dept ? { dept: dept.id } : {}), ...(company ? { company } : {}) };

  const desk = freeDesk(world, company, dept);
  if (desk) desk.owner = id;
  else notes.push(`No free desk for ${name}: add one in the map editor.`);

  const home = vacantHome(world);
  if (home) {
    moveInto(home, id, `${name}'s house`);
    person.home = home.level.id;
  } else notes.push(`No house to let for ${name}: they'll come and go from the edge of town.`);

  world.people.push(person);
  return { id, notes };
}

/** Take someone out of the world. Their desk is freed; their home goes up to let, with any family and pets who lived there. */
export function removePerson(world: WorldDef, id: string): Problem {
  const index = world.people.findIndex((p) => p.id === id);
  if (index < 0) return 'Nobody by that id.';
  const [person] = world.people.splice(index, 1);
  // Their desk, bed and so on are anyone's now.
  for (const level of world.levels) for (const item of level.furniture) if (item.owner === id) delete item.owner;
  const home = homes(world).find((h) => h.level.id === person!.home);
  if (home && !world.people.some((p) => p.home === home.level.id)) {
    world.npcs = world.npcs.filter((n) => n.home !== home.level.id || n.role === 'staff');
    moveInto(home, undefined, TO_LET);
  }
  return null;
}

/** Change someone's name, department or personality. */
export function updatePerson(world: WorldDef, id: string, changes: Partial<NewPerson>): Problem {
  const person = world.people.find((p) => p.id === id);
  if (!person) return 'Nobody by that id.';
  if (changes.name?.trim()) {
    person.name = changes.name.trim();
    const home = homes(world).find((h) => h.item.owner === id);
    if (home) home.level.name = home.level.rooms[0]!.name = `${person.name}'s house`;
  }
  if (changes.dept !== undefined) {
    const dept = changes.dept.trim() ? departmentFor(world, changes.dept) : undefined;
    if (dept) person.dept = dept.id;
    else delete person.dept;
  }
  if (changes.preset) person.preset = presetFor(changes.preset);
  return null;
}

export interface ListRow {
  name: string;
  dept?: string;
  preset?: string;
}

/**
 * A pasted team list: one person per line, as "Name, Department, Preset"
 * (commas or tabs; department and preset optional). Blank lines and a header
 * row starting "name" are skipped.
 */
export function parseTeamList(text: string): ListRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter(([name]) => name && name.toLowerCase() !== 'name')
    .map(([name, dept, preset]) => ({ name: name!, ...(dept ? { dept } : {}), ...(preset ? { preset } : {}) }));
}

/** A department by name or id, created (with the next colour and laptop desks) if it doesn't exist yet. */
export function departmentFor(world: WorldDef, nameOrId: string): DepartmentDef {
  const key = nameOrId.trim().toLowerCase();
  const found = world.departments.find((d) => d.id === key || d.name.toLowerCase() === key);
  if (found) return found;
  const dept: DepartmentDef = {
    id: uniqueId(slug(nameOrId), new Set(world.departments.map((d) => d.id))),
    name: nameOrId.trim(),
    color: DEPT_COLOURS[world.departments.length % DEPT_COLOURS.length]!,
    station: 'laptopDesk',
  };
  world.departments.push(dept);
  return dept;
}

function presetFor(name: string | undefined): string {
  const key = name?.trim().toLowerCase() ?? '';
  const match = Object.entries(PRESETS).find(([id, preset]) => id.toLowerCase() === key || preset.label.toLowerCase() === key);
  return match?.[0] ?? 'regular';
}

/** A look that's stable for an id: skin, hair, shirt and style from its letters. */
function lookFor(id: string): [number, number, number, number] {
  const h = hashOf(id, 2166136261) >>> 0;
  return [h % 5, (h >>> 3) % 7, (h >>> 6) % 8, (h >>> 9) % 3];
}

/** An unowned desk in the company's offices, the department's own kind first. */
function freeDesk(world: WorldDef, company: string | undefined, dept: DepartmentDef | undefined): FurnitureDef | undefined {
  const levels = new Set(world.companies.find((c) => c.id === company)?.levels ?? []);
  const desks = world.levels.filter((l) => levels.has(l.id)).flatMap((l) => l.furniture.filter((f) => CATALOG[f.t]?.desk && !f.owner));
  return desks.find((d) => d.t === dept?.station) ?? desks[0];
}

// ── Homes ───────────────────────────────────────────────────────────────────

interface HouseOnMap {
  item: FurnitureDef;
  level: LevelDef;
}

/** Every house on a map that leads to a home. */
function homes(world: WorldDef): HouseOnMap[] {
  return world.levels.flatMap((map) =>
    map.furniture.flatMap((item): HouseOnMap[] => {
      if (!HOUSES.has(item.t)) return [];
      const inside = insideOf(world, map.id, item);
      const level = world.levels.find((l) => l.id === inside && l.kind === 'home');
      return level ? [{ item, level }] : [];
    }),
  );
}

function vacantHome(world: WorldDef): HouseOnMap | undefined {
  const lived = new Set([...world.people, ...world.npcs].map((p) => p.home));
  return homes(world).find((h) => !lived.has(h.level.id));
}

function moveInto(home: HouseOnMap, owner: string | undefined, name: string): void {
  home.level.name = name;
  if (home.level.rooms[0]) home.level.rooms[0].name = name;
  if (owner) home.item.owner = owner;
  else delete home.item.owner;
}

/** The level a building on `map` leads into, through a portal on the row in front of it (as sim/places.ts sees it). */
function insideOf(world: WorldDef, map: string, item: FurnitureDef): string | undefined {
  for (const { a, b } of world.portals) {
    if (a.level === map && atDoorOf(item, a.p)) return b.level;
    if (b.level === map && atDoorOf(item, b.p)) return a.level;
  }
  return undefined;
}

/** Build a house on a map, with its home inside, empty and to let. */
export function addHouse(world: WorldDef, map: string, t: HomeStyle, at: Tile, faces?: 'up'): Problem {
  const level = world.levels.find((l) => l.id === map);
  if (level?.kind !== 'outside') return 'Houses go outside, on the town map.';
  const item: FurnitureDef = { t, p: at, ...(faces ? { faces } : {}) };
  const clash = placementProblem(level, world.portals, t, at);
  if (clash) return clash;
  const door = doorOf(item);
  if (!inBounds(level, door)) return 'There has to be room for a front door.';
  const n = world.levels.filter((l) => l.id.startsWith('home-to-let-')).length + 1;
  const { level: inside, entry } = buildToLet(t, uniqueNumber(world, n), n);
  level.furniture.push(item);
  level.rooms.push({ id: uniqueRoom(world, `path-${door[0]}-${door[1]}`), name: 'Path', rect: [door[0], door[1], 1, 1], floor: 'path' });
  world.levels.push(inside);
  world.portals.push({ kind: 'door', a: { level: map, p: door }, b: { level: inside.id, p: entry } });
  return null;
}

function uniqueNumber(world: WorldDef, from: number): number {
  let n = from;
  while (world.levels.some((l) => l.id === `home-to-let-${n}`)) n++;
  return n;
}

// ── Map ─────────────────────────────────────────────────────────────────────

/** Put a piece of furniture down. Houses on the town map come with a home inside. */
export function placeFurniture(world: WorldDef, map: string, t: string, at: Tile): Problem {
  const level = world.levels.find((l) => l.id === map);
  if (!level) return 'No such level.';
  if (!CATALOG[t]) return `No such furniture: ${t}.`;
  if (HOUSES.has(t)) return addHouse(world, map, t as HomeStyle, at);
  const problem = placementProblem(level, world.portals, t, at);
  if (problem) return problem;
  level.furniture.push({ t, p: at });
  return null;
}

/** Move the `t` standing at `from` to `to`, if it's safe there. It keeps its owner. */
export function moveFurniture(world: WorldDef, map: string, t: string, from: Tile, to: Tile): Problem {
  const level = world.levels.find((l) => l.id === map);
  const item = level?.furniture.find((f) => f.t === t && same(f.p, from));
  if (!level || !item) return 'Nothing like that there.';
  const problem = placementProblem(level, world.portals, t, to, item);
  if (problem) return problem;
  item.p = to;
  return null;
}

/** Take away exactly this piece (the `t` standing at `at`), whatever else is stacked there. For undoing. */
export function removeFurniture(world: WorldDef, map: string, t: string, at: Tile): Problem {
  const level = world.levels.find((l) => l.id === map);
  const i = level?.furniture.findIndex((f) => f.t === t && same(f.p, at)) ?? -1;
  if (!level || i < 0) return 'Nothing like that there.';
  level.furniture.splice(i, 1);
  return null;
}

/** Take away whatever's on a tile. Buildings with a door, and anyone's house, stay put. */
export function eraseAt(world: WorldDef, map: string, at: Tile): Problem {
  const level = world.levels.find((l) => l.id === map);
  if (!level) return 'No such level.';
  const item = [...level.furniture].reverse().find((f) => covers(f, ...at));
  if (!item) return 'Nothing there.';
  const home = homes(world).find((h) => h.item === item);
  if (home) {
    if (world.people.some((p) => p.home === home.level.id) || world.npcs.some((n) => n.home === home.level.id)) {
      return 'Someone lives there. Remove them in the Team section first.';
    }
    // An empty house goes, with its home and door.
    world.levels = world.levels.filter((l) => l !== home.level);
    world.portals = world.portals.filter((p) => p.a.level !== home.level.id && p.b.level !== home.level.id);
  } else if (insideOf(world, map, item)) {
    return 'Buildings with a way in stay put.';
  }
  level.furniture.splice(level.furniture.indexOf(item), 1);
  return null;
}

// ── Buildings ───────────────────────────────────────────────────────────────

/** A building on the map moves with its doors and its front path. */
interface Building {
  level: LevelDef;
  item: FurnitureDef;
  /** The portal ends on the map at its doors. */
  doors: PortalDef['a'][];
  /** Paths that start at a door. */
  paths: RoomDef[];
}

/** Can this piece be moved as a building: anything with a way in, and empty lots? */
export function isBuilding(world: WorldDef, map: string, item: FurnitureDef): boolean {
  return !!insideOf(world, map, item) || !!CATALOG[item.t]?.lot;
}

/** Why a building can't move to `to`, or null if it can (small things in the way will be cleared). */
export function buildingMoveProblem(world: WorldDef, map: string, item: FurnitureDef, to: Tile): Problem {
  const b = buildingOf(world, map, item);
  if (!b) return 'Nothing like that there.';
  const [dx, dy] = [to[0] - item.p[0], to[1] - item.p[1]];
  return landingProblem(world, b, { ...item, p: to }, b.doors.map((d) => shifted(d.p, dx, dy)), b.paths.map((r) => shiftedRect(r.rect, dx, dy)));
}

/** Move a building, its doors and its front path. Returns the small things it cleared. Check `buildingMoveProblem` first. */
export function moveBuilding(world: WorldDef, map: string, item: FurnitureDef, to: Tile): FurnitureDef[] {
  const b = buildingOf(world, map, item);
  if (!b) return [];
  const [dx, dy] = [to[0] - item.p[0], to[1] - item.p[1]];
  item.p = to;
  for (const door of b.doors) door.p = shifted(door.p, dx, dy);
  for (const path of b.paths) path.rect = shiftedRect(path.rect, dx, dy);
  return clearFor(b.level, item, b.paths.map((r) => r.rect));
}

/** Turn a house round to face the other way: its door and front path go to the other side. */
export function flipHouse(world: WorldDef, map: string, item: FurnitureDef): Problem | FurnitureDef[] {
  if (!HOUSES.has(item.t)) return 'Only houses turn round.';
  const b = buildingOf(world, map, item);
  if (!b) return 'Nothing like that there.';
  const flipped: FurnitureDef = { ...item, faces: item.faces === 'up' ? undefined : 'up' };
  const [from, to] = [doorOf(item), doorOf(flipped)];
  // Each path is mirrored through the house: as far past the new door as it ran past the old one.
  const paths = b.paths.map(({ rect: [x, y, w, h] }): Rect => [x, to[1] - (y + h - 1 - from[1]), w, h]);
  const problem = landingProblem(world, b, flipped, [to], paths);
  if (problem) return problem;
  if (flipped.faces) item.faces = 'up';
  else delete item.faces;
  for (const door of b.doors) door.p = to;
  b.paths.forEach((path, i) => {
    path.rect = paths[i]!;
  });
  return clearFor(b.level, item, paths);
}

function buildingOf(world: WorldDef, map: string, item: FurnitureDef): Building | null {
  const level = world.levels.find((l) => l.id === map);
  if (!level?.furniture.includes(item)) return null;
  const doors = endsOn(world.portals, map).filter((end) => atDoorOf(item, end.p));
  const paths = level.rooms.filter((r) => r.floor === 'path' && !r.id.startsWith('pavement-') && doors.some((d) => inRect(r.rect, ...d.p)));
  return { level, item, doors, paths };
}

/** Would the building fit here, with its doors and paths? Small things don't count: they'll be cleared. */
function landingProblem(world: WorldDef, b: Building, placed: FurnitureDef, doors: Tile[], paths: Rect[]): Problem {
  const footprint = footprintOf(placed);
  const others = b.level.furniture.filter((f) => f !== b.item && !(CLEARABLE.has(f.t) && [footprint, ...paths].some((r) => overlap(footprintOf(f), r))));
  const without: LevelDef = { ...b.level, furniture: others };
  const own = new Set(b.doors);
  const portals = world.portals.filter((p) => !own.has(p.a) && !own.has(p.b));
  // Nothing but grass underfoot: not even a lot or a parking bay, which furniture can stand on.
  const problem = placementProblem(without, portals, placed.t, placed.p) ?? groundProblem(without, footprint);
  if (problem) return problem;
  for (const door of doors) {
    if (!inBounds(b.level, door)) return 'There has to be room for the front door.';
    const blocked = groundProblem(without, [door[0], door[1], 1, 1]);
    if (blocked) return `The front door: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}`;
  }
  for (const path of paths) {
    const blocked = groundProblem(without, path);
    if (blocked) return `The front path: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}`;
  }
  return null;
}

/** Clear small things from under a building and its paths. */
function clearFor(level: LevelDef, item: FurnitureDef, paths: Rect[]): FurnitureDef[] {
  const areas: Rect[] = [footprintOf(item), ...paths];
  const cleared = level.furniture.filter((f) => f !== item && CLEARABLE.has(f.t) && areas.some((r) => overlap(footprintOf(f), r)));
  level.furniture = level.furniture.filter((f) => !cleared.includes(f));
  return cleared;
}

function shifted([x, y]: Tile, dx: number, dy: number): Tile {
  return [x + dx, y + dy];
}

function shiftedRect([x, y, w, h]: Rect, dx: number, dy: number): Rect {
  return [x + dx, y + dy, w, h];
}


// ── Floors ──────────────────────────────────────────────────────────────────

/** The most storeys (ground floor included) a home can have, and any other building. */
const MAX_STOREYS = { home: 3, other: 5 };
const ORDINALS = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor', 'Fifth floor', 'Sixth floor'];

/** A floor, and everything that joins it on: the stairs up to it (a portal, and the stairs on the floor below), and the companies it's part of. */
export interface Floor {
  level: LevelDef;
  portal: PortalDef;
  /** The level the stairs come up from, and the stairs there. */
  below: string;
  stairs: FurnitureDef;
  companies: string[];
}

/**
 * A new floor above `below`, up stairs at `at`: the same size, one room within
 * the same outside walls, and stairs back down in the same spot. It's part of
 * the same home (or company). Nothing's changed until you `addFloor` it.
 */
export function planFloor(world: WorldDef, below: string, at: Tile): string | Floor {
  const parent = world.levels.find((l) => l.id === below);
  if (!parent || parent.kind === 'outside') return 'Floors go in buildings.';
  // Stairs up run from the floor below (a) to the one above (b): one floor above each, however many stairs.
  if (world.portals.some((p) => p.kind === 'stairs' && p.a.level === parent.id)) return 'There’s already a floor above: take the stairs up to build higher.';
  const storeys = building(world, parent.id).length;
  const most = parent.kind === 'home' ? MAX_STOREYS.home : MAX_STOREYS.other;
  if (storeys >= most) return `${storeys} floors is as tall as ${parent.kind === 'home' ? 'a house' : 'a building'} goes here.`;
  const problem = placementProblem(parent, world.portals, 'stairs', at);
  if (problem) return problem;
  const outer = outerRoom(parent);
  if (!outer) return 'This place has no outside walls to build up from.';
  const base = parent.floorOf ?? parent.id;
  const name = ORDINALS[storeys] ?? `Floor ${storeys}`;
  const taken = new Set(world.levels.map((l) => l.id));
  let n = storeys;
  while (taken.has(`${base}-floor-${n}`)) n++;
  const id = `${base}-floor-${n}`;
  const stairs: FurnitureDef = { t: 'stairs', p: at };
  return {
    level: {
      id,
      name,
      kind: parent.kind,
      size: [...parent.size],
      rooms: [{ id: `${id}-room`, name, rect: [...outer.rect], floor: outer.floor, walled: true }],
      doors: [],
      furniture: [{ t: 'stairs', p: [...at] }],
      floorOf: base,
    },
    portal: { kind: 'stairs', a: { level: parent.id, p: [...at] }, b: { level: id, p: [...at] } },
    below: parent.id,
    stairs,
    companies: world.companies.filter((c) => c.levels.includes(parent.id)).map((c) => c.id),
  };
}

/** Build a planned floor into a world. */
export function addFloor(world: WorldDef, floor: Floor): void {
  world.levels.push(structuredClone(floor.level));
  world.portals.push(structuredClone(floor.portal));
  world.levels.find((l) => l.id === floor.below)?.furniture.push(structuredClone(floor.stairs));
  for (const company of world.companies) if (floor.companies.includes(company.id)) company.levels.push(floor.level.id);
}

/** A floor you added, as it stands, ready to take away (or put back): only the top floor of a stack comes off. */
export function floorToRemove(world: WorldDef, id: string): string | Floor {
  const level = world.levels.find((l) => l.id === id);
  if (!level?.floorOf) return 'Only floors you’ve added come away.';
  // Stairs up to a floor run from the floor below (a) to it (b), so a floor's stairs down are the ones that end on it.
  const portal = world.portals.find((p) => p.kind === 'stairs' && p.b.level === id);
  if (!portal) return 'There are no stairs up to it.';
  if (world.portals.some((p) => p.kind === 'stairs' && p.a.level === id)) return 'Take the floor above it off first.';
  const down = portal.a;
  const below = world.levels.find((l) => l.id === down.level);
  const stairs = below?.furniture.find((f) => f.t === 'stairs' && f.p[0] === down.p[0] && f.p[1] === down.p[1]);
  if (!below || !stairs) return 'There are no stairs up to it.';
  return {
    level: structuredClone(level),
    portal: structuredClone(portal),
    below: below.id,
    stairs: structuredClone(stairs),
    companies: world.companies.filter((c) => c.levels.includes(id)).map((c) => c.id),
  };
}

/** Take a floor away from a world: the level, its stairs up, and its place in any company. */
export function removeFloor(world: WorldDef, floor: Floor): void {
  const id = floor.level.id;
  world.levels = world.levels.filter((l) => l.id !== id);
  world.portals = world.portals.filter((p) => p.a.level !== id && p.b.level !== id);
  const below = world.levels.find((l) => l.id === floor.below);
  if (below) below.furniture = below.furniture.filter((f) => !(f.t === 'stairs' && f.p[0] === floor.stairs.p[0] && f.p[1] === floor.stairs.p[1]));
  for (const company of world.companies) company.levels = company.levels.filter((l) => l !== id);
}

/** Every floor of the building a level's in, found by following the stairs. */
function building(world: WorldDef, level: string): string[] {
  const floors = [level];
  for (let i = 0; i < floors.length; i++) {
    for (const p of world.portals) {
      if (p.kind !== 'stairs') continue;
      for (const [from, to] of sides(p)) if (from.level === floors[i] && !floors.includes(to.level)) floors.push(to.level);
    }
  }
  return floors;
}

// ── Undo ────────────────────────────────────────────────────────────────────

/** How a map is now, ready to be put back. */
export interface Snapshot {
  restore(): void;
}

/**
 * Remember a map's ground or rooms, doorways, furniture and doors, to put back later (undo). It
 * keeps the very same furniture, just where it was, so putting it back brings
 * back the same pieces rather than copies.
 */
export function snapshot(world: WorldDef, map: string): Snapshot {
  const level = world.levels.find((l) => l.id === map);
  if (!level) return { restore: () => {} };
  const rooms = structuredClone(level.rooms);
  const doorways = structuredClone(level.doors);
  const furniture = [...level.furniture];
  const places = furniture.map((f) => ({ f, p: f.p, faces: f.faces }));
  const doors = endsOn(world.portals, map).map((end) => ({ end, p: end.p }));
  return {
    restore: () => {
      level.rooms = structuredClone(rooms);
      level.doors = structuredClone(doorways);
      level.furniture = [...furniture];
      for (const { f, p, faces } of places) {
        f.p = p;
        if (faces) f.faces = faces;
        else delete f.faces;
      }
      for (const { end, p } of doors) end.p = p;
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function inBounds(level: LevelDef, [x, y]: Tile): boolean {
  return x >= 0 && y >= 0 && x < level.size[0] && y < level.size[1];
}

function slug(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'someone';
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function uniqueRoom(world: WorldDef, base: string): string {
  return uniqueId(base, new Set(world.levels.flatMap((l) => l.rooms.map((r) => r.id))));
}
