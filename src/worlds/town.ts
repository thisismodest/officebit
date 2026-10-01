// The starter town (docs/BUILDINGS.md#the-starter-town): 160×160 tiles, laid
// out by hand in districts rather than a grid, with countryside all round.
// From north to south:
//
//   The highway — through-traffic, and a slip road down into town (traffic.ts).
//   High Street — empty lots waiting for new companies; Mill Lane runs down
//                 past the woods to…
//   Main Street — the one road right across town (the food trucks use it):
//                 the Green with its pond, the head office, the diner, the
//                 shop, the charging station, more lots, and a terrace facing them.
//   The Avenue  — south from Main Street to the homes: Acacia Road (terraces
//                 and semis), Birch Close (detached houses round a turning
//                 circle), Acacia Primary on School Lane, Dover Park, and
//                 Cedar Crescent, still waiting for its houses.
//
// Every building's door is on its bottom edge, except houses on the south
// side of a street, which face up (`faces: 'up'`) so they face their street.
import { Rng } from '../sim/rng.ts';
import { CATALOG } from '../sim/catalog.ts';
import { tilesIn } from '../sim/geometry.ts';
import type { FurnitureDef, Rect, Tile } from '../sim/world.ts';
import type { HomeStyle } from './homes.ts';
import { layPavements } from './ground.ts';
import { LevelBuilder } from './layout.ts';
import { roomAt } from './rooms.ts';

export const TOWN = 160;

/** Named buildings: top-left, and the tile in front of the door. */
export const OFFICE: Tile = [72, 42];
export const OFFICE_DOOR: Tile = [77, 48];
export const DINER: Tile = [88, 42];
export const DINER_DOOR: Tile = [92, 48];
export const SHOP: Tile = [100, 42];
export const SHOP_DOOR: Tile = [104, 48];
export const SCHOOL: Tile = [82, 97];
export const SCHOOL_DOOR: Tile = [87, 104];
/** Where newcomers and crews walk in: the east end of Main Street. */
export const SPAWN: Tile = [TOWN - 1, 49];

/** Billboards along the highway (docs/FURNITURE.md#spotlights), and the bus route's stops (docs/TRAFFIC.md#buses), each shelter with its poster. Older towns get them from crews (worlds/upgrades.ts). */
export const BILLBOARDS: FurnitureDef[] = [
  { t: 'billboard', p: [40, 12] },
  { t: 'billboard', p: [102, 12] },
];
export const BUS_STOPS: FurnitureDef[] = [
  { t: 'busStop', p: [28, 48], label: 'Main Street West' },
  { t: 'busStop', p: [38, 66], label: 'Acacia Road' },
  { t: 'busStop', p: [80, 48], label: 'Main Street' },
  { t: 'busStop', p: [99, 48], label: 'Corner Shop' },
  { t: 'busStop', p: [79, 73], label: 'The Avenue' },
  { t: 'busStop', p: [98, 84], label: 'Birch Close' },
  { t: 'busStop', p: [55, 96], label: 'Cedar Crescent' },
  { t: 'busStop', p: [89, 104], label: 'Acacia Primary' },
];

/** The river along the bottom of town, from one edge to the other. */
export const RIVER: Rect = [0, 144, TOWN, 5];
const RIVER_NAME = 'River Dove';
/** The beach on the north bank, running down to the river: where it starts across, and how wide. */
const BEACH_X = 111;
const BEACH_W = 9;
/** The jetty: where it runs out into the river from the bank, and how far. */
export const JETTY: [x: number, length: number] = [100, 3];

/** The highway across the top of the map: two lanes each way, eastbound on the north side (we drive on the left). */
const HIGHWAY: Rect = [0, 4, TOWN, 4];

/** The charging station: a forecourt on Main Street, with bays to park in and chargers. */
export const CHARGING: Tile = [114, 42];

