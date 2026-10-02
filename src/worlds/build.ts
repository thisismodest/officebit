// A town config made into a world (docs/WORLD.md#town-configs): ground, roads (and pavements along them), buildings with their
// insides and doors, everyone's home, and the paths from each door to its street.
import { CATALOG } from '../sim/catalog.ts';
import { footprint, freeRoomId, tilesIn } from '../sim/geometry.ts';
import { resolveTraits } from '../sim/personality.ts';
import { Rng } from '../sim/rng.ts';
import type { FurnitureDef, LevelDef, PortalDef, Tile, WorldDef } from '../sim/world.ts';
import type { Building, Floor, HomeRow, Placed, Thing, TownConfig } from './config.ts';
import { lay, layPavements } from './ground.ts';
import { buildHome, buildNarrowboat, buildToLet, type HomeStyle } from './homes.ts';
import { portal } from './layout.ts';
import { roomAt } from './rooms.ts';
import { buildSchool } from './school.ts';
import { VERSION } from './version.ts';
import { buildClubhouse, buildDiner, buildLeisure, buildShop, type Venue } from './venues.ts';

const TOWN = 'town';
/** How far a path from a door goes looking for its street (tiles). */
const PATH_REACH = 12;
/** Presets that like a game: their homes get a console. */
const GAMERS = new Set(['regular', 'distractor', 'magnet', 'founder']);

/** What each template builds, given the building and the town (for who works or learns there). */
const TEMPLATES: Record<string, (b: Building, config: TownConfig) => Venue> = {
  diner: (b) => buildDiner(b.id, b.label),
  shop: (b, config) => buildShop(b.id, b.label, config.people.filter((p) => p.company === b.id).map((p) => p.id)),
  school: (b, config) => buildSchool(b.id, b.label, config.npcs.filter((n) => n.role === 'child' && n.works === b.id).map((n) => n.id)),
  clubhouse: (b) => buildClubhouse(b.id, b.label),
  leisure: (b) => buildLeisure(b.id, b.label),
};

const homeOf = (id: string) => `home-${id}`;

export function buildWorld(config: TownConfig): WorldDef {
  const [w, h] = config.size;
  const town: LevelDef = { id: TOWN, name: 'Town', kind: 'outside', size: [w, h], rooms: [{ id: TOWN, name: 'Town', rect: [0, 0, w, h], floor: 'grass' }], doors: [], furniture: [], view: config.view };
  const levels: LevelDef[] = [];
  const portals: PortalDef[] = [];
  const at = (p: Tile) => ({ level: TOWN, p });

  // The ground, then the roads over it (bridged over water, with pavements), crossings and footpaths.
  for (const area of config.areas) {
    for (const rect of area.rects) {
      town.rooms.push({ id: freeRoomId(town, slug(area.name)), name: area.name, rect, floor: area.floor, ...(area.park ? { park: true } : {}), ...(area.square ? { square: true } : {}) });
    }
  }
  for (const road of config.roads) lay(town, road.rects, 'road', road.name);
  if (config.pavements) layPavements(town);
  for (const { floor, rect } of config.crossings) town.rooms.push({ id: freeRoomId(town, 'crossing'), name: 'Zebra crossing', rect, floor });
  for (const rect of config.paths) lay(town, [rect], 'path');

  // Buildings, and what's inside.
  const doors: { door: Tile; faces?: 'up' }[] = [];
  for (const b of config.buildings) {
    town.furniture.push({ t: b.t, p: b.at, label: b.label, ...(b.faces ? { faces: b.faces } : {}) });
    const door = doorTile(b.t, b);
    doors.push({ door, faces: b.faces });
    if ('template' in b.inside) {
      const make = TEMPLATES[b.inside.template];
      if (!make) throw new Error(`No template "${b.inside.template}" for ${b.label}: see TEMPLATES in build.ts`);
      const venue = make(b, config);
      levels.push(venue.level);
      portals.push(portal('door', at(door), { level: venue.level.id, p: venue.entry }));
    } else {
      const { floors, entry, stairs } = b.inside;
      for (const id of floors) levels.push(floorLevel(id, config.floors[id]!, config));
      portals.push(portal('door', at(door), { level: floors[0]!, p: entry }));
      if (stairs) for (const [i, id] of floors.slice(1).entries()) portals.push(portal('stairs', { level: floors[i]!, p: stairs }, { level: id, p: stairs }));
    }
  }

  // Homes: everyone's, handed out, and the rest to let.
  const plots = config.homes.flatMap(plotsOf);
  const owners = handOut(config, plots);
  let toLet = 0;
  for (const [i, plot] of plots.entries()) {
    const owner = owners.get(plot);
    town.furniture.push({ t: plot.t, p: plot.at, ...(owner ? { owner } : {}), ...(plot.faces ? { faces: plot.faces } : {}) });
    const door = doorTile(plot.t, plot);
    doors.push({ door, faces: plot.faces });
    // Every third house (not terraces or boats) has flowers by the door.
    if (i % 3 === 0 && plot.t !== 'terrace' && plot.t !== 'narrowboat') town.furniture.push({ t: 'flowers', p: [door[0] + 1, door[1]] });
    const home = owner ? homeFor(plot.t, owner, config, i) : buildToLet(plot.t as HomeStyle, ++toLet, toLet - 1);
    levels.push(home.level);
    portals.push(portal('door', at(door), { level: home.level.id, p: home.entry }));
  }
  for (const lot of config.lots) town.furniture.push({ t: 'lot', p: lot.at, ...(lot.faces ? { faces: lot.faces } : {}) });

  // Paths from every door to its street, then everything else on the map.
  if (config.doorPaths) for (const { door, faces } of doors) pathFrom(town, door, faces);
  for (const [i, thing] of config.things.entries()) place(town, thing, config.seed + i);

  return {
    v: 2,
    name: config.name,
    version: VERSION,
    seed: config.seed,
    companies: config.companies,
    departments: config.departments,
    levels: [town, ...levels],
    portals,
    spawn: at(config.spawn),
    people: config.people.map((p) => ({ ...p, home: homeOf(p.id) })),
    npcs: config.npcs.map(({ own, ...n }) => ({ ...n, home: homeOf(own ? n.id : (n.home ?? n.id)) })),
  };
}

