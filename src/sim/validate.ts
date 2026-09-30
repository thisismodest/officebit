// Sanity checks for a world (docs/WORLD.md#validation): broken references,
// furniture in walls, spots nobody can reach, levels cut off from the rest.
// Returns human-readable problems; an empty list means the world is sound.
import { CATALOG } from './catalog.ts';
import { endsOn, sides } from './geometry.ts';
import { Grid } from './grid.ts';
import type { LevelDef, Place, Tile, WorldDef } from './world.ts';

export function validate(world: WorldDef): string[] {
  const problems: string[] = [];
  const levels = new Map(world.levels.map((level) => [level.id, level]));
  const grids = new Map(world.levels.map((level) => [level.id, new Grid(level)]));

  duplicates('level', world.levels.map((l) => l.id), problems);
  duplicates('room', world.levels.flatMap((l) => l.rooms.map((r) => r.id)), problems);
  duplicates('person', [...world.people, ...world.npcs].map((p) => p.id), problems);
  duplicates('department', world.departments.map((d) => d.id), problems);
  duplicates('company', world.companies.map((c) => c.id), problems);

  for (const company of world.companies) {
    for (const id of company.levels) {
      if (!['building', 'venue', 'school'].includes(levels.get(id)?.kind ?? '')) problems.push(`${company.name}: "${id}" isn't an office, venue or school`);
    }
  }
  const companies = new Set(world.companies.map((c) => c.id));
  const depts = new Set(world.departments.map((d) => d.id));
  const isHome = (id: string | undefined) => levels.get(id ?? '')?.kind === 'home';
  for (const p of world.people) {
    if (p.dept && !depts.has(p.dept)) problems.push(`${p.name}: unknown department "${p.dept}"`);
    if (p.company && !companies.has(p.company)) problems.push(`${p.name}: unknown company "${p.company}"`);
    if (p.home && !isHome(p.home)) problems.push(`${p.name}: home "${p.home}" isn't a home level`);
  }
  for (const npc of world.npcs) {
    if (npc.role === 'crew' || npc.role === 'courier') continue;
    if (!isHome(npc.home)) problems.push(`${npc.name}: home "${npc.home}" isn't a home level`);
    const works = levels.get(npc.works ?? '')?.kind;
    if (npc.role === 'staff' && works !== 'venue' && works !== 'school') problems.push(`${npc.name}: works at "${npc.works}", which isn't a venue or school`);
    if (npc.role === 'child' && works !== 'school') problems.push(`${npc.name}: goes to "${npc.works}", which isn't a school`);
  }

  const walkable = (place: Place) => grids.get(place.level)?.walkable(place.p[0], place.p[1]) ?? false;
  const label = (place: Place) => `${place.level} ${place.p.join(',')}`;
  for (const portal of world.portals) {
    for (const end of [portal.a, portal.b]) if (!walkable(end)) problems.push(`${portal.kind} at ${label(end)} isn't walkable`);
  }
  if (!walkable(world.spawn)) problems.push(`spawn at ${label(world.spawn)} isn't walkable`);

  for (const level of world.levels) {
    const grid = grids.get(level.id)!;
    const entrances = endsOn(world.portals, level.id);
    const reached = flood(grid, entrances.map((end) => end.p));
    checkFurniture(level, grid, reached, problems);
    if (level.floorOf && !levels.has(level.floorOf)) problems.push(`${level.name}: a floor of "${level.floorOf}", which doesn't exist`);
    // A home needs a bed somewhere in it (upstairs will do).
    const floors = [level, ...world.levels.filter((l) => l.floorOf === level.id)];
    if (level.kind === 'home' && !level.floorOf && !floors.some((l) => l.furniture.some((f) => CATALOG[f.t]?.bed))) problems.push(`${level.name}: no bed`);
  }

  for (const id of unreachableLevels(world)) problems.push(`${levels.get(id)!.name}: no doors or stairs lead here`);
  return problems;
}

function checkFurniture(level: LevelDef, grid: Grid, reached: Set<number>, problems: string[]): void {
  const solid = new Map<number, string>();
  for (const item of level.furniture) {
    const type = CATALOG[item.t];
    const where = `${level.name}: ${item.t} at ${item.p.join(',')}`;
    if (!type) {
      problems.push(`${where} isn't a known furniture type`);
      continue;
    }
    const [w, h] = type.size;
    const footprint: Tile[] = [];
    for (let y = item.p[1]; y < item.p[1] + h; y++) for (let x = item.p[0]; x < item.p[0] + w; x++) footprint.push([x, y]);
    if (footprint.some(([x, y]) => !grid.inBounds(x, y))) {
      problems.push(`${where} is off the edge`);
      continue;
    }
    for (const [x, y] of footprint) {
      const i = grid.i(x, y);
      if (grid.wall[i]) problems.push(`${where} is in a wall`);
      if (!type.solid) continue;
      const other = solid.get(i);
      if (other) problems.push(`${where} overlaps ${other}`);
      solid.set(i, item.t);
    }
    const spots = type.spots.map(([dx, dy]): Tile => [item.p[0] + dx, item.p[1] + dy]);
    if (spots.length > 0 && !spots.some(([x, y]) => grid.walkable(x, y) && reached.has(grid.i(x, y)))) {
      problems.push(`${where} can't be reached`);
    }
  }
}

/** Every walkable tile reachable from any of `starts`. */
function flood(grid: Grid, starts: Tile[]): Set<number> {
  const seen = new Set<number>();
  const queue = starts.filter(([x, y]) => grid.walkable(x, y)).map(([x, y]) => grid.i(x, y));
  for (const i of queue) seen.add(i);
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % grid.w;
    const y = (i - x) / grid.w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (!grid.walkable(nx, ny) || seen.has(grid.i(nx, ny))) continue;
      seen.add(grid.i(nx, ny));
      queue.push(grid.i(nx, ny));
    }
  }
  return seen;
}

/** Levels you can't get to from the spawn point through portals. */
function unreachableLevels(world: WorldDef): string[] {
  const seen = new Set([world.spawn.level]);
  const queue = [world.spawn.level];
  while (queue.length > 0) {
    const level = queue.pop()!;
    for (const portal of world.portals) {
      for (const [from, to] of sides(portal)) {
        if (from.level === level && !seen.has(to.level)) {
          seen.add(to.level);
          queue.push(to.level);
        }
      }
    }
  }
  return world.levels.map((l) => l.id).filter((id) => !seen.has(id));
}

function duplicates(kind: string, ids: string[], problems: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`duplicate ${kind} id "${id}"`);
    seen.add(id);
  }
}
