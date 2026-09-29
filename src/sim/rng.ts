// Seeded PRNG (mulberry32). The sim must never touch Math.random, so a world's
// seed replays the same story everywhere.
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}

/** A 32-bit FNV-style hash of a string's characters, from a seed: a stable seed for something named. */
export function hashOf(text: string, seed: number): number {
  return [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), seed);
}
