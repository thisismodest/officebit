// Furniture types (docs/FURNITURE.md). Each advertises what it does for people
// ("affordances"), so moving the coffee machine genuinely changes behaviour.
// Art lives separately, in render/props/.
import type { Need } from './needs.ts';
import type { Tile } from './world.ts';

export interface FurnitureType {
  name: string;
  size: [w: number, h: number];
  /** Blocks movement. Spots stay walkable either way. */
  solid: boolean;
  /** Where users stand, sit or lie, relative to the top-left tile. */
  spots: Tile[];
  /** Total amount of each need restored by one use. */
  offers?: Partial<Record<Need, number>>;
  /** Use duration in ticks: [min, max]. */
  duration?: [number, number];
  /** Someone's workstation: only its owner uses it. */
  desk?: boolean;
  /** A place people gather; the crowd is part of the appeal. */
  hangout?: boolean;
  /** Where meetings happen. No casual use. */
  meeting?: boolean;
  /** Somewhere to sleep. */
  bed?: boolean;
  /** Where pets curl up. */
  petBed?: boolean;
  /** Users sit on it (drawn seated). */
  seat?: boolean;
  /** Somewhere to work on a side project (home desks). */
  study?: boolean;
  /** Lets sofas in the same room be used for gaming. */
  games?: boolean;
  /** Only open between these hours (daily, unless `weekdaysOnly`). */
  hours?: [from: number, to: number];
  weekdaysOnly?: boolean;
  /** Where the food shop gets done: restocks the shopper's home pantry. */
  groceries?: boolean;
  /** At home, meals' worth of ingredients one use takes from the pantry. No ingredients, no cooking. */
  usesPantry?: number;
  /** Out in the street: people nip out from work to use it while it's open. */
  street?: boolean;
  /** A treat (street food, free pizza): worth going out of the way for. */
  treat?: boolean;
  /** An empty plot a new company can build an office on. */
  lot?: boolean;
  /** Where venue staff stand to serve. Customers leave it alone. */
  staff?: boolean;
  /** A construction site: the crew works from its spots. */
  worksite?: boolean;
  /** Something to play on (swings, hopscotch): grown-ups have a go too, when they're feeling playful. */
  play?: boolean;
  /** Outdoors, it stands on hard ground (a forecourt or paving), not grass: chargers, bays, the canopy. */
  hardStanding?: boolean;
  /** A parking bay: somewhere to leave a car, or to charge it (see traffic.ts). */
  parking?: 'park' | 'charge';
}

const workstation = (name: string, size: [number, number] = [2, 1], spot: Tile = [0, 1]): FurnitureType => ({
  name,
  size,
  solid: true,
  spots: [spot],
  desk: true,
});

const decor = (name: string, size: [number, number], solid = true): FurnitureType => ({ name, size, solid, spots: [] });

const seating = (name: string, width: number, offers: FurnitureType['offers'], duration: [number, number]): FurnitureType => ({
  name,
  size: [width, 1],
  solid: false,
  seat: true,
  spots: Array.from({ length: width }, (_, x): Tile => [x, 0]),
  offers,
  duration,
});

/** Every tile bordering a w×h footprint. */
const around = (w: number, h: number): Tile[] => [
  ...Array.from({ length: w }, (_, x): Tile => [x, -1]),
  ...Array.from({ length: w }, (_, x): Tile => [x, h]),
  ...Array.from({ length: h }, (_, y): Tile => [-1, y]),
  ...Array.from({ length: h }, (_, y): Tile => [w, y]),
];

