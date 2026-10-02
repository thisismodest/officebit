// Colours (docs/RENDERING.md). `look` indices in the world JSON point into
// SKIN / HAIR / SHIRT / FUR; room `floor` keys point into FLOORS.
export const SKIN = ['#f3cfb1', '#e0a883', '#c1845c', '#8d5a3b', '#5e3a26'];
export const HAIR = ['#2b1d18', '#6b3d1f', '#d9b25f', '#b0442f', '#9ea3ad', '#34406e', '#e27da3'];
export const SHIRT = ['#3f74b5', '#c8453a', '#e7aa2e', '#379463', '#7f4aa6', '#e4793a', '#1f9e95', '#44546a'];
export const PANTS = ['#34405e', '#3d3a38', '#5a4a3a', '#2f4c4a', '#4c3d5c'];
export const FUR = ['#d9a066', '#3b3136', '#f1ece3', '#8a5a3b', '#9ea3ad'];

export const OUTLINE = '#2a2033';
export const EYE = '#1b1422';
export const SHOE = '#3a2c2a';
export const BACKGROUND = '#1b1824';
export const NIGHT = '#141a3a';

export type FloorStyle =
  | { kind: 'carpet'; base: string }
  | { kind: 'tiles'; a: string; b: string }
  | { kind: 'wood'; a: string; b: string }
  | { kind: 'slabs'; base: string; size: number }
  | { kind: 'grass'; base: string }
  | { kind: 'road'; base: string }
  /** Two carriageways, each two lanes wide, with a central reservation. */
  | { kind: 'highway'; base: string }
  | { kind: 'runway'; base: string }
  /** A zebra crossing: stripes run with the traffic, so `across` is the way people walk over it. */
  | { kind: 'zebra'; base: string; across: 'ns' | 'ew' }
  /** Sand on a beach. */
  | { kind: 'sand'; base: string }
  /** Water: a river or canal, deep (`water`) or shallow enough to wade (`shallows`). */
  | { kind: 'water'; base: string }
  /** A bridge over water: planks running the way you cross (`across`), railings along its sides. */
  | { kind: 'bridge'; base: string; across: 'ns' | 'ew' };

export const FLOORS: Record<string, FloorStyle> = {
  carpetGrey: { kind: 'carpet', base: '#b8bfc6' },
  carpetBlue: { kind: 'carpet', base: '#9fb3c8' },
  carpetPurple: { kind: 'carpet', base: '#a07a9a' },
  carpetGreen: { kind: 'carpet', base: '#94b08c' },
  tiles: { kind: 'tiles', a: '#efe7d4', b: '#dccfb3' },
  checker: { kind: 'tiles', a: '#f4f1ea', b: '#34303c' },
  wood: { kind: 'wood', a: '#b9895a', b: '#a87a4c' },
  darkWood: { kind: 'wood', a: '#8a6446', b: '#7b583c' },
  stone: { kind: 'slabs', base: '#cfc8bb', size: 16 },
  concrete: { kind: 'slabs', base: '#a9adb2', size: 32 },
  path: { kind: 'slabs', base: '#c9c1b2', size: 8 },
  grass: { kind: 'grass', base: '#78a85a' },
  road: { kind: 'road', base: '#55535c' },
  highway: { kind: 'highway', base: '#4a4852' },
  runway: { kind: 'runway', base: '#45434c' },
  forecourt: { kind: 'slabs', base: '#8f9297', size: 32 },
  zebra: { kind: 'zebra', base: '#55535c', across: 'ns' },
  zebraSide: { kind: 'zebra', base: '#55535c', across: 'ew' },
  sand: { kind: 'sand', base: '#e3cf9a' },
  water: { kind: 'water', base: '#3d78a8' },
  shallows: { kind: 'water', base: '#62a2c4' },
  bridge: { kind: 'bridge', base: '#9b7451', across: 'ns' },
  bridgeSide: { kind: 'bridge', base: '#9b7451', across: 'ew' },
  jetty: { kind: 'bridge', base: '#8a6446', across: 'ns' },
};

export const DEFAULT_FLOOR: FloorStyle = FLOORS.carpetGrey!;

export const WALL = {
  cap: '#453d52',
  capLight: '#5b526c',
  capDark: '#2f293a',
  skirting: '#8a7c6e',
};

/** Mix a hex colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Stable pseudo-random 0–1 from integer coordinates, for texture noise. */
export function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Stable pseudo-random 0–1 from a string. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return hash(h, s.length);
}
