// The test town (docs/DEVELOPING.md#testing): a compact town with one of everything the starter town has, and a smaller
// cast with every kind of person, so tests check what happens, not one long story. The office floors, departments and
// everyone's details come from the starter town; only the map and who's in it differ.
import type { TownConfig } from '../src/worlds/config.ts';
import { STARTER_CONFIG } from '../src/worlds/starter.config.ts';

/** The cast: office staff (one of each preset, and then some), the shop's two, and everyone else by role. */
const PEOPLE = ['rowan', 'ines', 'theo', 'mo', 'sam', 'ada', 'bea', 'cal', 'dev', 'hana', 'eli', 'wes', 'juno'];
const NPCS = ['jules', 'biscuit', 'isla', 'finn', 'miso', 'maggie', 'dot', 'ray', 'kit', 'rio', 'tam', 'jo', 'nat'];
const STREET = 30;

export const TEST_TOWN_CONFIG: TownConfig = {
  name: 'Test town',
  seed: 20261002,
  size: [100, 100],
  view: [26, 27],
  spawn: [99, STREET],

  areas: [
    { name: 'The highway', floor: 'highway', rects: [[0, 12, 100, 4]] },
    { name: 'Footbridge', floor: 'overpass', rects: [[45, 12, 1, 4]] },
    { name: 'The Green', floor: 'grass', rects: [[30, 35, 42, 22]], park: true, square: true },
    { name: 'River Dove', floor: 'water', rects: [[0, 80, 100, 5]] },
    { name: 'The beach', floor: 'sand', rects: [[40, 77, 10, 3]] },
    { name: 'The shallows', floor: 'shallows', rects: [[40, 80, 10, 2]] },
    { name: 'Jetty', floor: 'jetty', rects: [[56, 80, 1, 3]] },
    { name: 'Charging station', floor: 'forecourt', rects: [[86, 25, 9, 5]] },
    { name: 'Depot yard', floor: 'forecourt', rects: [[70, 2, 10, 6]] },
    { name: 'Office car park', floor: 'forecourt', rects: [[34, 16, 12, 5]] },
    { name: 'Terrace car park', floor: 'forecourt', rects: [[0, 16, 18, 5]] },
    { name: 'Back car park', floor: 'forecourt', rects: [[6, 38, 20, 4]] },
    { name: 'Driveway', floor: 'forecourt', rects: [[35, 62, 2, 5], [43, 62, 2, 5]] },
    { name: 'South car park', floor: 'forecourt', rects: [[64, 62, 8, 6]] },
    { name: 'West Field runway', floor: 'runway', rects: [[4, 86, 30, 3]] },
    { name: 'West Field apron', floor: 'forecourt', rects: [[24, 89, 12, 8]] },
    { name: 'East Field runway', floor: 'runway', rects: [[66, 86, 30, 3]] },
    { name: 'East Field apron', floor: 'forecourt', rects: [[66, 89, 12, 8]] },
  ],
  pavements: true,
  doorPaths: true,
  roads: [
    { name: 'North Lane', rects: [[18, 8, 62, 2], [46, 10, 2, 2]] },
    { name: 'Hill Road', rects: [[46, 16, 2, 14]] },
    { name: 'Back Mews', rects: [[18, 16, 2, 14]] },
    { name: 'The Street', rects: [[0, STREET, 100, 2]] },
    { name: 'Green Lane', rects: [[26, 32, 2, 28]] },
    { name: 'Pond Lane', rects: [[74, 32, 2, 28]] },
    { name: 'South Road', rects: [[0, 60, 100, 2]] },
    { name: 'Ferry Lane', rects: [[60, 62, 2, 36]] },
    { name: 'Field Road', rects: [[0, 98, 100, 2]] },
  ],
  crossings: [
    { floor: 'zebra', rect: [24, STREET, 2, 2] },
    { floor: 'zebra', rect: [64, STREET, 2, 2] },
  ],
  paths: [
    // Across the Green; from the boating club down to the jetty; from each hangar's door to its apron.
    [30, 46, 42, 1],
    [51, 62, 1, 15],
    [51, 77, 6, 1],
    [56, 78, 1, 2],
    [11, 95, 1, 1],
    [11, 96, 13, 1],
    [89, 95, 1, 1],
    [78, 96, 11, 1],
  ],

  buildings: [
    { id: 'ground', t: 'officeBuilding', label: 'Head office', at: [21, 21], door: 5, inside: { floors: ['ground', 'first'], entry: [19, 24], stairs: [19, 12] } },
    { id: 'diner', t: 'diner', label: 'The Night Owl Diner', at: [50, 21], door: 4, inside: { template: 'diner' } },
    { id: 'shop', t: 'supermarket', label: 'Corner Shop', at: [61, 21], door: 4, inside: { template: 'shop' } },
    { id: 'leisure', t: 'leisureCentre', label: 'Greenside Leisure Centre', at: [72, 21], door: 5, inside: { template: 'leisure' } },
    { id: 'school', t: 'school', label: 'Acacia Primary', at: [80, 35], faces: 'up', door: 5, inside: { template: 'school' } },
    { id: 'clubhouse', t: 'boathouse', label: 'Boating club', at: [50, 73], inside: { template: 'clubhouse' } },
    { id: 'depot', t: 'depot', label: 'Dove Parcels', at: [56, 0], door: 5, inside: { template: 'depot' } },
    { id: 'hangar-west', t: 'hangar', label: 'West Field hangar', at: [8, 91], door: 3, inside: { template: 'hangar' } },
    { id: 'hangar-east', t: 'hangar', label: 'East Field hangar', at: [86, 91], door: 3, inside: { template: 'hangar' } },
  ],

  homes: [
    { t: 'terrace', at: [2, 21], count: 5 },
    { t: 'terrace', at: [1, 34], faces: 'up', count: 8 },
    { t: 'house', at: [2, 55], count: 4, gap: 2 },
    { t: 'house', at: [76, 64], faces: 'up', count: 4, gap: 2 },
    { t: 'detached', at: [30, 64], faces: 'up', count: 4, gap: 3 },
  ],

  lots: [{ at: [20, 0] }, { at: [32, 0] }],

  things: [
    { t: 'foodTruck', p: [33, 27], label: 'Taco truck' },
    { t: 'foodTruck', p: [37, 27], label: 'Noodle van' },
    { t: 'foodTruck', p: [41, 27], label: 'Pizza van' },
    { t: 'chargingCanopy', p: [86, 25] },
    { t: 'evCharger', row: [91, 93], y: 26 },
    { t: 'parkingBay', row: [87, 89], y: 27 },
    { t: 'chargingBay', row: [91, 93], y: 27 },
    { t: 'loadingBay', row: [72, 74, 76], y: 2 },
    { t: 'parkingBay', row: [35, 37, 39, 41, 43], y: 16 },
    { t: 'parkingBay', row: [35, 37, 39, 41, 43], y: 20 },
    { t: 'parkingBay', row: [1, 3, 5, 7, 9, 11, 13, 15], y: 16 },
    { t: 'parkingBay', row: [1, 3, 5, 7, 9, 11, 13, 15], y: 20 },
    { t: 'parkingBay', row: [7, 9, 11, 13, 15, 17, 19, 21, 23], y: 38 },
    { t: 'parkingBay', row: [35, 43], y: 66 },
    { t: 'parkingBay', row: [65, 67, 69], y: 66 },
    { t: 'plane', p: [28, 91], label: 'Dove Air' },
    { t: 'stand', p: [28, 91] },
    { t: 'gate', p: [30, 96], label: 'West Field' },
    { t: 'stand', p: [70, 91] },
    { t: 'gate', p: [72, 96], label: 'East Field' },
    { t: 'busStop', p: [27, 28], label: 'Head office' },
    { t: 'busStop', p: [66, 33], label: 'The Street East' },
    { t: 'busStop', p: [32, 58], label: 'South Road' },
    { t: 'billboard', p: [60, 17] },
    { t: 'bench', row: [36, 50, 62], y: 44 },
    { t: 'tree', row: [32, 44, 56, 66], y: 37 },
    { t: 'sailboat', p: [57, 80] },
    { t: 'sailboat', p: [57, 82] },
    { t: 'lifebuoy', p: [44, 78] },
  ],

  floors: STARTER_CONFIG.floors,
  companies: STARTER_CONFIG.companies.filter((c) => c.id !== 'garden'),
  departments: STARTER_CONFIG.departments,
  people: STARTER_CONFIG.people.filter((p) => PEOPLE.includes(p.id)),
  npcs: STARTER_CONFIG.npcs.filter((n) => NPCS.includes(n.id)),
};