/** Empty lots (9×6), where new companies build their offices, dotted round town. Each door opens onto a pavement. */
const LOTS: Tile[] = [
  [42, 20], [74, 20], [104, 20], [128, 20], [146, 20], // High Street
  [4, 42], [126, 42], [146, 42], // Main Street
  [56, 60], // Acacia Road
  [46, 90], [60, 90], // Cedar Crescent
  [108, 98], // School Lane
];


/** Somewhere a house can stand, and how its front door meets the pavement. */
export interface Plot {
  t: HomeStyle;
  x: number;
  y: number;
  faces?: 'up';
  door: Tile;
  /** The front path, from the door to the pavement. */
  path: Rect;
}

/** A house on the north side of a street, facing down onto the pavement at `pavement`, `setback` tiles back. */
function facingDown(t: HomeStyle, x: number, pavement: number, setback = 0): Plot {
  const door: Tile = [x + 1, pavement - 1 - setback];
  return { t, x, y: door[1] - 3, door, path: [door[0], door[1], 1, setback + 1] };
}

/** A house on the south side of a street, facing up to the pavement at `pavement`. */
function facingUp(t: HomeStyle, x: number, pavement: number, setback = 0): Plot {
  const door: Tile = [x + 1, pavement + 1 + setback];
  return { t, x, y: door[1] + 1, faces: 'up', door, path: [door[0], pavement + 1, 1, setback + 1] };
}

const widthOf = (t: HomeStyle) => CATALOG[t]!.size[0];
/** Plots side by side along a street, `gap` tiles apart. */
const along = (t: HomeStyle, from: number, count: number, gap: number, plot: (t: HomeStyle, x: number) => Plot) =>
  Array.from({ length: count }, (_, i) => plot(t, from + i * (widthOf(t) + gap)));

/** Every house plot in town, by size. More than the starter town needs, so people can move and newcomers can settle. */
export const PLOTS: Record<HomeStyle, Plot[]> = {
  // Detached family homes on Birch Close, near the school, staggered either side.
  detached: [
    facingDown('detached', 86, 85, 1),
    facingUp('detached', 82, 88, 1),
    facingDown('detached', 102, 85, 2),
    facingUp('detached', 110, 88, 1),
    facingUp('detached', 96, 88, 1),
    facingDown('detached', 112, 85, 1),
  ],
  // Semis on Acacia Road, and the first few on Cedar Crescent.
  house: [
    ...along('house', 42, 2, 2, (t, x) => facingDown(t, x, 67, 1)),
    ...along('house', 28, 4, 6, (t, x) => facingUp(t, x, 70, 1)),
    facingDown('house', 70, 97, 1),
    ...along('house', 46, 3, 4, (t, x) => facingUp(t, x, 100, 1)),
  ],
  // The old terraces facing Main Street, and a short row on Acacia Road.
  terrace: [
    ...along('terrace', 20, 9, 0, (t, x) => facingUp(t, x, 52)),
    ...along('terrace', 26, 4, 0, (t, x) => facingDown(t, x, 67, 1)),
  ],
};

/**
 * Zebra crossings: where a pavement meets a side road, and at a few busy spots.
 * `zebra` crosses a road running east–west; `zebraSide` one running north–south.
 */
const CROSSINGS: [floor: 'zebra' | 'zebraSide', rect: Rect][] = [
  // Side-road mouths, continuing the pavement across.
  ['zebraSide', [90, 27, 2, 1]],
  ['zebraSide', [36, 49, 2, 1]],
  ['zebraSide', [36, 30, 2, 1]],
  ['zebraSide', [76, 52, 2, 1]],
  ['zebra', [75, 68, 1, 2]],
  ['zebra', [75, 98, 1, 2]],
  ['zebra', [75, 116, 1, 2]],
  ['zebra', [78, 86, 1, 2]],
  ['zebra', [78, 106, 1, 2]],
  // Busy spots: the Green, the office, the shop, halfway down the Avenue, the school gate.
  ['zebra', [53, 50, 2, 2]],
  ['zebra', [77, 50, 2, 2]],
  ['zebra', [104, 50, 2, 2]],
  ['zebraSide', [76, 76, 2, 2]],
  ['zebra', [87, 106, 2, 2]],
];

