// The shareable world definition (docs/WORLD.md). Everything here must stay
// small and JSON-serialisable: it ends up compressed into a URL.
import type { Traits } from './personality.ts';

export type Tile = [x: number, y: number];
export type Rect = [x: number, y: number, w: number, h: number];

/** A tile on a particular level. */
export interface Place {
  level: string;
  p: Tile;
}

/** outside: the town · building: office floors · home: someone's home · venue: a public place anyone awake can visit · school: for its pupils and teachers. */
export type LevelKind = 'outside' | 'building' | 'home' | 'venue' | 'school';

export interface WorldDef {
  v: 2;
  name: string;
  seed: number;
  /** Employers. Each has office floors; the first is where people work by default. */
  companies: CompanyDef[];
  departments: DepartmentDef[];
  levels: LevelDef[];
  /** Doors and stairs joining levels. */
  portals: PortalDef[];
  /** Where people without a home arrive and leave. */
  spawn: Place;
  /** Set to false for a world where nobody falls in love (one modelling real colleagues, say). */
  love?: boolean;
  people: PersonDef[];
  /** Everyone who isn't on the team: family, pets, staff, crews, children, couriers, visitors (roles.ts). Not listed as people. */
  npcs: NpcDef[];
  /** Meals' worth of ingredients in each home's kitchen, by home level id. Missing means stocked. */
  pantries?: Record<string, number>;
  /** Maps external feed ids (a Slack user id, an agent name…) to person ids. */
  feed?: { ids?: Record<string, string> };
  /** Your changes to places the story builds (a startup's office), by level id: used whenever the story builds that place, at that size. */
  overrides?: Record<string, LevelOverride>;
  /** The officebit version it was made with, or last brought up to date to (docs/UPGRADES.md). Missing: before 0.4. */
  version?: string;
  /** What newer releases add to a town made before them, for crews to put up (docs/UPGRADES.md). */
  works?: WorksDef[];
}

/** A piece a release adds to an older town: a crew comes to put it up from this moment (the hour the town was opened), or the story's start, if later. */
export interface WorksDef {
  version: string;
  from: [year: number, month: number, day: number, hour: number];
  level: string;
  furniture: FurnitureDef;
}

/** A place the story builds, as you arranged it: its furniture, for a layout of this size (a bigger office is a new layout, and starts from its own). */
export interface LevelOverride {
  size: [w: number, h: number];
  furniture: FurnitureDef[];
  /** Its rooms and doorways, if you changed its walls. */
  rooms?: RoomDef[];
  doors?: Tile[];
}

export interface LevelDef {
  id: string;
  name: string;
  kind: LevelKind;
  size: [w: number, h: number];
  rooms: RoomDef[];
  doors: Tile[];
  furniture: FurnitureDef[];
  /** Where the camera starts when you look at this level (defaults to the middle). */
  view?: Tile;
  /** An upper floor you added (in the editor), of the building whose ground floor is this level: part of that home, or that company's office. */
  floorOf?: string;
}

export interface RoomDef {
  /** Unique across the whole world (feeds address rooms by id). */
  id: string;
  name: string;
  rect: Rect;
  /** Floor style key, see render/palette.ts FLOORS. */
  floor: string;
  /** Draw walls around the rect's edge (minus doors). */
  walled?: boolean;
  dept?: string;
  /** A park: open grass where friends play catch or have a picnic (docs/PLANS.md). */
  park?: boolean;
  /** The town square (the Green): where the town gets together, round the Christmas tree or the bonfire. */
  square?: boolean;
}

export interface FurnitureDef {
  /** Catalog id, e.g. "computerDesk", "coffee". */
  t: string;
  p: Tile;
  /** Person id, for workstations, beds and houses. */
  owner?: string;
  /** Display name, for buildings on a map ("Head office"). */
  label?: string;
  /** How far along a construction site is, 0–1. */
  progress?: number;
  /** Buildings: `up` puts the front door on the row above the footprint rather than below. */
  faces?: 'up';
}

export interface PortalDef {
  kind: 'door' | 'stairs';
  a: Place;
  b: Place;
}

export interface CompanyDef {
  id: string;
  name: string;
  /** Shown beside it in the panel: an icon name (`office`, `cart`, `rocket`… see ui/icons.ts), or any short text. */
  icon?: string;
  /** Hires anyone looking for work, no questions asked (the shop). Other companies only rehire their own. */
  walkIn?: boolean;
  /** Its office floors (level ids). */
  levels: string[];
}

export interface DepartmentDef {
  id: string;
  name: string;
  color: string;
  /** Default workstation (catalog id) for the team's desks. */
  station: string;
}

/**
 * Palette indices. Humans: [skin, hair, shirt, hairstyle (0 short · 1 long · 2 bun)].
 * Pets: [fur].
 */
export type Look = number[];

export interface PersonDef {
  id: string;
  name: string;
  look: Look;
  /** Employer id; defaults to the world's first company. '' for someone out of work. */
  company?: string;
  dept?: string;
  /** Preset name; `traits` overrides individual values. */
  preset?: string;
  traits?: Partial<Traits>;
  /** Id of their home level. */
  home?: string;
  /** A shift they work every day, weekends too (the shop), instead of office hours from their traits. */
  shift?: [start: number, end: number];
  /** False keeps them out of love stories (see docs/LOVE.md). */
  romance?: boolean;
  /** Their birthday, [month, day]; worked out from their id if not given (see docs/PEOPLE.md#birthdays). */
  birthday?: [month: number, day: number];
}

export type Species = 'human' | 'cat' | 'dog';

export type NpcRole = 'staff' | 'crew' | 'child' | 'courier' | 'visitor' | 'resident';

export interface NpcDef {
  id: string;
  name: string;
  species: Species;
  look: Look;
  /** Their birthday, [month, day]; worked out from their id if not given. */
  birthday?: [month: number, day: number];
  /** Id of the home level they live in (crews have none). */
  home: string;
  /** Preset name; `traits` overrides individual values. Humans only; pets have their own. */
  preset?: string;
  traits?: Partial<Traits>;
  /** Staff run a venue (or teach) in shifts; crews come to town to build, then leave; children go to school. Riders and visitors pass through (the sim adds them). */
  role?: NpcRole;
  /** Staff: the venue or school they work at, and their shift hours (may wrap past midnight). Children: their school. */
  works?: string;
  shift?: [start: number, end: number];
  /** False keeps them out of love stories. */
  romance?: boolean;
}
