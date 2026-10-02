// Vehicles (docs/RENDERING.md#sprites): seen from above, a little from the
// front. Every kind (a car, a food truck on the move, the bus) is a look in
// VEHICLES, keyed like the sim's MOVERS: its size, colours, and the rectangles
// that draw it side on and end on. One painter draws them all; a new vehicle
// is a new look. One sprite per look, colours and direction, cached; lights are
// drawn separately, at night.
import type { Heading } from "../sim/movement.ts";
import { OUTLINE, shade } from "./palette.ts";
import { TILE, canvas, rect, type Ctx } from "./pixels.ts";

/** A car's paint jobs, one picked by its look (0–1). */
const PAINT = ["#c8453a", "#3f5a7a", "#e8dcc4", "#2f2b36", "#e7aa2e", "#4f6b3a", "#9fb3c8", "#a07a9a"];
const GLASS = "#8fb0cc";
const HEADLIGHT = "#fff6c4";
const TAIL_LIGHT = "#ff5d5d";

/**
 * A vehicle's size, in pixels: its length and height side on, and its width
 * end on. Side on it stands on its lane: `wheelsBelow` is how far below the foot
 * of the lane (its lower edge on screen) its wheels are, so more moves it down
 * the screen and less (or negative) up. End on it's centred across the lane.
 */
interface Size {
  length: number;
  height: number;
  width: number;
  wheelsBelow: number;
}

/** A vehicle's colours: its body, and a band (a stripe, a sign), from which the rest are shaded. */
export interface Colours {
  body: string;
  band: string;
}

/** What a part is painted in: a role (worked out from the colours) or a colour of its own. */
type Paint = "shadow" | "outline" | "body" | "highlight" | "cabin" | "door" | "hatch" | "band" | "glass" | "darkGlass" | "tyre" | "headlamp" | "taillamp" | `#${string}`;

/**
 * A coordinate in a part. Positions count from the near edge (0 is the left or
 * top), or from the far edge if negative (-3: three in from the right or
 * bottom); sizes are in pixels, or if zero or negative the whole length less
 * that much (-2: two short of it). End on, a pair is [driving away, coming
 * towards], where the two differ.
 */
type At = number | [away: number, towards: number];

/** One rectangle of a vehicle: where, how big, and in what. `centred`: x is from the middle. `every: [step, until]`: repeated every `step` px along, while it starts more than `until` from the end (a row of windows). */
type Part = [x: At, y: At, w: At, h: At, paint: Paint, options?: { centred?: boolean; every?: [step: number, until: number] }];

/** A kind of vehicle. Side on, parts are drawn facing left (and mirrored facing right); end on, facing away or towards. */
export interface Look {
  size: Size;
  /** Its colours, unless it's given its own (a car's paint job, a food truck's). */
  colours: Colours;
  side: Part[];
  end: Part[];
}

/** Every body starts with a soft shadow under it. */
const SHADOW: Part = [1, -2, -2, 2, "shadow"];

/** Long vehicles' shared end on: roof and its stripe, glass at whichever end we see, lamps at the corners. */
const LONG_END: Part[] = [
  SHADOW,
  [0, 0, 0, -2, "outline"],
  [1, 1, -2, -4, "body"],
  [1, 1, 1, -4, "highlight"],
  [2, 5, -4, -14, "cabin"],
  [-1, 6, 2, -16, "band", { centred: true }],
  [2, [2, -11], -4, 5, "glass"],
  [1, [1, -6], 2, 2, "headlamp"],
  [-3, [1, -6], 2, 2, "headlamp"],
  [1, [-6, 1], 2, 2, "taillamp"],
  [-3, [-6, 1], 2, 2, "taillamp"],
];

/** Long vehicles side on, around what's down their middles: a tall box, a coloured band low down, windscreen, lamps and wheels. */
const longSide = (middle: Part[]): Part[] => [
  SHADOW,
  [0, 0, 0, -3, "outline"],
  [1, 1, -2, -5, "body"],
  [1, 1, -2, 2, "highlight"],
  [1, -11, -2, 3, "band"],
  ...middle,
  [1, 4, 5, -17, "glass"],
  [1, -6, 2, 2, "headlamp"],
  [-3, -6, 2, 2, "taillamp"],
  [7, -4, 7, 3, "tyre"],
  [-14, -4, 7, 3, "tyre"],
];

export type VehicleKind = "car" | "truck" | "bus" | "lorry" | "van" | "plane";

