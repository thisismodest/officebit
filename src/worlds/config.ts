// A town as plain data (docs/WORLD.md#town-configs): the map, its buildings and what's inside them, and who lives there.
// worlds/build.ts turns one into a world; worlds/starter.config.ts is the starter town.
import type { CompanyDef, DepartmentDef, FurnitureDef, LevelKind, NpcDef, PersonDef, Rect, RoomDef, Tile } from '../sim/world.ts';
import type { HomeStyle } from './homes.ts';

export interface TownConfig {
  name: string;
  seed: number;
  /** The town map: its size, and where the camera starts. */
  size: [w: number, h: number];
  view: Tile;
  /** Where newcomers and crews walk in (the edge of town). */
  spawn: Tile;
  /** Ground, laid in order over the grass: the highway, water, parks, forecourts… (later ones on top). */
  areas: Area[];
  /** Roads by name; pavements are worked out from them, and a road over water is bridged. */
  roads: { name: string; rects: Rect[] }[];
  /** Zebra crossings: `zebra` across a road running east–west, `zebraSide` one running north–south. */
  crossings: { floor: 'zebra' | 'zebraSide'; rect: Rect }[];
  /** Footpaths (beyond the ones worked out from each door to its street). */
  paths: Rect[];
  /** Buildings you can go in, and what's inside. */
  buildings: Building[];
  /** Homes, in the order they're handed out (see `people`): a row of houses, or one, perhaps someone's in particular. */
  homes: HomeRow[];
  /** Empty lots, where new companies build their offices. */
  lots: Placed[];
  /** Everything else on the map: furniture singly or in rows, and things scattered over grass. */
  things: Thing[];
  /** Floors of buildings that are the town's own (the head office), by level id: rooms, doors and furniture as data. */
  floors: Record<string, Floor>;
  companies: CompanyDef[];
  departments: DepartmentDef[];
  /**
   * The team (each gets a home: families first, then by who they are, see build.ts), and everyone else: family and
   * pets (`home` is whose household they're in), staff, children, residents. Those with `own: true` get a home of their own.
   */
  people: Omit<PersonDef, 'home'>[];
  npcs: (Omit<NpcDef, 'home'> & { home?: string; own?: boolean })[];
}

export interface Area {
  name: string;
  floor: string;
  rects: Rect[];
  /** A park: friends play catch and picnic here. */
  park?: boolean;
  /** The town square: where the town gets together (the Christmas tree, the bonfire). */
  square?: boolean;
}

/** A building's top-left, the way it faces (its door below it, or above with `up`), and where along it the door is. */
export interface Placed {
  at: Tile;
  faces?: 'up';
  /** Tiles in from the left of the door (default 1). */
  door?: number;
}

export interface Building extends Placed {
  /** Level id of the inside (its ground floor). */
  id: string;
  /** Catalog type of the building on the map. */
  t: string;
  label: string;
  /** A template from build.ts (diner, shop, school, clubhouse, leisure) or the town's own floors (the first is the way in). */
  inside: { template: string } | { floors: string[]; entry: Tile; stairs?: Tile };
}

export interface HomeRow extends Placed {
  t: HomeStyle | 'narrowboat';
  /** How many side by side, and the gap between them (tiles). */
  count?: number;
  gap?: number;
  /** Whose it is (a narrowboat always has someone); otherwise handed out, or to let. */
  owner?: string;
}

export type Thing =
  | FurnitureDef
  | { t: string; row: number[]; y: number }
  | { t: string; column: number[]; x: number }
  /** Along a line every `step` tiles, from `from` to `to` (inclusive), skipping the gaps. */
  | { t: string; from: Tile; to: Tile; step: number; gaps?: Rect[] }
  /** Scattered over clear grass in an area, never touching anything else. */
  | { t: string; scatter: Rect; count: number };

export interface Floor {
  name: string;
  kind: LevelKind;
  size: [w: number, h: number];
  rooms: RoomDef[];
  doors: Tile[];
  /** Furniture, and rows of desks: each department's stations, handed to its people in order. */
  furniture: (FurnitureDef | { desks: string; at: Tile[] })[];
}