/** The tile in front of a building's door: below it (or above, facing up), `door` tiles in from its left. */
function doorTile(t: string, { at: [x, y], faces, door = 1 }: Placed): Tile {
  const [, h] = CATALOG[t]!.size;
  return [x + door, faces === 'up' ? y - 1 : y + h];
}

interface Plot extends Placed {
  t: HomeRow['t'];
  owner?: string;
}

/** A row of homes as one plot each, side by side. */
function plotsOf(row: HomeRow): Plot[] {
  const [w] = CATALOG[row.t]!.size;
  return Array.from({ length: row.count ?? 1 }, (_, i) => ({ ...row, at: [row.at[0] + i * (w + (row.gap ?? 0)), row.at[1]] }));
}

/**
 * Who lives where: homes named for someone are theirs; everyone else is handed one, bigger households first.
 * Families with children want a detached house; couples and the boss a semi; ambitious people a semi if there's one
 * going; everyone else a terrace. What's left is to let.
 */
function handOut(config: TownConfig, plots: Plot[]): Map<Plot, string> {
  const owners = new Map<Plot, string>();
  for (const plot of plots) if (plot.owner) owners.set(plot, plot.owner);
  const named = new Set(owners.values());
  const presetOf = (id: string) => config.people.find((p) => p.id === id)?.preset ?? config.npcs.find((n) => n.id === id)?.preset;
  const householders = [...config.people.map((p) => p.id), ...config.npcs.filter((n) => n.own).map((n) => n.id)].filter((id) => !named.has(id));
  const ranked = householders.map((id) => {
    const household = config.npcs.filter((n) => n.home === id && n.species === 'human');
    const kids = household.some((n) => n.role === 'child');
    const senior = config.people.find((p) => p.id === id)?.dept === config.departments[0]?.id;
    const ambitious = resolveTraits(presetOf(id)).ambition >= 0.6;
    const wants: HomeStyle[] = kids ? ['detached'] : household.length > 0 || senior ? ['house', 'detached', 'terrace'] : ambitious ? ['house', 'terrace'] : ['terrace', 'house'];
    return { id, wants, rank: household.length * 2 + (kids ? 4 : 0) + (senior ? 2 : 0) };
  });
  for (const { id, wants } of ranked.sort((a, b) => b.rank - a.rank)) {
    const plot = wants.map((style) => plots.find((p) => p.t === style && !owners.has(p))).find(Boolean);
    if (!plot) throw new Error(`No home left for ${id}: add one to the config's homes`);
    owners.set(plot, id);
  }
  return owners;
}