/** Every kind of vehicle, by the same names as the sim's movers (movement.ts). In scale with people (21px tall). */
export const VEHICLES: Record<VehicleKind, Look> = {
  // A car: well inside a 16px lane (at -2, centred in it), a cabin set back from the bonnet.
  car: {
    size: { length: 22, height: 12, width: 11, wheelsBelow: -2 },
    colours: { body: PAINT[0]!, band: PAINT[0]! },
    side: [
      SHADOW,
      [0, 3, 0, -5, "outline"],
      [1, 4, -2, -7, "body"],
      [1, 4, -2, 1, "highlight"],
      // Cabin: set back from the bonnet, with its two windows.
      [6, 0, 11, 5, "outline"],
      [7, 1, 9, 3, "cabin"],
      [8, 1, 3, 2, "glass"],
      [12, 1, 3, 2, "glass"],
      [1, 6, 2, 2, "headlamp"],
      [-3, 6, 2, 2, "taillamp"],
      [3, -3, 5, 2, "tyre"],
      [-8, -3, 5, 2, "tyre"],
    ],
    end: [
      SHADOW,
      [0, 0, 0, -2, "outline"],
      [1, 1, -2, -4, "body"],
      [1, 1, 1, -4, "highlight"],
      // Roof, windscreen at the front and a rear window at the back.
      [2, [4, 6], -4, 10, "cabin"],
      [2, [4, 13], -4, 3, "glass"],
      [2, [12, 6], -4, 2, "darkGlass"],
      [1, [1, -5], 2, 2, "headlamp"],
      [-3, [1, -5], 2, 2, "headlamp"],
      [1, [-5, 1], 2, 2, "taillamp"],
      [-3, [-5, 1], 2, 2, "taillamp"],
    ],
  },
  // A food truck driving to or from its pitch: hatch shut and a sign on the roof, in its own colours (it opens up into the stall once parked).
  truck: {
    size: { length: 40, height: 27, width: 15, wheelsBelow: -1 },
    colours: { body: "#e7aa2e", band: "#c8453a" },
    side: longSide([
      [13, 5, -17, -19, "hatch"],
      [13, 5, -17, 1, "outline"],
      [16, 2, -23, 2, "band"],
    ]),
    end: LONG_END,
  },
  // The delivery lorry (sim/deliveries.ts): a coloured cab up front and a tall white box behind, with the supplier's stripe along it.
  lorry: {
    size: { length: 42, height: 28, width: 15, wheelsBelow: -1 },
    colours: { body: "#f1eee6", band: "#2f5d7a" },
    side: longSide([
      [1, 1, 11, -5, "band"],
      [12, 1, 1, -5, "outline"],
      [16, 7, -20, 5, "band"],
    ]),
    end: LONG_END,
  },
  // The bus (sim/buses.ts): a green and cream single-decker, windows the length of it and the door up front; a bit wider than a van.
  bus: {
    size: { length: 52, height: 30, width: 16, wheelsBelow: -1 },
    colours: { body: "#2f8f5b", band: "#efe3c2" },
    side: longSide([
      [9, 5, 5, -19, "glass", { every: [7, 5] }],
      [7, 4, 1, -8, "outline"],
      [2, -14, 4, 3, "door"],
    ]),
    end: LONG_END,
  },
  // The parcel van (sim/parcels.ts): a white panel van with the depot's red stripe, taller than a car.
  van: {
    size: { length: 28, height: 18, width: 13, wheelsBelow: -2 },
    colours: { body: "#f1eee6", band: "#c8453a" },
    side: [
      SHADOW,
      [0, 0, 0, -3, "outline"],
      [1, 1, -2, -5, "body"],
      [1, 1, -2, 1, "highlight"],
      [1, -9, -2, 2, "band"],
      [1, 3, 6, 5, "glass"],
      [8, 1, 1, -5, "outline"],
      [1, -6, 2, 2, "headlamp"],
      [-3, -6, 2, 2, "taillamp"],
      [3, -3, 5, 2, "tyre"],
      [-8, -3, 5, 2, "tyre"],
    ],
    end: [
      SHADOW,
      [0, 0, 0, -2, "outline"],
      [1, 1, -2, -4, "body"],
      [1, 1, 1, -4, "highlight"],
      [-1, 4, 2, -10, "band", { centred: true }],
      [2, [2, -9], -4, 4, "glass"],
      [1, [1, -5], 2, 2, "headlamp"],
      [-3, [1, -5], 2, 2, "headlamp"],
      [1, [-5, 1], 2, 2, "taillamp"],
      [-3, [-5, 1], 2, 2, "taillamp"],
    ],
  },
  // The little plane (sim/planes.ts), seen from above, whichever way it's facing: wings across it, broad by the
  // fuselage and slim to the tips, the tailplane and the fin (a line, from above) at the back, the propeller at the
  // nose. It's furniture too, standing on its stand (render/props/airfield.ts draws it with this).
  plane: {
    size: { length: 56, height: 44, width: 56, wheelsBelow: 0 },
    colours: { body: "#f2f1ec", band: "#c8453a" },
    side: [
      // Wings and tailplane, under the fuselage.
      [22, 2, 9, -4, "outline"],
      [20, 16, 13, 12, "outline"],
      [23, 3, 7, -6, "#e6e4dc"],
      [21, 17, 11, 10, "#e6e4dc"],
      [23, 3, 1, -6, "highlight"],
      [45, 13, 8, 18, "outline"],
      [46, 14, 6, 16, "#e6e4dc"],
      // The fuselage, its stripe and the cockpit, the nose and its propeller, and the fin along the tail.
      [2, 18, -4, 8, "outline"],
      [3, 19, -6, 6, "body"],
      [3, 19, -6, 1, "highlight"],
      [8, 22, -14, 2, "band"],
      [6, 19, 5, 6, "darkGlass"],
      [0, 20, 3, 4, "outline"],
      [1, 21, 2, 2, "#9aa2ab"],
      [0, 14, 1, 16, "#5b6270"],
      [44, 21, 10, 2, "band"],
    ],
    end: [
      [-6, 4, 12, -8, "shadow", { centred: true }],
      // The fuselage, nose towards you (or away), the tail at the far end.
      [-4, 2, 8, -4, "outline", { centred: true }],
      [-3, 3, 6, -6, "body", { centred: true }],
      [-1, [8, 10], 2, -20, "band", { centred: true }],
      [-3, [4, -12], 6, 6, "darkGlass", { centred: true }],
      // Wings across, broad by the fuselage and slim to the tips; the tailplane and fin at the back.
      [0, [24, 28], 0, 4, "outline"],
      [-15, [22, 26], 30, 8, "outline", { centred: true }],
      [1, [25, 29], -2, 2, "#e6e4dc"],
      [-14, [23, 27], 28, 6, "#e6e4dc", { centred: true }],
      [1, [25, 29], -2, 1, "highlight"],
      [-10, [46, 3], 20, 5, "outline", { centred: true }],
      [-9, [47, 4], 18, 3, "#e6e4dc", { centred: true }],
      [-1, [42, 2], 2, 12, "band", { centred: true }],
      // The propeller across the nose.
      [-8, [0, -2], 16, 2, "#5b6270", { centred: true }],
    ],
  },
};

