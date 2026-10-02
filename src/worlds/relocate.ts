// Moving a town made before 0.5 onto the new map (docs/UPGRADES.md#the-move): its people, its families and pets, and
// the insides of its buildings and homes all come; the town map itself is the new one, and everyone's home is on a
// plot of the same size if there's one (the rest are to let). New places on the map (the leisure centre) come with
// whoever works there.
import { CATALOG } from '../sim/catalog.ts';
import { doorOf } from '../sim/geometry.ts';
import type { FurnitureDef, LevelDef, PortalDef, WorldDef } from '../sim/world.ts';
import { buildToLet, type HomeStyle } from './homes.ts';
import { STARTER } from './starter.ts';
import { VERSION } from './version.ts';

const HOMES = new Set(['terrace', 'house', 'detached', 'narrowboat']);

/** Move `world` onto the new map, in place. */
export function relocate(world: WorldDef): void {
  const fresh = structuredClone(STARTER);
  const oldTown = world.levels.find((l) => l.kind === 'outside');
  const town = fresh.levels.find((l) => l.kind === 'outside')!;
  if (!oldTown) return;
  const oldLevels = new Map(world.levels.map((l) => [l.id, l]));
  const freshLevels = new Map(fresh.levels.map((l) => [l.id, l]));

  // Each old door from the town: the building it's in, and where it leads.
  const oldDoors = world.portals.flatMap((portal) => {
    const [out, inside] = portal.a.level === oldTown.id ? [portal.a, portal.b] : portal.b.level === oldTown.id ? [portal.b, portal.a] : [null, null];
    if (!out || !inside || portal.kind !== 'door') return [];
    const building = oldTown.furniture.find((f) => CATALOG[f.t] && sameTile(doorOf(f), out.p)) ?? oldTown.furniture.find((f) => covers(f, out.p));
    return [{ inside, building }];
  });

  // Places on the new map that the town already had (the office, the diner…) keep their insides; new ones come as they are,
  // with their company and staff.
  const portals: PortalDef[] = [];
  const levels: LevelDef[] = [town];
  for (const portal of fresh.portals) {
    const inside = portal.a.level === town.id ? portal.b : portal.a;
    const level = freshLevels.get(inside.level)!;
    if (portal.kind !== 'door' || level.kind === 'home') continue;
    const kept = oldLevels.get(level.id);
    const was = oldDoors.find((d) => d.inside.level === level.id);
    portals.push({ kind: 'door', a: portal.a.level === town.id ? portal.a : portal.b, b: kept && was ? was.inside : inside });
    levels.push(kept ?? level);
    if (!kept) adopt(world, fresh, level.id);
  }
  // Stairs and upper floors inside buildings stay as they were, and so do any levels behind them.
  for (const portal of world.portals) if (portal.a.level !== oldTown.id && portal.b.level !== oldTown.id) portals.push(portal);
  for (const portal of fresh.portals) {
    if (portal.a.level === town.id || portal.b.level === town.id) continue;
    if (!oldLevels.has(portal.a.level) && !oldLevels.has(portal.b.level)) portals.push(portal);
  }
  for (const level of world.levels) if (level.kind !== 'outside' && level.kind !== 'home' && !levels.includes(level) && !isHomeBehind(level, world)) levels.push(level);

  // Homes: everyone's old home on a plot of its size (or the nearest size), owned ones first; the plots left over to let.
  const plots = town.furniture.filter((f) => HOMES.has(f.t));
  for (const plot of plots) delete plot.owner;
  const homes = oldDoors
    .filter((d) => oldLevels.get(d.inside.level)?.kind === 'home')
    .map((d) => ({ level: oldLevels.get(d.inside.level)!, entry: d.inside, style: d.building?.t ?? 'house', owner: d.building?.owner }));
  // New staff's homes (from the new map) come along too.
  for (const id of new Set(world.npcs.filter((n) => !oldLevels.has(n.home) && freshLevels.has(n.home)).map((n) => n.home))) {
    const level = freshLevels.get(id)!;
    const door = fresh.portals.find((p) => p.b.level === id || p.a.level === id)!;
    const plot = town.furniture.find((f) => f.owner === undefined && sameTile(doorOf(f), (door.a.level === id ? door.b : door.a).p));
    homes.push({ level, entry: door.a.level === id ? door.a : door.b, style: plot?.t ?? 'house', owner: level.id.replace(/^home-/, '') });
  }
  const sizes = ['terrace', 'house', 'detached'];
  const nearest = (style: string) => plots.filter((p) => !p.owner && !taken.has(p)).sort((a, b) => distance(a.t, style) - distance(b.t, style))[0];
  const distance = (a: string, b: string) => (a === b ? 0 : a === 'narrowboat' || b === 'narrowboat' ? 99 : Math.abs(sizes.indexOf(a) - sizes.indexOf(b)));
  const taken = new Set<FurnitureDef>();
  const owned = [...homes].sort((a, b) => Number(!!b.owner) - Number(!!a.owner));
  for (const home of owned) {
    const plot = nearest(home.style);
    if (!plot) continue;
    taken.add(plot);
    if (home.owner) plot.owner = home.owner;
    portals.push({ kind: 'door', a: { level: town.id, p: doorOf(plot) }, b: home.entry });
    levels.push(home.level);
    // Its upper floors come too.
    for (const level of world.levels) if (level.floorOf === home.level.id) levels.push(level);
  }
  let n = Math.max(0, ...world.levels.map((l) => Number(/^home-to-let-(\d+)$/.exec(l.id)?.[1] ?? 0)));
  for (const plot of plots) {
    if (taken.has(plot)) continue;
    const home = buildToLet(plot.t as HomeStyle, ++n, n);
    portals.push({ kind: 'door', a: { level: town.id, p: doorOf(plot) }, b: { level: home.level.id, p: home.entry } });
    levels.push(home.level);
  }

  world.levels = levels;
  world.portals = portals;
  world.spawn = fresh.spawn;
  delete world.works;
  world.version = VERSION;
}

/** A new place on the map: its company and whoever works there join the town. */
function adopt(world: WorldDef, fresh: WorldDef, level: string): void {
  const company = fresh.companies.find((c) => c.levels.includes(level));
  if (company && !world.companies.some((c) => c.id === company.id)) world.companies.push(company);
  for (const npc of fresh.npcs) if (npc.works && company?.levels.includes(npc.works) && !world.npcs.some((n) => n.id === npc.id)) world.npcs.push(npc);
}

/** A level that's an upper floor of a home (it moves with the home). */
function isHomeBehind(level: LevelDef, world: WorldDef): boolean {
  return !!level.floorOf && world.levels.find((l) => l.id === level.floorOf)?.kind === 'home';
}

const sameTile = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];
const covers = (f: FurnitureDef, [x, y]: readonly number[]) => {
  const [w, h] = CATALOG[f.t]?.size ?? [1, 1];
  return x! >= f.p[0] && x! < f.p[0] + w && y! >= f.p[1] - 1 && y! <= f.p[1] + h;
};