/**
 * Scatter `count` of something over grass in an area, never touching other
 * furniture (a tile's gap all round). Seeded, so the town is the same every time.
 */
function scatter(b: LevelBuilder, t: string, [ax, ay, aw, ah]: Rect, count: number, seed: number): void {
  const rng = new Rng(seed);
  const level = b.build();
  const placed = level.furniture;
  const [w, h] = CATALOG[t]!.size;
  const onGrass = (x: number, y: number) => tilesIn([x, y, w, h]).every((tile) => roomAt(level, tile)?.floor === 'grass');
  const clear = (x: number, y: number) =>
    onGrass(x, y) &&
    placed.every((f: FurnitureDef) => {
      const [fw, fh] = CATALOG[f.t]!.size;
      return x + w + 1 <= f.p[0] || f.p[0] + fw + 1 <= x || y + h + 1 <= f.p[1] || f.p[1] + fh + 1 <= y;
    });
  for (let tries = 0, n = 0; n < count && tries < count * 20; tries++) {
    const x = rng.int(ax, ax + aw - w);
    const y = rng.int(ay, ay + ah - h);
    if (!clear(x, y)) continue;
    b.put(t, x, y);
    n++;
  }
}

/** A house to build on a plot: someone's, or empty and to let. */
export interface Resident {
  plot: Plot;
  owner?: string;
}

