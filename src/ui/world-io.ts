// Saving and sharing worlds (docs/BUILDER.md#save-and-share): a slot in this
// browser, a link with the whole world compressed into its hash, and JSON
// files. Whatever comes in is checked before it's used.
import { validate } from '../sim/validate.ts';
import type { WorldDef } from '../sim/world.ts';

const STORAGE_KEY = 'officebit:world';
/** The hash parameter a shared world travels in: #w=… */
export const HASH_KEY = 'w';

/** A world as a short, URL-safe string: JSON, deflated, base64url. */
export async function encodeWorld(world: WorldDef): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(world));
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  let binary = '';
  for (const byte of packed) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The reverse of encodeWorld. Throws if it isn't one. */
export async function decodeWorld(text: string): Promise<unknown> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
}

export interface Loaded {
  world: WorldDef | null;
  problems: string[];
}

/** Is this a world we can run? Checks the shape, then everything validate() checks. */
export function checkWorld(value: unknown): Loaded {
  const w = value as Partial<WorldDef> | null;
  if (!w || typeof w !== 'object' || w.v !== 2) return { world: null, problems: ["That isn't an officebit world (version 2)."] };
  for (const key of ['companies', 'departments', 'levels', 'portals', 'people', 'npcs'] as const) {
    if (!Array.isArray(w[key])) return { world: null, problems: [`The world has no ${key} list.`] };
  }
  if (!w.spawn || typeof w.spawn !== 'object') return { world: null, problems: ['The world has no spawn point.'] };
  const overrides = Object.values(w.overrides ?? {});
  if (typeof (w.overrides ?? {}) !== 'object' || overrides.some((o) => !Array.isArray(o?.size) || !Array.isArray(o?.furniture))) {
    return { world: null, problems: ['The changes to places the story builds are the wrong shape.'] };
  }
  try {
    const problems = validate(w as WorldDef);
    return { world: problems.length ? null : (w as WorldDef), problems };
  } catch (error) {
    return { world: null, problems: [`The world is broken: ${(error as Error).message}`] };
  }
}

export function saveLocal(world: WorldDef): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
}

export function loadLocal(): unknown {
  const text = localStorage.getItem(STORAGE_KEY);
  return text ? JSON.parse(text) : null;
}

export function clearLocal(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** The world in the page's hash, if there is one. */
export async function fromHash(hash: string): Promise<unknown> {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get(HASH_KEY);
  return encoded ? decodeWorld(encoded) : null;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
