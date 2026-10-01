// The weather on screen (docs/RENDERING.md): rain or snow falling over the
// town, a greyer light under cloud, and snow lying on the grass after it's
// fallen. Drawn from sim/weather.ts; never touches the story.
import type { Grid } from '../sim/grid.ts';
import type { Weather } from '../sim/weather.ts';
import type { LevelDef } from '../sim/world.ts';
import { TILE, type Ctx } from './pixels.ts';

/** Drops (or flakes) per 100×100 screen pixels at the heaviest, and how fast they fall (screen px a second). */
const DENSITY = { rain: 16, snow: 5 };
const FALL = { rain: 900, snow: 70 };
/** Under cloud: the grey laid over the town, at its greyest (wet), and a grey sky without rain. */
const GLOOM = 'rgb(55, 62, 78)';
const GLOOM_WET = 0.32;
const GLOOM_GREY = 0.1;

/** Rain or snow falling, over the whole canvas (screen pixels), and the gloom under the cloud. `time` is ms, for the motion. */
export function paintSky(ctx: Ctx, weather: Weather, time: number, scale: number): void {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gloom = weather.sky === 'clear' ? 0 : weather.wet > 0 ? GLOOM_WET * weather.wet : GLOOM_GREY;
  if (gloom > 0) {
    ctx.globalAlpha = gloom;
    ctx.fillStyle = GLOOM;
    ctx.fillRect(0, 0, width, height);
  }
  if (weather.sky === 'rain' || weather.sky === 'snow') {
    const kind = weather.sky;
    const count = Math.round(((width * height) / 10000) * DENSITY[kind] * weather.wet);
    const t = time / 1000;
    ctx.globalAlpha = kind === 'rain' ? 0.6 : 0.9;
    ctx.fillStyle = kind === 'rain' ? '#dde8f6' : '#ffffff';
    const size = Math.max(1, Math.round(scale));
    for (let i = 0; i < count; i++) {
      // Each drop has its own place across, speed and start, and falls down the screen round and round.
      const [a, b, c] = [hash(i, 1), hash(i, 2), hash(i, 3)];
      const speed = FALL[kind] * (0.75 + 0.5 * c) * Math.max(1, scale / 2);
      const y = (b * height + t * speed) % (height + 20);
      // Rain slants; snow drifts from side to side.
      const drift = kind === 'rain' ? y * 0.25 : Math.sin(t * (0.6 + c) + i) * 12 * size;
      const x = (((a * width + drift) % width) + width) % width;
      if (kind === 'rain') ctx.fillRect(Math.round(x), Math.round(y), size, size * 9);
      else ctx.fillRect(Math.round(x), Math.round(y), size * 2, size * 2);
    }
  }
  ctx.restore();
}

/** A level's grass under snow, to lay over its ground (world pixels): white, with a few speckles of grass showing through. */
export function snowLayer(level: LevelDef, grid: Grid): HTMLCanvasElement {
  const [w, h] = level.size;
  const canvas = document.createElement('canvas');
  canvas.width = w * TILE;
  canvas.height = h * TILE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (level.rooms[grid.room[y * w + x]!]?.floor !== 'grass') continue;
      ctx.fillStyle = '#eef3f8';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = '#d6dfea';
      for (let k = 0; k < 3; k++) ctx.fillRect(x * TILE + Math.floor(hash(x * 31 + y, k) * TILE), y * TILE + Math.floor(hash(y * 17 + x, k + 5) * TILE), 2, 1);
    }
  }
  return canvas;
}

/** A steady 0–1 number for a drop, or a tile. */
function hash(i: number, salt: number): number {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
