// A running town, saved and restored whole (docs/TIME.md#snapshots): the sim's object graph as plain, cloneable data.
import { Arrivals, HomewardBrain } from './arrivals.ts';
import { Birthdays } from './birthdays.ts';
import { Boats } from './boats.ts';
import { CrewBrain, PersonalityBrain, PetBrain, StaffBrain } from './brain.ts';
import { Buses } from './buses.ts';
import { Careers } from './careers.ts';
import { CATALOG } from './catalog.ts';
import { Space } from './collision.ts';
import { Construction } from './construction.ts';
import { Deliveries } from './deliveries.ts';
import { Emitter } from './emitter.ts';
import { Festivities } from './festivities.ts';
import { FoodTrucks } from './food-trucks.ts';
import { Grid, Heap } from './grid.ts';
import { Housing } from './housing.ts';
import { INTENTS } from './intents.ts';
import { ControlledBrain, CourierBrain, Interactions } from './interactions.ts';
import { Love } from './love.ts';
import { MOVERS } from './movement.ts';
import { Navigator } from './navigation.ts';
import { Plans } from './plans.ts';
import { Relationships } from './relationships.ts';
import { Rng } from './rng.ts';
import { RoadMap } from './roads.ts';
import { ROLES } from './roles.ts';
import { Simulation } from './sim.ts';
import { Social } from './social.ts';
import { Traffic } from './traffic.ts';
import { Ventures } from './ventures.ts';
import { Visitors, VisitorBrain } from './visitors.ts';
import { Skies } from './weather.ts';
import { Works } from './works.ts';

/** Bump when the shape of what's saved changes in a way older snapshots can't be read with. */
export const SNAPSHOT_FORMAT = 1;

export interface Snapshot {
  format: number;
  tick: number;
  graph: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: any class's constructor
type Class = abstract new (...args: any[]) => object;

/** Every class whose instances live in a running town, by name. */
const CLASSES: Record<string, Class> = Object.fromEntries(
  [
    Simulation, Rng, Grid, Heap, Navigator, RoadMap, Ventures, Construction, Careers, Relationships, Housing, Love, Interactions,
    Social, Traffic, Visitors, Arrivals, Festivities, Skies, Birthdays, Boats, Deliveries, FoodTrucks, Plans, Works, Buses,
    PersonalityBrain, StaffBrain, CrewBrain, PetBrain, ControlledBrain, CourierBrain, HomewardBrain, VisitorBrain,
  ].map((c) => [c.name, c]),
);

/** A class may name fields that are caches, made again when needed (`static readonly unsaved = ['scratch']`): they come back null. */

/** Kept as nothing and made afresh: listeners (the page's, added again), and the collision layers (refilled every step). */
const FRESH: Record<string, () => object> = { Emitter: () => new Emitter(), Space: () => new Space(), WeakMap: () => new WeakMap() };

/** Shared constant tables: their entries are saved as where they are, not copied. */
const TABLES: Record<string, Record<string, object>> = { CATALOG, MOVERS, INTENTS, ROLES };
const CONSTANTS = new Map<object, [table: string, key: string]>();
for (const [table, entries] of Object.entries(TABLES)) for (const [key, value] of Object.entries(entries)) CONSTANTS.set(value, [table, key]);

/** The whole town as plain data, ready for structuredClone or IndexedDB. Take it between steps. */
export function snapshot(sim: Simulation): Snapshot {
  const seen = new Map<object, unknown>();
  const path: string[] = [];
  const encode = (value: unknown): unknown => {
    if (typeof value === 'function') throw new Error(`can't save a function, at ${path.join('.')}`);
    if (typeof value !== 'object' || value === null) return value;
    const done = seen.get(value);
    if (done !== undefined) return done;
    const constant = CONSTANTS.get(value);
    if (constant) return { $k: constant };
    const name = value.constructor?.name;
    if (name && name in FRESH && value.constructor !== Object) return { $f: name };
    if (ArrayBuffer.isView(value)) return (value as unknown as Uint8Array).slice();
    let out: unknown;
    const into = (key: string, v: unknown): unknown => {
      path.push(key);
      const encoded = encode(v);
      path.pop();
      return encoded;
    };
    if (Array.isArray(value)) {
      const list: unknown[] = [];
      seen.set(value, list);
      for (const [i, v] of value.entries()) list.push(into(String(i), v));
      out = list;
    } else if (value instanceof Map) {
      const map = new Map();
      seen.set(value, map);
      for (const [k, v] of value) map.set(into('key', k), into(String(k), v));
      out = map;
    } else if (value instanceof Set) {
      const set = new Set();
      seen.set(value, set);
      for (const v of value) set.add(into('item', v));
      out = set;
    } else {
      const fields: Record<string, unknown> = {};
      const plain = value.constructor === Object || Object.getPrototypeOf(value) === null;
      if (!plain && !(name! in CLASSES)) throw new Error(`can't save a ${name}, at ${path.join('.')}: add it to CLASSES in snapshot.ts`);
      out = plain ? fields : { $c: name, $v: fields };
      seen.set(value, out);
      const unsaved: readonly string[] = (value.constructor as { unsaved?: string[] }).unsaved ?? [];
      for (const key of Object.keys(value)) fields[key] = unsaved.includes(key) ? null : into(key, (value as Record<string, unknown>)[key]);
    }
    return out;
  };
  return { format: SNAPSHOT_FORMAT, tick: sim.tick, graph: encode(sim) };
}

/** The town back from a snapshot, just as it was. */
export function restore(snap: Snapshot): Simulation {
  const seen = new Map<object, unknown>();
  const decode = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return value;
    const done = seen.get(value);
    if (done !== undefined) return done;
    if (Array.isArray(value)) {
      const list: unknown[] = [];
      seen.set(value, list);
      for (const v of value) list.push(decode(v));
      return list;
    }
    if (value instanceof Map) {
      const map = new Map();
      seen.set(value, map);
      for (const [k, v] of value) map.set(decode(k), decode(v));
      return map;
    }
    if (value instanceof Set) {
      const set = new Set();
      seen.set(value, set);
      for (const v of value) set.add(decode(v));
      return set;
    }
    const tagged = value as { $k?: [string, string]; $f?: string; $c?: string; $v?: Record<string, unknown> };
    if (tagged.$k) return TABLES[tagged.$k[0]]![tagged.$k[1]];
    if (tagged.$f) return FRESH[tagged.$f]!();
    const [target, fields] = tagged.$c ? [Object.create(CLASSES[tagged.$c]!.prototype), tagged.$v!] : [{}, value as Record<string, unknown>];
    seen.set(value, target);
    for (const [key, v] of Object.entries(fields)) target[key] = decode(v);
    return target;
  };
  return decode(snap.graph) as Simulation;
}
