// New buildings from the editor's picker (docs/BUILDER.md#new-buildings): a home comes with a home to let inside;
// a workplace with its inside (the same templates as the starter town's) and a company of its own, under a made-up
// name, that takes on anyone looking for work. Each is put up straight away, door and all.
import { CATALOG } from '../sim/catalog.ts';
import { doorOf, footprint, overlap } from '../sim/geometry.ts';
import type { CompanyDef, FurnitureDef, LevelDef, PortalDef, Tile, WorldDef } from '../sim/world.ts';
import { CLEARABLE } from './ground.ts';
import { buildToLet, type HomeStyle } from './homes.ts';
import { buildOffice } from './offices.ts';
import { type Problem, placementProblem } from './placement.ts';
import { buildSchool } from './school.ts';
import { buildClubhouse, buildDepot, buildDiner, buildGardenCentre, buildHangar, buildLeisure, buildShop } from './venues.ts';

/** What's inside a workplace, what kind of place it is in its name, and its company's icon (none: a public place nobody runs, like the boating club). */
interface Workplace {
  inside: (id: string, name: string) => { level: LevelDef; entry: Tile };
  noun: string;
  icon?: string;
}

/** Every building in the picker: a home (its style) or a workplace. */
export const PLACEABLE: Record<string, { home: HomeStyle | 'narrowboat' } | Workplace> = {
  terrace: { home: 'terrace' },
  house: { home: 'house' },
  detached: { home: 'detached' },
  narrowboat: { home: 'narrowboat' },
  supermarket: { inside: (id, name) => buildShop(id, name, []), noun: 'Stores', icon: 'cart' },
  diner: { inside: buildDiner, noun: 'Diner', icon: 'cup' },
  startupLarge: { inside: (id, name) => buildOffice(2, id, name), noun: 'Works', icon: 'office' },
  leisureCentre: { inside: buildLeisure, noun: 'Leisure Centre', icon: 'swim' },
  gardenCentre: { inside: buildGardenCentre, noun: 'Garden Centre', icon: 'flowers' },
  depot: { inside: buildDepot, noun: 'Parcels', icon: 'parcel' },
  hangar: { inside: buildHangar, noun: 'Air', icon: 'plane' },
  school: { inside: (id, name) => buildSchool(id, name, []), noun: 'School', icon: 'school' },
  boathouse: { inside: buildClubhouse, noun: 'Boating Club' },
};

/** For made-up names: the first that isn't taken, of these and a kind of place. */
const NAMES = ['Maple', 'Hawthorn', 'Bramble', 'Willow', 'Juniper', 'Hazel', 'Larch', 'Elder', 'Foxglove', 'Blackthorn', 'Aspen', 'Sorrel', 'Linden', 'Yarrow'];

/** A building put up from the picker: the piece on the map, its inside and the door between, and its company. */
export interface NewBuilding {
  map: string;
  item: FurnitureDef;
  level: LevelDef;
  portal: PortalDef;
  company?: CompanyDef;
  /** The small things it cleared out of its way (a tree, a bush), put back if it comes down again by undo. */
  cleared: FurnitureDef[];
}

/** Why `t` can't go up at `at` on `map` (out of doors, with room for its door), or null. */
export function buildingProblem(world: WorldDef, map: string, t: string, at: Tile): Problem {
  const level = world.levels.find((l) => l.id === map);
  const kind = PLACEABLE[t];
  if (!level || !kind || !CATALOG[t]) return 'That can’t go here.';
  if (level.kind !== 'outside') return 'Buildings go outside, on the town map.';
  const item = itemFor(t, at);
  // Small things in the way (a tree, a bush) are cleared.
  const clear = { ...level, furniture: level.furniture.filter((f) => !(CLEARABLE.has(f.t) && overlap(footprint(f), footprint(item)))) };
  const clash = placementProblem(clear, world.portals, t, at);
  if (clash) return clash;
  const [x, y] = doorOf(item);
  if (x < 0 || y < 0 || x >= level.size[0] || y >= level.size[1]) return 'There has to be room for the front door.';
  const under = level.rooms.filter((r) => x >= r.rect[0] && y >= r.rect[1] && x < r.rect[0] + r.rect[2] && y < r.rect[1] + r.rect[3]).sort((a, b) => a.rect[2] * a.rect[3] - b.rect[2] * b.rect[3])[0];
  if (under && ['water', 'highway'].includes(under.floor)) return 'Its front door would open onto water.';
  return null;
}

