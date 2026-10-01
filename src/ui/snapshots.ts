// Live towns saved as they're running, in IndexedDB, so coming back only catches up from then (docs/TIME.md#snapshots).
import { SNAPSHOT_FORMAT, type Snapshot } from '../sim/snapshot.ts';
import type { WorldDef } from '../sim/world.ts';
import { VERSION } from '../worlds/version.ts';

const DB = 'officebit';
const STORE = 'snapshots';
/** Towns kept (one each, by story seed: your own, and ones opened from links); the least recently saved go first. */
const KEEP = 3;

/** A snapshot, and what it's a snapshot of: it's only any use for the same release, design, story and start. */
export interface Saved {
  release: string;
  format: number;
  /** The design it was running (with its seed), as a fingerprint. */
  design: number;
  since: number;
  /** When it was saved (ms), for keeping only the latest few towns. */
  at: number;
  snap: Snapshot;
}

/** Does this saved town belong to the town about to start? */
export function fits(saved: Saved | null, design: WorldDef, since: number | null): saved is Saved {
  return !!saved && saved.release === VERSION && saved.format === SNAPSHOT_FORMAT && saved.since === since && saved.design === fingerprint(design);
}

export function saved(snap: Snapshot, design: WorldDef, since: number): Saved {
  return { release: VERSION, format: SNAPSHOT_FORMAT, design: fingerprint(design), since, at: Date.now(), snap };
}

/** Each town's snapshot is kept under its story seed. */
const keyOf = (design: WorldDef) => String(design.seed ?? 0);

export async function loadSnapshot(design: WorldDef): Promise<Saved | null> {
  try {
    const db = await open();
    return (await request<Saved | undefined>(db.transaction(STORE).objectStore(STORE).get(keyOf(design)))) ?? null;
  } catch {
    return null;
  }
}

/** Saved in the background; a town that can't be saved (private browsing, no space) just catches up from the start next time. */
export async function saveSnapshot(value: Saved, design: WorldDef): Promise<void> {
  try {
    const db = await open();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    store.put(value, keyOf(design));
    // Only the latest few towns: the rest make way.
    const keys = await request<IDBValidKey[]>(store.getAllKeys());
    const all = await request<Saved[]>(store.getAll());
    const old = keys.map((key, i) => ({ key, at: all[i]?.at ?? 0 })).sort((a, b) => b.at - a.at).slice(KEEP);
    for (const { key } of old) store.delete(key);
  } catch {
    // Nothing to do: next visit replays the town instead.
  }
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** A quick hash of the design (FNV-1a over its JSON). */
function fingerprint(design: WorldDef): number {
  const text = JSON.stringify(design);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}
