// The starter town, as data (docs/WORLD.md#town-configs): built into a world by build.ts. From north to south:
//
//   The highway  — through-traffic, hedged on both sides; Hill Road comes down off it into the village.
//   The airfields — West Field and East Field, either side of town, below the highway: a plane flies between them.
//   Kiln Lane    — off Hill Road: lots for new companies.
//   The Street   — the village street: terraces, the food trucks, the head office, the diner, the shop, a lot,
//                  the charging station and the leisure centre.
//   The Green    — between Green Lane and Pond Lane, with its ponds; homes on Orchard Close to the west, Acacia
//                  Primary and more homes on its south side.
//   Back Lane and Ferry Lane — round the ends of the Street, so it runs in loops (the bus never turns round in the road).
//   Mill Road    — east over the River Dove to the cottages and the edge of town (newcomers walk in this way).
//   The river    — in from the bottom left, past the moorings and the beach, up the east side and out to the right.
import type { TownConfig } from './config.ts';

/** The Street: where it runs (its top row), and the rows either side of it. */
const STREET = 68;

export const STARTER_CONFIG: TownConfig = {
  name: 'Starter town',
  seed: 20260929,
  size: [160, 160],
  view: [49, 65],
  spawn: [159, 103],

  areas: [
    { name: 'The highway', floor: 'highway', rects: [[0, 34, 160, 4]] },
    {
      name: 'River Dove',
      floor: 'water',
      rects: [[0, 146, 44, 5], [40, 142, 30, 5], [66, 138, 40, 5], [102, 132, 5, 11], [106, 114, 5, 22], [110, 110, 10, 5], [116, 92, 5, 22], [120, 92, 40, 5]],
    },
    { name: 'The Green', floor: 'grass', rects: [[43, 71, 54, 42]], park: true, square: true },
    { name: 'Playing field', floor: 'grass', rects: [[57, 120, 12, 8]] },
    { name: 'Charging station', floor: 'forecourt', rects: [[100, 63, 9, 5]] },
    // The airfields, either side of town: a runway and an apron each.
    { name: 'West Field runway', floor: 'runway', rects: [[4, 43, 32, 3]] },
    { name: 'West Field apron', floor: 'apron', rects: [[24, 46, 12, 9]] },
    { name: 'East Field runway', floor: 'runway', rects: [[124, 43, 32, 3]] },
    { name: 'East Field apron', floor: 'apron', rects: [[124, 46, 12, 9]] },
    // Car parks for the homes and the office, and driveways between the cottages.
    { name: 'Back Lane car park', floor: 'forecourt', rects: [[3, 72, 7, 10]] },
    { name: 'Office car park', floor: 'forecourt', rects: [[47, 50, 13, 6]] },
    { name: 'Green Lane car park', floor: 'forecourt', rects: [[100, 114, 6, 8]] },
    { name: 'Driveway', floor: 'forecourt', rects: [[129, 99, 2, 5], [137, 99, 2, 5], [145, 99, 2, 5], [129, 106, 2, 5], [137, 106, 2, 5], [145, 106, 2, 5]] },
    { name: 'The beach', floor: 'sand', rects: [[70, 135, 10, 3]] },
    { name: 'The shallows', floor: 'shallows', rects: [[70, 138, 10, 2]] },
    { name: 'Jetty', floor: 'jetty', rects: [[96, 138, 1, 3]] },
  ],

  roads: [
    { name: 'Hill Road', rects: [[60, 38, 2, 30]] },
    { name: 'The Street', rects: [[10, STREET, 146, 2]] },
    // Round the ends of the Street, so it runs in loops: Back Lane down to Orchard Close, Ferry Lane over the river to Mill Road.
    { name: 'Back Lane', rects: [[10, 70, 2, 24]] },
    { name: 'Ferry Lane', rects: [[154, 70, 2, 34]] },
    { name: 'Kiln Lane', rects: [[62, 52, 48, 2]] },
    { name: 'Green Lane', rects: [[40, 70, 2, 46], [40, 114, 60, 2]] },
    { name: 'Pond Lane', rects: [[98, 70, 2, 46]] },
    { name: 'Orchard Close', rects: [[10, 94, 30, 2]] },
    { name: 'Mill Road', rects: [[98, 104, 62, 2]] },
  ],

  crossings: [
    // Side-road mouths, carrying the pavement across.
    { floor: 'zebraSide', rect: [60, 67, 2, 1] },
    { floor: 'zebraSide', rect: [40, 70, 2, 1] },
    { floor: 'zebraSide', rect: [98, 70, 2, 1] },
    { floor: 'zebra', rect: [62, 52, 1, 2] },
    { floor: 'zebra', rect: [39, 94, 1, 2] },
    { floor: 'zebra', rect: [100, 104, 1, 2] },
    // Busy spots: the office, the shop, the leisure centre, the school gate.
    { floor: 'zebra', rect: [50, STREET, 2, 2] },
    { floor: 'zebra', rect: [82, STREET, 2, 2] },
    { floor: 'zebra', rect: [118, STREET, 2, 2] },
    { floor: 'zebra', rect: [50, 114, 2, 2] },
  ],

  paths: [
    // Across the Green, both ways; along the river bank by the moorings; from each airfield's gate down to the Street.
    [43, 91, 54, 1],
    [31, 55, 1, 12],
    [131, 55, 1, 12],
    [69, 71, 1, 42],
    [80, 137, 16, 1],
    [44, 141, 22, 1],
  ],

  buildings: [
    { id: 'ground', t: 'officeBuilding', label: 'Head office', at: [44, 59], door: 5, inside: { floors: ['ground', 'first'], entry: [19, 24], stairs: [19, 12] } },
    { id: 'diner', t: 'diner', label: 'The Night Owl Diner', at: [64, 59], door: 4, inside: { template: 'diner' } },
    { id: 'shop', t: 'supermarket', label: 'Corner Shop', at: [76, 59], door: 4, inside: { template: 'shop' } },
    { id: 'leisure', t: 'leisureCentre', label: 'Greenside Leisure Centre', at: [113, 59], door: 5, inside: { template: 'leisure' } },
    { id: 'school', t: 'school', label: 'Acacia Primary', at: [44, 119], faces: 'up', door: 5, inside: { template: 'school' } },
    { id: 'clubhouse', t: 'boathouse', label: 'Boating club', at: [84, 130], inside: { template: 'clubhouse' } },
  ],

  homes: [
    // Detached cottages over the river on Mill Road, for families.
    { t: 'detached', at: [124, 98], count: 4, gap: 3 },
    { t: 'detached', at: [124, 109], faces: 'up', count: 4, gap: 3 },
    // Semis facing the Street, on Orchard Close, and south of the Green.
    { t: 'house', at: [14, 73], faces: 'up', count: 4, gap: 2 },
    { t: 'house', at: [14, 99], faces: 'up', count: 4, gap: 2 },
    { t: 'house', at: [74, 119], faces: 'up', count: 4, gap: 2 },
    // The old terraces on the Street, and the row on Orchard Close.
    { t: 'terrace', at: [10, 63], count: 7 },
    { t: 'terrace', at: [13, 89], count: 8 },
    // Fen's narrowboat, moored on the river.
    { t: 'narrowboat', at: [46, 142], faces: 'up', owner: 'fen' },
  ],

  lots: [{ at: [66, 43] }, { at: [77, 43] }, { at: [88, 43] }, { at: [99, 43] }, { at: [88, 59] }, { at: [136, 59] }, { at: [101, 95] }],

  things: [
    // The food trucks' pitches beside the Street: they pull up off the road and serve onto the pavement.
    { t: 'foodTruck', p: [32, 65], label: 'Taco truck' },
    { t: 'foodTruck', p: [36, 65], label: 'Noodle van' },
    { t: 'foodTruck', p: [40, 65], label: 'Pizza van' },
    // The charging station: a canopy over two bays to park in and two with chargers.
    { t: 'chargingCanopy', p: [100, 63] },
    { t: 'evCharger', row: [105, 107], y: 64 },
    { t: 'parkingBay', row: [101, 103], y: 65 },
    { t: 'chargingBay', row: [105, 107], y: 65 },
    { t: 'bench', p: [110, 62] },
    // Parking bays: people's own cars live in the ones nearest home (docs/TRAFFIC.md#own-cars).
    { t: 'parkingBay', column: [73, 75, 77, 79], x: 4 },
    { t: 'parkingBay', column: [73, 75, 77, 79], x: 8 },
    { t: 'parkingBay', row: [48, 50, 52, 54, 56], y: 50 },
    { t: 'parkingBay', row: [48, 50, 52, 54, 56], y: 55 },
    { t: 'parkingBay', column: [115, 117, 119], x: 104 },
    { t: 'parkingBay', column: [116, 118, 120], x: 101 },
    { t: 'parkingBay', row: [129, 137, 145], y: 99 },
    { t: 'parkingBay', row: [129, 137, 145], y: 110 },
    // The airfields (docs/TRAFFIC.md#planes): the plane on its stand at West Field, a stand and a gate at each, a hangar, a windsock.
    { t: 'plane', p: [28, 48], label: 'Dove Air' },
    { t: 'stand', p: [28, 48] },
    { t: 'gate', p: [30, 53], label: 'West Field' },
    { t: 'hangar', p: [8, 48] },
    { t: 'windsock', p: [2, 41] },
    { t: 'stand', p: [128, 48] },
    { t: 'gate', p: [130, 53], label: 'East Field' },
    { t: 'hangar', p: [144, 48] },
    { t: 'windsock', p: [157, 41] },
    // Bus stops (docs/TRAFFIC.md#buses) and billboards by the highway, each showing a spotlight.
    { t: 'busStop', p: [56, 66], label: 'Head office' },
    { t: 'busStop', p: [35, 71], label: 'The Street West' },
    { t: 'busStop', p: [84, 66], label: 'Corner Shop' },
    { t: 'busStop', p: [120, 66], label: 'Leisure centre' },
    { t: 'busStop', p: [34, 97], label: 'Orchard Close' },
    { t: 'busStop', p: [52, 117], label: 'Acacia Primary' },
    { t: 'busStop', p: [101, 85], label: 'Pond Lane' },
    { t: 'busStop', p: [129, 102], label: 'Mill Road' },
    { t: 'billboard', p: [20, 40] },
    { t: 'billboard', p: [136, 40] },
    // The Green: ponds, benches, trees round the edge, lamps where the paths cross.
    { t: 'pond', p: [60, 82] },
    { t: 'pond', p: [74, 94] },
    { t: 'bench', row: [48, 56, 74, 86], y: 89 },
    { t: 'tree', row: [45, 55, 63, 75, 85, 93], y: 73 },
    { t: 'tree', row: [45, 55, 63, 75, 85, 93], y: 109 },
    { t: 'lamppost', row: [68, 70], y: 90 },
    { t: 'flowers', row: [47, 52, 58, 80, 88, 94], y: 92 },
    // Street lamps.
    { t: 'lamppost', row: [74, 87, 111], y: 66 },
    { t: 'lamppost', row: [70, 85, 100], y: 55 },
    { t: 'lamppost', row: [37, 101], y: 80 },
    // The moorings: the sailing boats at the jetty, the lifebuoy on the beach.
    { t: 'sailboat', p: [97, 138] },
    { t: 'sailboat', p: [97, 140] },
    { t: 'lifebuoy', p: [74, 136] },
    // Hedges along the highway (a gap for Hill Road) and round the fields; fences round the playing field and gardens.
    { t: 'hedge', from: [0, 32], to: [159, 32], step: 1 },
    { t: 'hedge', from: [0, 39], to: [159, 39], step: 1, gaps: [[59, 39, 4, 1]] },
    { t: 'hedge', from: [0, 128], to: [54, 128], step: 1 },
    { t: 'hedge', from: [30, 129], to: [30, 144], step: 1 },
    { t: 'hedge', from: [124, 124], to: [159, 124], step: 1 },
    { t: 'hedge', from: [140, 125], to: [140, 159], step: 1 },
    { t: 'fence', from: [56, 119], to: [69, 119], step: 1 },
    { t: 'fence', from: [56, 128], to: [69, 128], step: 1 },
    { t: 'fence', from: [56, 120], to: [56, 127], step: 1 },
    { t: 'fence', from: [69, 120], to: [69, 127], step: 1 },
    { t: 'fence', from: [14, 77], to: [35, 77], step: 1 },
    { t: 'fence', from: [13, 87], to: [36, 87], step: 1 },
    // Trees: the countryside, back gardens, round the cottages, the woods by the river.
    { t: 'tree', scatter: [0, 0, 160, 30], count: 26 },
    { t: 'tree', scatter: [14, 78, 22, 8], count: 6 },
    { t: 'tree', scatter: [102, 70, 12, 22], count: 5 },
    { t: 'tree', scatter: [124, 66, 36, 24], count: 10 },
    { t: 'tree', scatter: [124, 113, 36, 10], count: 6 },
    { t: 'tree', scatter: [0, 129, 29, 16], count: 8 },
    { t: 'tree', scatter: [0, 150, 160, 10], count: 18 },
    { t: 'tree', scatter: [112, 126, 28, 30], count: 10 },
    { t: 'bush', scatter: [0, 129, 160, 31], count: 20 },
    { t: 'bush', scatter: [100, 70, 52, 20], count: 6 },
  ],

  floors: {
    // Ground floor: the kitchen, a big dining area with comfy seating, two meeting rooms, the production studio, customer service.
    ground: {
      name: 'Ground floor',
      kind: 'building',
      size: [40, 26],
      rooms: [
        { id: 'ground-floor', name: 'Ground floor', rect: [0, 0, 40, 26], floor: 'wood', walled: true },
        { id: 'dining', name: 'Dining area', rect: [0, 8, 17, 18], floor: 'darkWood' },
        { id: 'lobby', name: 'Lobby', rect: [17, 8, 7, 18], floor: 'stone' },
        { id: 'kitchen', name: 'Kitchen', rect: [0, 0, 12, 8], floor: 'tiles', walled: true },
        { id: 'meeting', name: 'Meeting room 1', rect: [12, 0, 8, 8], floor: 'carpetGrey', walled: true },
        { id: 'meeting-2', name: 'Meeting room 2', rect: [20, 0, 8, 8], floor: 'carpetGrey', walled: true },
        { id: 'studio', name: 'Production studio', rect: [28, 0, 12, 12], floor: 'concrete', walled: true, dept: 'film' },
        { id: 'support', name: 'Customer service', rect: [24, 14, 16, 12], floor: 'carpetBlue', walled: true, dept: 'cs' },
      ],
      doors: [[6, 7], [10, 7], [15, 7], [23, 7], [33, 11], [31, 14], [24, 19], [19, 25], [20, 25]],
      furniture: [
        // Kitchen
        { t: 'counter', p: [1, 1] }, { t: 'coffee', p: [2, 1] }, { t: 'coffee', p: [3, 1] }, { t: 'sink', p: [4, 1] }, { t: 'counter', p: [5, 1] },
        { t: 'fridge', p: [6, 1] }, { t: 'fridge', p: [7, 1] }, { t: 'counter', p: [8, 1] }, { t: 'plant', p: [10, 1] }, { t: 'table', p: [4, 4] },
        // Dining area: long tables, then sofas and armchairs to sink into
        { t: 'table', p: [2, 10] }, { t: 'table', p: [7, 10] }, { t: 'table', p: [2, 15] }, { t: 'table', p: [7, 15] }, { t: 'cooler', p: [14, 10] },
        { t: 'rug', p: [2, 21] }, { t: 'sofa', p: [2, 21] }, { t: 'sofa', p: [6, 21] }, { t: 'armchair', p: [10, 21] }, { t: 'armchair', p: [12, 21] },
        { t: 'bookshelf', p: [14, 23] }, { t: 'arcade', p: [12, 23] }, { t: 'plant', p: [1, 24] }, { t: 'plant', p: [16, 24] },
        // Meeting rooms
        { t: 'whiteboard', p: [14, 1] }, { t: 'meetingTable', p: [14, 3] }, { t: 'whiteboard', p: [22, 1] }, { t: 'meetingTable', p: [22, 3] },
        // Production studio
        { t: 'backdrop', p: [32, 1] }, { t: 'studioLight', p: [30, 2] }, { t: 'studioLight', p: [37, 2] }, { t: 'cameraRig', p: [33, 5] },
        { desks: 'film', at: [[29, 8], [32, 8], [35, 8]] },
        { t: 'plant', p: [38, 10] },
        // Customer service
        { desks: 'cs', at: [[26, 17], [29, 17], [32, 17], [35, 17], [26, 21], [29, 21]] },
        { t: 'plant', p: [38, 15] }, { t: 'plant', p: [38, 24] }, { t: 'bookshelf', p: [35, 21] },
        // Lobby
        { t: 'stairs', p: [19, 12] }, { t: 'plant', p: [17, 23] }, { t: 'plant', p: [22, 23] },
      ],
    },
    // First floor: brand, design, engineering, operations, the CEO's office, and a kitchenette round the stairs.
    first: {
      name: 'First floor',
      kind: 'building',
      size: [40, 26],
      rooms: [
        { id: 'first-floor', name: 'First floor', rect: [0, 0, 40, 26], floor: 'carpetGrey', walled: true },
        { id: 'kitchenette', name: 'Kitchenette', rect: [16, 8, 8, 18], floor: 'tiles' },
        { id: 'brand', name: 'Brand', rect: [0, 0, 16, 12], floor: 'carpetPurple', walled: true, dept: 'brand' },
        { id: 'design', name: 'Design', rect: [0, 14, 16, 12], floor: 'wood', walled: true, dept: 'design' },
        { id: 'ceo', name: "CEO's office", rect: [16, 0, 8, 8], floor: 'darkWood', walled: true, dept: 'ceo' },
        { id: 'eng', name: 'Engineering', rect: [24, 0, 16, 12], floor: 'carpetBlue', walled: true, dept: 'eng' },
        { id: 'ops', name: 'Operations', rect: [24, 14, 16, 12], floor: 'carpetGreen', walled: true, dept: 'ops' },
      ],
      doors: [[15, 5], [8, 11], [15, 19], [8, 14], [19, 7], [24, 5], [31, 11], [24, 19], [31, 14]],
      furniture: [
        // Brand
        { desks: 'brand', at: [[2, 3], [6, 3], [10, 3], [2, 7], [6, 7]] },
        { t: 'whiteboard', p: [10, 8] }, { t: 'bookshelf', p: [12, 1] }, { t: 'plant', p: [14, 1] }, { t: 'plant', p: [1, 10] },
        // Design
        { desks: 'design', at: [[2, 17], [6, 17]] },
        { t: 'whiteboard', p: [10, 17] }, { t: 'bookshelf', p: [2, 22] }, { t: 'plant', p: [14, 15] }, { t: 'plant', p: [14, 24] },
        // CEO's office
        { desks: 'ceo', at: [[18, 3]] },
        { t: 'bookshelf', p: [17, 1] }, { t: 'plant', p: [22, 1] }, { t: 'armchair', p: [17, 5] }, { t: 'armchair', p: [22, 5] },
        // Engineering
        { desks: 'eng', at: [[26, 3], [30, 3], [34, 3], [26, 7], [30, 7]] },
        { t: 'bookshelf', p: [36, 8] }, { t: 'plant', p: [38, 1] }, { t: 'plant', p: [38, 10] },
        // Operations
        { desks: 'ops', at: [[26, 17], [30, 17], [34, 17]] },
        { t: 'bookshelf', p: [26, 22] }, { t: 'plant', p: [38, 15] }, { t: 'plant', p: [38, 24] },
        // Kitchenette round the stairs
        { t: 'stairs', p: [19, 12] }, { t: 'counter', p: [17, 19] }, { t: 'coffee', p: [18, 19] }, { t: 'sink', p: [19, 19] }, { t: 'fridge', p: [20, 19] },
        { t: 'counter', p: [21, 19] }, { t: 'cooler', p: [22, 15] }, { t: 'arcade', p: [22, 21] }, { t: 'smallTable', p: [18, 23] },
        { t: 'plant', p: [17, 9] }, { t: 'plant', p: [22, 9] },
      ],
    },
  },

  companies: [
    { id: 'head', name: 'Head office', levels: ['ground', 'first'] },
    { id: 'shop', name: 'Corner Shop', icon: 'cart', walkIn: true, levels: ['shop'] },
    // Background staff run these (Dot, Ray, Maggie, Sol and Bex); anyone looking for work can be taken on too.
    { id: 'diner', name: 'The Night Owl Diner', icon: 'cup', walkIn: true, levels: ['diner'] },
    { id: 'leisure', name: 'Greenside Leisure Centre', icon: 'swim', walkIn: true, levels: ['leisure'] },
    { id: 'school', name: 'Acacia Primary', icon: 'school', walkIn: true, levels: ['school'] },
  ],

  departments: [
    { id: 'ceo', name: "CEO's office", color: '#e7aa2e', station: 'executiveDesk' },
    { id: 'film', name: 'Film', color: '#c8453a', station: 'editingDesk' },
    { id: 'cs', name: 'Customer service', color: '#1f9e95', station: 'supportDesk' },
    { id: 'brand', name: 'Brand', color: '#7f4aa6', station: 'laptopDesk' },
    { id: 'eng', name: 'Engineering', color: '#3f74b5', station: 'computerDesk' },
    { id: 'design', name: 'Design', color: '#e4793a', station: 'drawingDesk' },
    { id: 'ops', name: 'Operations', color: '#379463', station: 'opsDesk' },
  ],

  people: [
    { id: 'rowan', name: 'Rowan', dept: 'ceo', look: [1, 4, 7, 0], preset: 'magnet', traits: { diligence: 0.7 }, car: true },
    { id: 'ines', name: 'Ines', dept: 'film', look: [2, 0, 1, 2], preset: 'workhorse', car: true },
    { id: 'theo', name: 'Theo', dept: 'film', look: [0, 2, 5, 0], preset: 'distractor', car: true },
    { id: 'mo', name: 'Mo', dept: 'film', look: [4, 0, 3, 0], preset: 'founder' },
    { id: 'priya', name: 'Priya', dept: 'cs', look: [3, 0, 6, 1], preset: 'regular', car: true },
    { id: 'sam', name: 'Sam', dept: 'cs', look: [0, 1, 0, 0], preset: 'introvert' },
    { id: 'lou', name: 'Lou', dept: 'cs', look: [1, 6, 2, 1], preset: 'magnet' },
    { id: 'ada', name: 'Ada', dept: 'brand', look: [0, 1, 4, 2], preset: 'regular', car: true },
    { id: 'bea', name: 'Bea', dept: 'brand', look: [2, 3, 1, 1], preset: 'magnet' },
    { id: 'cal', name: 'Cal', dept: 'brand', look: [1, 0, 2, 0], preset: 'distractor' },
    { id: 'dev', name: 'Dev', dept: 'eng', look: [3, 2, 3, 0], preset: 'introvert' },
    { id: 'hana', name: 'Hana', dept: 'eng', look: [0, 0, 7, 1], preset: 'workhorse', traits: { ambition: 0.75 }, car: true },
    { id: 'gus', name: 'Gus', dept: 'eng', look: [2, 4, 6, 0], preset: 'introvert', car: true },
    { id: 'fay', name: 'Fay', dept: 'design', look: [1, 6, 5, 1], preset: 'regular' },
    { id: 'eli', name: 'Eli', dept: 'ops', look: [4, 4, 4, 0], preset: 'workhorse', car: true },
    { id: 'nia', name: 'Nia', dept: 'ops', look: [3, 0, 0, 2], preset: 'regular', car: true },
    // Work at the Corner Shop, in shifts that cover its opening hours (07:00–22:00) and each other's lunch.
    { id: 'wes', name: 'Wes', company: 'shop', look: [2, 1, 3, 0], preset: 'regular', traits: { ambition: 0.2 }, shift: [7, 15] },
    { id: 'juno', name: 'Juno', company: 'shop', look: [0, 6, 6, 1], preset: 'magnet', traits: { ambition: 0.25 }, shift: [12, 22] },
  ],

  npcs: [
    // Families and pets, in someone's household.
    { id: 'jules', name: 'Jules', species: 'human', look: [0, 2, 3, 1], home: 'rowan', preset: 'magnet' },
    { id: 'biscuit', name: 'Biscuit', species: 'dog', look: [0], home: 'rowan' },
    { id: 'miso', name: 'Miso', species: 'cat', look: [1], home: 'ines' },
    { id: 'arjun', name: 'Arjun', species: 'human', look: [3, 0, 7, 0], home: 'priya', preset: 'workhorse' },
    { id: 'pepper', name: 'Pepper', species: 'cat', look: [2], home: 'priya' },
    { id: 'kai', name: 'Kai', species: 'human', look: [1, 1, 2, 0], home: 'hana', preset: 'introvert' },
    { id: 'waffles', name: 'Waffles', species: 'dog', look: [3], home: 'hana' },
    { id: 'olive', name: 'Olive', species: 'cat', look: [0], home: 'eli' },
    { id: 'tom', name: 'Tom', species: 'human', look: [4, 4, 5, 0], home: 'nia', preset: 'distractor' },
    // The children, who go to Acacia Primary on weekdays.
    { id: 'isla', name: 'Isla', species: 'human', look: [1, 2, 2, 2], home: 'rowan', preset: 'magnet', role: 'child', works: 'school' },
    { id: 'finn', name: 'Finn', species: 'human', look: [0, 4, 5, 0], home: 'rowan', preset: 'distractor', role: 'child', works: 'school' },
    { id: 'omar', name: 'Omar', species: 'human', look: [3, 0, 3, 0], home: 'priya', preset: 'regular', role: 'child', works: 'school' },
    { id: 'lina', name: 'Lina', species: 'human', look: [0, 1, 6, 2], home: 'hana', preset: 'introvert', role: 'child', works: 'school' },
    // Their teacher.
    { id: 'maggie', name: 'Maggie', species: 'human', look: [2, 3, 4, 1], own: true, preset: 'workhorse', role: 'staff', works: 'school', shift: [8, 16], car: true },
    // Fen lives on the narrowboat moored on the river, and is out on the water whenever it's fine.
    { id: 'fen', name: 'Fen', species: 'human', look: [3, 2, 3, 1], own: true, preset: 'regular', traits: { ambition: 0.8, chaos: 0.6, social: 0.5 }, role: 'resident' },
    // The diner's staff: Dot on days, Ray on nights, so it never closes.
    { id: 'dot', name: 'Dot', species: 'human', look: [1, 3, 1, 2], own: true, preset: 'magnet', role: 'staff', works: 'diner', shift: [6, 18], car: true },
    { id: 'ray', name: 'Ray', species: 'human', look: [3, 5, 7, 0], own: true, preset: 'introvert', role: 'staff', works: 'diner', shift: [18, 6] },
    // The leisure centre's: Sol opens up, Bex closes.
    { id: 'sol', name: 'Sol', species: 'human', look: [2, 2, 0, 0], own: true, preset: 'regular', role: 'staff', works: 'leisure', shift: [7, 15] },
    { id: 'bex', name: 'Bex', species: 'human', look: [0, 5, 4, 2], own: true, preset: 'magnet', role: 'staff', works: 'leisure', shift: [14, 22] },
  ],
};