/** Everything a new `t` at `at` on `map` comes with, its ids clear of everything in `worlds` (the running town and its design). Check `buildingProblem` first. */
export function newBuilding(worlds: readonly WorldDef[], map: string, t: string, at: Tile): NewBuilding {
  const kind = PLACEABLE[t]!;
  const item = itemFor(t, at);
  const taken = new Set(worlds.flatMap((w) => w.levels.map((l) => l.id)));
  const door = { level: map, p: doorOf(item) };
  const cleared = (worlds[0]!.levels.find((l) => l.id === map)?.furniture ?? []).filter((f) => CLEARABLE.has(f.t) && overlap(footprint(f), footprint(item))).map((f) => structuredClone(f));
  if ('home' in kind) {
    let n = 1;
    while (taken.has(`home-to-let-${n}`)) n++;
    const { level, entry } = buildToLet(kind.home, n, n);
    return { map, item, level, portal: { kind: 'door', a: door, b: { level: level.id, p: entry } }, cleared };
  }
  const name = nameFor(worlds, kind.noun);
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let id = stem;
  for (let n = 2; taken.has(id) || taken.has(`${id}-office`); n++) id = `${stem}-${n}`;
  const { level, entry } = kind.inside(id, name);
  item.label = name;
  const company: CompanyDef | undefined = kind.icon ? { id: level.id, name, icon: kind.icon, walkIn: true, levels: [level.id] } : undefined;
  return { map, item, level, portal: { kind: 'door', a: door, b: { level: level.id, p: entry } }, ...(company ? { company } : {}), cleared };
}

/** Put a new building into a world (the running town does it through the sim instead). */
export function putUp(world: WorldDef, b: NewBuilding): void {
  const map = world.levels.find((l) => l.id === b.map);
  if (map) map.furniture = map.furniture.filter((f) => !b.cleared.some((c) => c.t === f.t && c.p[0] === f.p[0] && c.p[1] === f.p[1]));
  map?.furniture.push(structuredClone(b.item));
  world.levels.push(structuredClone(b.level));
  world.portals.push(structuredClone(b.portal));
  if (b.company) world.companies.push(structuredClone(b.company));
}

/** Take a building away from a world, everything it came with. */
export function takeDown(world: WorldDef, b: NewBuilding): void {
  const map = world.levels.find((l) => l.id === b.map);
  if (map) map.furniture = map.furniture.filter((f) => !(f.t === b.item.t && f.p[0] === b.item.p[0] && f.p[1] === b.item.p[1]));
  map?.furniture.push(...structuredClone(b.cleared));
  world.levels = world.levels.filter((l) => l.id !== b.level.id);
  world.portals = world.portals.filter((p) => p.a.level !== b.level.id && p.b.level !== b.level.id);
  if (b.company) world.companies = world.companies.filter((c) => c.id !== b.company!.id);
}

/** A building on the map as a `NewBuilding` (to take it down, and put it back on undo), if it's one the picker could have put up. */
export function existing(world: WorldDef, map: string, item: FurnitureDef): NewBuilding | null {
  if (!PLACEABLE[item.t]) return null;
  const door = doorOf(item);
  const portal = world.portals.find((p) => (p.a.level === map && p.a.p[0] === door[0] && p.a.p[1] === door[1]) || (p.b.level === map && p.b.p[0] === door[0] && p.b.p[1] === door[1]));
  if (!portal) return null;
  const inside = portal.a.level === map ? portal.b.level : portal.a.level;
  const level = world.levels.find((l) => l.id === inside);
  if (!level) return null;
  const company = world.companies.find((c) => c.levels.length === 1 && c.levels[0] === inside);
  return { map, item: structuredClone(item), level: structuredClone(level), portal: structuredClone(portal), ...(company ? { company: structuredClone(company) } : {}), cleared: [] };
}

/** Who'd be left without a home or a job if this building went: their names, or none. */
export function inUse(world: WorldDef, b: NewBuilding): string[] {
  const home = [...world.people, ...world.npcs].filter((p) => p.home === b.level.id).map((p) => p.name);
  const work = world.people.filter((p) => b.company && p.company === b.company.id).map((p) => p.name);
  const staff = world.npcs.filter((n) => n.works === b.level.id).map((n) => n.name);
  return [...new Set([...home, ...work, ...staff])];
}

/** A name for a new place of this kind that nothing in town has yet. */
function nameFor(worlds: readonly WorldDef[], noun: string): string {
  const used = new Set(worlds.flatMap((w) => [...w.companies.map((c) => c.name), ...w.levels.map((l) => l.name)]));
  for (const name of NAMES) if (!used.has(`${name} ${noun}`)) return `${name} ${noun}`;
  for (let n = 2; ; n++) if (!used.has(`${NAMES[0]} ${noun} ${n}`)) return `${NAMES[0]} ${noun} ${n}`;
}

/** The piece on the map: facing up onto the bank, for a narrowboat (its door's above it). */
function itemFor(t: string, at: Tile): FurnitureDef {
  return t === 'narrowboat' ? { t, p: [at[0], at[1]], faces: 'up' } : { t, p: [at[0], at[1]] };
}

