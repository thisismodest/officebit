// Upgrades (docs/UPGRADES.md): what each release adds to towns made before it, and moving older towns onto the new map.
// A saved town (or a shared link) is your design, so a new release's additions
// to the starter town wouldn't otherwise reach it. When an older town opens,
// each newer release's pieces become works (sim/works.ts): a crew comes to put
// them up, from now. A spot you've used is left alone.
import type { CalendarDate } from '../sim/calendar.ts';
import { CATALOG } from '../sim/catalog.ts';
import { footprint, overlap } from '../sim/geometry.ts';
import type { FurnitureDef, Rect, WorldDef } from '../sim/world.ts';

import { relocate } from './relocate.ts';
import { VERSION } from './version.ts';

export { VERSION };
/** Towns made before this moved onto the new map (relocate.ts). */
const MOVED = '0.5.0';
/** Towns saved before versions were recorded. */
const UNVERSIONED = '0.3.0';
/** The crew's works: a fenced patch this size where each piece goes. */
export const SITE: [w: number, h: number] = [2, 2];

interface Upgrade {
  version: string;
  /** Where each piece goes: a level of the starter town, and the furniture. */
  add: { level: string; furniture: FurnitureDef }[];
}

/** Oldest first, since the move (older towns get the new map, and everything on it). Anything new in the starter town goes here too. */
export const UPGRADES: Upgrade[] = [
  // Three parcel vans: two more loading bays in the depot yard, beside the first (each gets a van, which drives in).
  {
    version: '0.5.1',
    add: [
      { level: 'town', furniture: { t: 'loadingBay', p: [102, 18] } },
      { level: 'town', furniture: { t: 'loadingBay', p: [104, 18] } },
    ],
  },
];

/**
 * Bring a town made before this release up to date, in place: one from before the move goes onto the new map; then each
 * newer release's pieces become works from `now` (a date and hour), where there's room for them. Returns how many
 * changes are coming (the move counts as one).
 */
export function upgrade(world: WorldDef, now: CalendarDate & { hour: number }, releases = UPGRADES, version = VERSION): number {
  const made = world.version ?? UNVERSIONED;
  if (!newer(version, made)) return 0;
  if (newer(MOVED, made)) {
    relocate(world);
    return 1;
  }
  let coming = 0;
  world.works ??= [];
  const works = world.works;
  for (const release of releases) {
    if (!newer(release.version, made)) continue;
    for (const { level, furniture } of release.add) {
      const target = world.levels.find((l) => l.id === level);
      if (!target || !roomFor(target.furniture, target.size, furniture)) continue;
      works.push({ version: release.version, from: [now.year, now.month, now.day, now.hour], level, furniture: structuredClone(furniture) });
      coming++;
    }
  }
  world.version = version;
  return coming;
}

/** The ground a piece and its works take up: its footprint, and the fenced patch. */
export function groundOf(furniture: FurnitureDef): Rect[] {
  return [footprint(furniture), [furniture.p[0], furniture.p[1], ...SITE]];
}

/** Is there room for a piece here: on the map, and nothing of yours in the way? */
export function roomFor(placed: readonly FurnitureDef[], [w, h]: [number, number], furniture: FurnitureDef): boolean {
  if (!CATALOG[furniture.t]) return false;
  const ground = groundOf(furniture);
  const onMap = ground.every(([x, y, gw, gh]) => x >= 0 && y >= 0 && x + gw <= w && y + gh <= h);
  return onMap && !placed.some((f) => ground.some((g) => overlap(footprint(f), g)));
}

/** Is version `a` newer than `b` (semver, major.minor.patch)? */
export function newer(a: string, b: string): boolean {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((pa![i] ?? 0) !== (pb![i] ?? 0)) return (pa![i] ?? 0) > (pb![i] ?? 0);
  return false;
}