/** The town: streets, buildings, lots, parks, everyone's house, then trees round them all. */
export function buildTown(residents: Resident[]): LevelBuilder {
  const b = new LevelBuilder('town', 'Town', 'outside', TOWN, TOWN).room('town', 'Town', [0, 0, TOWN, TOWN], 'grass').lookAt(OFFICE_DOOR);

  // The highway: no pavements, nobody on foot. The slip road joins it to High Street.
  b.room('highway', 'The highway', HIGHWAY, 'highway');

  // Streets (Birch Close ends in a turning circle round a little island), then their pavements and crossings.
  const roads: [id: string, name: string, rect: Rect][] = [
    ['slip-road', 'Slip road', [90, 8, 2, 20]],
    ['main-street', 'Main Street', [0, 50, TOWN, 2]],
    ['high-street', 'High Street', [36, 28, TOWN - 36, 2]],
    ['mill-lane', 'Mill Lane', [36, 30, 2, 20]],
    ['avenue', 'The Avenue', [76, 52, 2, 85]],
    ['acacia', 'Acacia Road', [24, 68, 52, 2]],
    ['birch', 'Birch Close', [78, 86, 44, 2]],
    ['birch-circle', 'Birch Close', [122, 82, 8, 3]],
    ['birch-circle-east', 'Birch Close', [127, 85, 3, 4]],
    ['birch-circle-west', 'Birch Close', [122, 85, 3, 4]],
    ['birch-circle-south', 'Birch Close', [122, 89, 8, 3]],
    ['school-lane', 'School Lane', [78, 106, 40, 2]],
    ['cedar', 'Cedar Crescent', [40, 98, 36, 2]],
    ['cedar-bend', 'Cedar Crescent', [40, 100, 2, 16]],
    ['cedar-end', 'Cedar Crescent', [40, 116, 36, 2]],
  ];
  for (const [id, name, rect] of roads) b.room(id, name, rect, 'road');
  layPavements(b.build());
  for (const [i, [floor, rect]] of CROSSINGS.entries()) b.room(`crossing-${i}`, 'Zebra crossing', rect, floor);

  // Main Street: the Green, the office, the diner and the shop.
  b.room('green', 'The Green', [40, 33, 28, 14], 'grass', { park: true })
    .room('green-path', 'Path', [40, 40, 28, 1], 'path')
    .room('green-cut', 'Path', [53, 33, 1, 16], 'path')
    .put('pond', 57, 34)
    // The food trucks' pitches, at the pavement's edge: they pull up off the road, and serve onto the pavement.
    .named('foodTruck', 41, 47, 'Taco truck')
    .named('foodTruck', 48, 47, 'Noodle van')
    .named('foodTruck', 60, 47, 'Pizza van')
    .row('bench', [49, 55], 38)
    .row('bench', [46, 56], 42)
    .row('flowers', [41, 44, 51, 55, 64], 39)
    .row('lamppost', [52, 54], 41)
    .named('officeBuilding', ...OFFICE, 'Head office')
    .room('office-path', 'Path', [OFFICE_DOOR[0], OFFICE_DOOR[1], 2, 1], 'path')
    .named('diner', ...DINER, 'The Night Owl Diner')
    .room('diner-path', 'Path', [DINER_DOOR[0], DINER_DOOR[1], 1, 1], 'path')
    .named('supermarket', ...SHOP, 'Corner Shop')
    .room('shop-path', 'Path', [SHOP_DOOR[0], SHOP_DOOR[1], 1, 1], 'path')
    .row('lamppost', [22, 34, 46, 70, 86, 98, 112, 124, 136], 48)
    .row('lamppost', [44, 60, 74, 88, 102, 116, 130], 26);
  for (const f of [...BILLBOARDS, ...BUS_STOPS]) {
    if (f.label) b.named(f.t, ...f.p, f.label);
    else b.put(f.t, ...f.p);
  }
  for (const [x, y] of LOTS) b.put('lot', x, y);
  chargingStation(b, CHARGING);

  // The Avenue's homes, the school and the park.
  b.named('school', ...SCHOOL, 'Acacia Primary')
    .room('school-path', 'Path', [SCHOOL_DOOR[0], SCHOOL_DOOR[1], 1, 1], 'path')
    .room('playing-field', 'Playing field', [95, 96, 12, 8], 'grass')
    .room('park', 'Dover Park', [80, 110, 60, 30], 'grass')
    .room('park-path', 'Path', [80, 120, 60, 1], 'path')
    .room('park-cut', 'Path', [108, 109, 1, 31], 'path')
    // The river along the bottom of town, edge to edge, and a footbridge carrying the park's path over it.
    .room('river', RIVER_NAME, RIVER, 'water')
    .room('park-cut-river', 'Path', [108, 140, 1, RIVER[1] - 140], 'path')
    .room('footbridge', 'Footbridge', [108, RIVER[1], 1, RIVER[3]], 'bridge')
    .room('south-bank-path', 'Path', [108, RIVER[1] + RIVER[3], 1, 3], 'path')
    // The beach just east of the footbridge, and the shallows in front of it for a swim on summer days.
    .room('beach', 'The beach', [BEACH_X, RIVER[1] - 3, BEACH_W, 3], 'sand')
    .room('shallows', 'The shallows', [BEACH_X, RIVER[1], BEACH_W, 2], 'shallows')
    .put('lifebuoy', BEACH_X + 4, RIVER[1] - 2)
    // The moorings, west of the footbridge: the boating club on the bank, a path along it, a jetty out into the river with
    // two sailing boats tied up, and the club's rowing boats (kept inside, till someone takes one out).
    .room('bank-path', 'Path', [JETTY[0] - 10, RIVER[1] - 1, 108 - (JETTY[0] - 10), 1], 'path')
    .room('jetty', 'Jetty', [JETTY[0], RIVER[1], 1, JETTY[1]], 'jetty')
    .put('boathouse', JETTY[0] - 8, RIVER[1] - 4)
    .put('sailboat', JETTY[0] + 1, RIVER[1])
    .put('sailboat', JETTY[0] + 1, RIVER[1] + 2)
    .put('rowboat', JETTY[0] - 7, RIVER[1])
    .put('rowboat', JETTY[0] - 4, RIVER[1])
    .put('pond', 96, 113)
    .put('pond', 122, 126)
    .row('bench', [86, 104, 116, 130], 119)
    .row('lamppost', [74, 79], 61)
    .row('lamppost', [74, 79], 78)
    .row('lamppost', [74, 79], 96)
    .row('lamppost', [74, 79], 120)
    .row('lamppost', [38, 60], 71)
    .row('lamppost', [88, 106], 84)
    .row('bush', [24, 34, 44, 54, 64, 67], 74)
    .row('flowers', [26, 36, 46, 56, 66], 73)
    .put('tree', 125, 86);
  for (const x of [21, 24, 27, 30, 33, 36, 39, 42, 45]) b.put('flowers', x, 58);
  for (const [i, { plot, owner }] of residents.entries()) addHouse(b, plot, owner, i);

  // Trees: the woods west of Mill Lane, and plenty everywhere else.
  scatter(b, 'tree', [16, 16, 18, 32], 26, 1);
  scatter(b, 'tree', [39, 31, 30, 8], 6, 2);
  scatter(b, 'tree', [38, 31, 106, 9], 10, 3);
  scatter(b, 'tree', [112, 54, 30, 26], 10, 4);
  scatter(b, 'tree', [16, 76, 58, 20], 10, 5);
  scatter(b, 'tree', [44, 102, 30, 12], 6, 6);
  scatter(b, 'tree', [16, 120, 58, 24], 12, 7);
  scatter(b, 'tree', [80, 110, 60, 30], 18, 8);
  scatter(b, 'bush', [80, 54, 60, 22], 8, 9);

  // The countryside round town: hedges along the highway, woods and scrub to the edges.
  for (let x = 1; x < TOWN; x += 2) {
    b.put('bush', x, HIGHWAY[1] - 2);
    if (x < 88 || x > 93) b.put('bush', x, HIGHWAY[1] + HIGHWAY[3] + 1);
  }
  scatter(b, 'tree', [0, 10, TOWN, 6], 24, 10);
  scatter(b, 'tree', [0, 16, 16, 26], 8, 11);
  scatter(b, 'tree', [0, 54, 16, 106], 22, 12);
  scatter(b, 'tree', [144, 54, 16, 106], 22, 13);
  scatter(b, 'tree', [16, 140, 128, 20], 30, 14);
  scatter(b, 'bush', [0, 54, TOWN, 106], 30, 15);
  return b;
}

/** A forecourt off Main Street, right by the road: a canopy over two bays to park in and two with chargers, and a short drive in. Cars back out. */
function chargingStation(b: LevelBuilder, [x, y]: Tile): void {
  const top = y + 3;
  b.room('charging-station', 'Charging station', [x, top, 9, 5], 'forecourt')
    .put('chargingCanopy', x, top)
    .row('evCharger', [x + 5, x + 7], top + 1)
    .row('parkingBay', [x + 1, x + 3], top + 2)
    .row('chargingBay', [x + 5, x + 7], top + 2)
    // A bench to wait on, clear of the lamppost by the pavement.
    .put('bench', x + 10, top - 1);
}

/** A house on its plot, with its front path; every third has flowers by the door. */
function addHouse(b: LevelBuilder, plot: Plot, owner: string | undefined, index: number): void {
  const house: FurnitureDef = { t: plot.t, p: [plot.x, plot.y] };
  if (owner) house.owner = owner;
  if (plot.faces) house.faces = plot.faces;
  b.item(house).room(`path-${plot.x}-${plot.y}`, 'Path', plot.path, 'path');
  if (index % 3 === 0 && plot.t !== 'terrace') b.put('flowers', plot.door[0] + 1, plot.door[1]);
}