export const CATALOG: Record<string, FurnitureType> = {
  // Workstations, one flavour per kind of team
  computerDesk: workstation('Computer desk'),
  editingDesk: workstation('Editing suite'),
  supportDesk: workstation('Support desk'),
  drawingDesk: workstation('Drawing desk'),
  laptopDesk: workstation('Laptop desk'),
  opsDesk: workstation('Operations desk'),
  executiveDesk: workstation('Executive desk', [3, 1], [1, 1]),

  // Kitchens and breaks
  coffee: { name: 'Coffee machine', size: [1, 1], solid: true, spots: [[0, 1]], offers: { energy: 0.3 }, duration: [50, 80] },
  fridge: { name: 'Fridge', size: [1, 1], solid: true, spots: [[0, 1]], offers: { hunger: 0.35 }, duration: [60, 100], usesPantry: 0.5 },
  cooler: {
    name: 'Water cooler',
    size: [1, 1],
    solid: true,
    spots: [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]],
    offers: { social: 0.15, energy: 0.05, fun: 0.05 },
    duration: [40, 90],
    hangout: true,
  },
  table: {
    name: 'Dining table',
    size: [3, 2],
    solid: true,
    spots: around(3, 2),
    offers: { hunger: 0.5, social: 0.25 },
    duration: [120, 200],
    hangout: true,
  },
  sofa: seating('Sofa', 2, { energy: 0.25, fun: 0.25 }, [120, 240]),
  armchair: seating('Armchair', 1, { energy: 0.2, fun: 0.15 }, [100, 200]),
  counter: decor('Counter', [1, 1]),
  sink: decor('Sink', [1, 1]),

  // Meetings and work areas
  meetingTable: { name: 'Meeting table', size: [3, 2], solid: true, spots: around(3, 2), meeting: true },
  whiteboard: decor('Whiteboard', [3, 1]),
  backdrop: decor('Studio backdrop', [4, 1]),
  studioLight: decor('Studio light', [1, 1]),
  cameraRig: decor('Camera', [1, 1]),
  stairs: decor('Stairs', [2, 2], false),

  arcade: {
    name: 'Arcade machine',
    size: [1, 1],
    solid: true,
    spots: [[0, 1]],
    offers: { fun: 0.6, social: 0.05, energy: 0.05 },
    duration: [40, 80],
    hangout: true,
  },

  // The shop
  shelf: { name: 'Shelves', size: [3, 1], solid: true, spots: [[0, 1], [1, 1], [2, 1]], groceries: true, duration: [30, 60], hours: [7, 22] },
  produce: { name: 'Fruit and veg', size: [2, 1], solid: true, spots: [[0, 1], [1, 1]], groceries: true, duration: [20, 40], hours: [7, 22] },
  chiller: decor('Chiller', [2, 1]),
  checkout: workstation('Checkout'),

  // The school
  schoolDesk: workstation('School desk', [1, 1]),
  teacherDesk: { name: "Teacher's desk", size: [2, 1], solid: true, spots: [[0, -1]], staff: true, duration: [200, 500] },
  blackboard: decor('Blackboard', [3, 1]),
  canteenTable: {
    name: 'Lunch table',
    size: [4, 1],
    solid: true,
    spots: [[0, -1], [1, -1], [2, -1], [3, -1], [0, 1], [1, 1], [2, 1], [3, 1]],
    offers: { hunger: 0.6, social: 0.25 },
    duration: [90, 140],
    hours: [12, 13.5],
    hangout: true,
  },
  swings: {
    name: 'Swings',
    size: [3, 2],
    solid: false,
    spots: [[0, 1], [2, 1]],
    offers: { fun: 0.45, social: 0.05 },
    duration: [40, 90],
    seat: true,
    play: true,
  },
  hopscotch: {
    name: 'Hopscotch',
    size: [1, 3],
    solid: false,
    spots: [[0, 0], [0, 2]],
    offers: { fun: 0.3, social: 0.15 },
    duration: [30, 70],
    hangout: true,
    play: true,
  },

  // Venues
  dinerCounter: {
    name: 'Diner counter',
    size: [4, 1],
    solid: true,
    spots: [[0, 1], [1, 1], [2, 1], [3, 1]],
    offers: { energy: 0.25, hunger: 0.3, social: 0.1 },
    duration: [50, 110],
    hangout: true,
  },
  booth: {
    name: 'Booth',
    size: [2, 3],
    solid: true,
    spots: [[0, 0], [1, 0], [0, 2], [1, 2]],
    offers: { hunger: 0.55, social: 0.3, fun: 0.1 },
    duration: [90, 160],
    hangout: true,
    seat: true,
  },
  jukebox: {
    name: 'Jukebox',
    size: [1, 1],
    solid: true,
    spots: [[0, 1]],
    offers: { fun: 0.3, social: 0.05 },
    duration: [20, 40],
    hangout: true,
  },
  pizza: {
    name: 'Pizza',
    size: [1, 1],
    solid: true,
    spots: [[0, -1], [1, 0], [0, 1], [-1, 0]],
    offers: { hunger: 0.5, social: 0.25, fun: 0.1 },
    duration: [40, 80],
    hangout: true,
    treat: true,
  },
  till: { name: 'Till', size: [1, 1], solid: true, spots: [[0, 1]], staff: true, duration: [200, 500] },

  // Homes
  bed: { name: 'Double bed', size: [2, 2], solid: true, spots: [[0, 0], [1, 0]], bed: true },
  singleBed: { name: 'Bed', size: [1, 2], solid: true, spots: [[0, 0]], bed: true },
  stove: { name: 'Stove', size: [1, 1], solid: true, spots: [[0, 1]], offers: { hunger: 0.55 }, duration: [120, 200], usesPantry: 1 },
  tv: decor('TV', [2, 1]),
  smallTable: {
    name: 'Kitchen table',
    size: [2, 1],
    solid: true,
    spots: [[0, -1], [1, -1], [0, 1], [1, 1]],
    offers: { social: 0.2 },
    duration: [80, 140],
    hangout: true,
  },
  petBed: { name: 'Pet bed', size: [1, 1], solid: false, spots: [[0, 0]], petBed: true },
  homeDesk: { name: 'Desk', size: [2, 1], solid: true, spots: [[0, 1]], study: true },
  console: { ...decor('Games console', [1, 1]), games: true },
  rug: decor('Rug', [3, 2], false),

  // Anywhere
  plant: decor('Plant', [1, 1]),
  bookshelf: decor('Bookshelf', [2, 1]),

  // Outside
  officeBuilding: decor('Office', [12, 6]),
  diner: decor('Diner', [9, 6]),
  supermarket: decor('Corner shop', [9, 6]),
  school: decor('School', [11, 7]),
  startupSmall: decor('Small office', [5, 4]),
  startupLarge: decor('Office', [9, 6]),
  terrace: decor('House', [3, 3]),
  house: decor('House', [4, 3]),
  detached: decor('House', [5, 3]),
  pond: decor('Pond', [6, 4]),
  lot: { ...decor('Empty lot', [9, 6], false), lot: true },
  siteSmall: { ...decor('Building site', [5, 4]), spots: around(5, 4), worksite: true, duration: [150, 300] },
  siteLarge: { ...decor('Building site', [9, 6]), spots: around(9, 6), worksite: true, duration: [150, 300] },
  foodTruck: {
    name: 'Food truck',
    size: [3, 2],
    solid: false,
    spots: [[0, 2], [1, 2], [2, 2]],
    offers: { hunger: 0.55, social: 0.1, fun: 0.15 },
    duration: [60, 110],
    hours: [12, 14],
    weekdaysOnly: true,
    street: true,
    treat: true,
  },
  tree: decor('Tree', [2, 2]),
  bush: decor('Bush', [1, 1]),
  flowers: decor('Flowers', [1, 1], false),
  bench: decor('Bench', [2, 1]),
  lamppost: decor('Lamppost', [1, 1]),
  evCharger: { ...decor('Charger', [1, 1]), hardStanding: true },
  chargingCanopy: { ...decor('Canopy', [9, 1], false), hardStanding: true },
  parkingBay: { ...decor('Parking bay', [1, 1], false), parking: 'park', hardStanding: true },
  chargingBay: { ...decor('Charging bay', [1, 1], false), parking: 'charge', hardStanding: true },
};