const sprites = new Map<string, HTMLCanvasElement>();
/** Each sprite's size, for drawing it in the right place. */
const sizes = new WeakMap<HTMLCanvasElement, Size>();

/** A car's paint job, by its look (0–1). */
export function paintJob(look: number): Colours {
  const body = PAINT[Math.floor(look * PAINT.length) % PAINT.length]!;
  return { body, band: body };
}

/** A vehicle of this kind facing `heading`, in its own colours or these. */
export function vehicleSprite(kind: VehicleKind, heading: Heading, colours?: Partial<Colours>): HTMLCanvasElement {
  const look = VEHICLES[kind];
  const paint = { ...look.colours, ...colours };
  const key = `${kind}-${paint.body}-${paint.band}-${heading}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const across = heading === "left" || heading === "right";
    const { length, height, width } = look.size;
    const [w, h] = across ? [length, height] : [width, length];
    const { canvas: c, ctx } = canvas(w, h);
    paintParts(ctx, across ? look.side : look.end, w, h, paint, { mirror: heading === "right", away: heading === "up" });
    sprites.set(key, c);
    sizes.set(c, look.size);
    sprite = c;
  }
  return sprite;
}

/** Draw a vehicle's parts into a `w`×`h` sprite: side on mirrored if it faces right, end on as seen driving away or coming towards. */
function paintParts(ctx: Ctx, parts: readonly Part[], w: number, h: number, colours: Colours, view: View): void {
  for (const [x, y, rw, rh, paint] of rectsOf(parts, w, h, view)) rect(ctx, x, y, rw, rh, colourOf(paint, colours));
}

interface View {
  mirror: boolean;
  away: boolean;
}

/** Where each of a vehicle's parts goes in a `w`×`h` sprite, in pixels, in drawing order. */
export function rectsOf(parts: readonly Part[], w: number, h: number, view: View): [x: number, y: number, w: number, h: number, paint: Paint][] {
  const pick = (at: At) => (typeof at === "number" ? at : view.away ? at[0] : at[1]);
  // A position from the far edge if negative; a size short of the whole if zero or negative.
  const place = (at: At, whole: number) => (pick(at) < 0 ? whole + pick(at) : pick(at));
  const extent = (at: At, whole: number) => (pick(at) <= 0 ? whole + pick(at) : pick(at));
  const rects: [number, number, number, number, Paint][] = [];
  for (const [x, y, pw, ph, paint, options] of parts) {
    const [rw, rh] = [extent(pw, w), extent(ph, h)];
    const top = place(y, h);
    const first = options?.centred ? Math.floor(w / 2) + pick(x) : place(x, w);
    const at = (px: number) => rects.push([view.mirror ? w - px - rw : px, top, rw, rh, paint]);
    if (!options?.every) {
      at(first);
      continue;
    }
    const [step, until] = options.every;
    for (let px = first; px < w - until; px += step) at(px);
  }
  return rects;
}

/** Every rectangle of a kind of vehicle facing `heading`, in its sprite's pixels (for checking a look). */
export function partsOf(kind: VehicleKind, heading: Heading): { w: number; h: number; rects: ReturnType<typeof rectsOf> } {
  const look = VEHICLES[kind];
  const across = heading === "left" || heading === "right";
  const [w, h] = across ? [look.size.length, look.size.height] : [look.size.width, look.size.length];
  return { w, h, rects: rectsOf(across ? look.side : look.end, w, h, { mirror: heading === "right", away: heading === "up" }) };
}

function colourOf(paint: Paint, { body, band }: Colours): string {
  switch (paint) {
    case "shadow":
      return "rgba(20,14,30,0.25)";
    case "outline":
      return OUTLINE;
    case "body":
      return body;
    case "highlight":
      return shade(body, 0.25);
    case "cabin":
      return shade(body, 0.1);
    case "door":
      return shade(body, -0.3);
    case "hatch":
      return shade(body, -0.2);
    case "band":
      return band;
    case "glass":
      return GLASS;
    case "darkGlass":
      return shade(GLASS, -0.2);
    case "tyre":
      return "#1f1b24";
    case "headlamp":
      return "#e8dfae";
    case "taillamp":
      return "#b8433a";
    default:
      return paint;
  }
}

/** Where to draw any vehicle's sprite at tile (x, y), in world pixels: side on, standing on its lane by its `wheelsBelow`; end on, centred on it. */
export function vehicleOrigin(sprite: HTMLCanvasElement, x: number, y: number, heading: Heading): [number, number] {
  const across = heading === "left" || heading === "right";
  const left = Math.round(x * TILE + (TILE - sprite.width) / 2);
  const wheelsBelow = sizes.get(sprite)?.wheelsBelow ?? 0;
  return [left, across ? Math.round((y + 1) * TILE - sprite.height + wheelsBelow) : Math.round(y * TILE + (TILE - sprite.height) / 2)];
}

/** Its lights, lit, over the dark: headlights at the front, tail lights at the back. `[x, y]` is the sprite's origin. */
export function paintVehicleLights(ctx: Ctx, sprite: HTMLCanvasElement, [x, y]: [number, number], heading: Heading): void {
  const { width: w, height: h } = sprite;
  const lamps: Record<Heading, [front: [number, number][], back: [number, number][]]> = {
    left: [[[0, h - 6]], [[w - 2, h - 6]]],
    right: [[[w - 2, h - 6]], [[0, h - 6]]],
    up: [
      [
        [1, 0],
        [w - 3, 0],
      ],
      [
        [1, h - 3],
        [w - 3, h - 3],
      ],
    ],
    down: [
      [
        [1, h - 3],
        [w - 3, h - 3],
      ],
      [
        [1, 0],
        [w - 3, 0],
      ],
    ],
  };
  const [front, back] = lamps[heading];
  for (const [dx, dy] of front) rect(ctx, x + dx, y + dy, 2, 2, HEADLIGHT);
  for (const [dx, dy] of back) rect(ctx, x + dx, y + dy, 2, 2, TAIL_LIGHT);
}