function homeFor(t: HomeRow['t'], owner: string, config: TownConfig, variant: number) {
  const name = config.people.find((p) => p.id === owner)?.name ?? config.npcs.find((n) => n.id === owner)?.name ?? owner;
  if (t === 'narrowboat') return buildNarrowboat(owner, name);
  const preset = config.people.find((p) => p.id === owner)?.preset ?? config.npcs.find((n) => n.id === owner)?.preset;
  return buildHome(t, owner, name, variant, { console: GAMERS.has(preset ?? 'regular') });
}

/** One of the town's own floors, its desks handed to each department's people in order. */
function floorLevel(id: string, floor: Floor, config: TownConfig): LevelDef {
  const furniture = floor.furniture.flatMap((f): FurnitureDef[] => {
    if (!('desks' in f)) return [f];
    const station = config.departments.find((d) => d.id === f.desks)!.station;
    const owners = config.people.filter((p) => p.dept === f.desks).map((p) => p.id);
    return f.at.map((p, i) => ({ t: station, p, ...(owners[i] ? { owner: owners[i] } : {}) }));
  });
  return { id, name: floor.name, kind: floor.kind, size: floor.size, rooms: floor.rooms, doors: floor.doors, furniture };
}

/** A path from a door straight out to the nearest pavement, path or road, across grass. */
function pathFrom(town: LevelDef, door: Tile, faces?: 'up'): void {
  const dy = faces === 'up' ? -1 : 1;
  const floorAt = (y: number) => roomAt(town, [door[0], y])?.floor;
  let reach = 0;
  while (reach < PATH_REACH && floorAt(door[1] + reach * dy) === 'grass') reach++;
  const joins = reach < PATH_REACH && floorAt(door[1] + reach * dy) !== undefined;
  const length = joins ? reach : 1;
  if (length === 0) return;
  const top = dy > 0 ? door[1] : door[1] - length + 1;
  town.rooms.push({ id: freeRoomId(town, 'path'), name: 'Path', rect: [door[0], top, 1, length], floor: 'path' });
}

/** A thing on the map: one piece, a row or column, a line, or a scattering. */
function place(town: LevelDef, thing: Thing, seed: number): void {
  const put = (t: string, x: number, y: number) => town.furniture.push({ t, p: [x, y] });
  if ('p' in thing) town.furniture.push(thing);
  else if ('row' in thing) for (const x of thing.row) put(thing.t, x, thing.y);
  else if ('column' in thing) for (const y of thing.column) put(thing.t, thing.x, y);
  else if ('from' in thing) {
    const [[x0, y0], [x1, y1]] = [thing.from, thing.to];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s += thing.step) {
      const x = x0 + Math.sign(x1 - x0) * s;
      const y = y0 + Math.sign(y1 - y0) * s;
      if (!thing.gaps?.some(([gx, gy, gw, gh]) => x >= gx && y >= gy && x < gx + gw && y < gy + gh)) put(thing.t, x, y);
    }
  } else scatter(town, thing.t, thing.scatter, thing.count, seed);
}

/** Scatter `count` of something over grass in an area, a tile clear of anything else all round. Seeded: the same every time. */
function scatter(town: LevelDef, t: string, [ax, ay, aw, ah]: [number, number, number, number], count: number, seed: number): void {
  const rng = new Rng(seed);
  const [w, h] = CATALOG[t]!.size;
  const onGrass = (x: number, y: number) => tilesIn([x, y, w, h]).every((tile) => roomAt(town, tile)?.floor === 'grass');
  const clear = (x: number, y: number) =>
    onGrass(x, y) &&
    town.furniture.every((f) => {
      const [fx, fy, fw, fh] = footprint(f);
      return x + w + 1 <= fx || fx + fw + 1 <= x || y + h + 1 <= fy || fy + fh + 1 <= y;
    });
  for (let tries = 0, n = 0; n < count && tries < count * 20; tries++) {
    const x = rng.int(ax, ax + aw - w);
    const y = rng.int(ay, ay + ah - h);
    if (!clear(x, y)) continue;
    town.furniture.push({ t, p: [x, y] });
    n++;
  }
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
