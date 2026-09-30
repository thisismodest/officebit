// Character sprites: ASCII templates, palette-swapped per person and cached.
//
//   o outline  h hair  H hair shadow  L hair highlight  s skin  S skin shadow
//   e eye  t shirt  T shirt shadow  c collar  p trousers  b shoes
import { EYE, HAIR, OUTLINE, PANTS, SHIRT, SHOE, SKIN, shade } from "./palette.ts";
import { canvas, paintAscii, rect, type Ctx } from "./pixels.ts";

export type Facing = "up" | "down" | "left" | "right";
export type Pose = "stand" | "walkA" | "walkB" | "sitDesk" | "sitSofa" | "sleep" | "crawlA" | "crawlB";

export const SPRITE_W = 12;
export const SPRITE_H = 21;
/** Transparent rows above the head, for headphones and buns. */
const HEADROOM = 3;

export const HEAD = {
  front: [
    "...oooooo...",
    "..ohLLhhho..",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".ohssssssho.",
    ".osssssssso.",
    ".ossessesso.",
    ".oSssssssSo.",
    "..ooSSSSoo.."
  ],
  back: [
    "...oooooo...",
    "..ohLLhhho..",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".oHhhhhhhHo.",
    "..ooSSSSoo.."
  ],
  side: [
    "...ooooo....",
    "..ohLLhhoo..",
    ".ohhhhhhhho.",
    ".ohhhhhhhho.",
    ".ohhhhsssso.",
    ".ohhhssssso.",
    ".ohhssssseso",
    ".ohSsssssso.",
    "..ooSSSSoo.."
  ]
};

export const BODY = {
  front: [".otttccttto.", "otttttttttto", "otTttttttTto", "osTttttttTso", ".oppppppppo."],
  side: ["..otttttto..", "..otttTtto..", "..ottTTtto..", "..ottsStto..", "..oppppppo.."]
};

export const LEGS = {
  front: {
    stand: ["..oppooppo..", "..oppooppo..", "..obboobbo..", "...oo..oo..."],
    walk: ["..oppooppo..", "..oppoobbo..", "..obbo.oo...", "...oo......."],
    sofa: [".oppppppppo.", "..obboobbo.."]
  },
  side: {
    stand: ["...oppppo...", "...oppppo...", "...obbbbbo..", "....ooooo..."],
    walk: ["..oppppppo..", ".oppo..oppo.", ".obbo..obbbo", "..oo....ooo."]
  }
};

/** A baby on hands and knees, under a head held low: two frames of a crawl, front-on and side-on (facing right). */
const CRAWL = {
  front: [
    ["..otttttto..", ".osttttttso.", ".oo.oppo.oo.", "....o..o...."],
    ["..otttttto..", ".osttttttso.", "..oo.pp.oo..", "...o....o..."]
  ],
  side: [
    ["otttttttso..", "otTtttttoo..", ".oppo.os....", ".obbo..o...."],
    ["otttttttso..", "otTttttto...", "..oppo.so...", "..obbo..o..."]
  ]
};

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  /** 0 short · 1 long · 2 bun */
  style: number;
  pants: number;
  /** Department colour for their lanyard badge, if any. */
  badge?: string;
  /** Hard hat and hi-vis, for building crews. */
  hiVis?: boolean;
  /** A shorter body and legs. */
  child?: boolean;
}

/** How much shorter children are, in pixels: two rows of body and one of leg. */
const CHILD_DROP = 3;
const childBody = (rows: readonly string[]) => rows.filter((_, i) => i !== 1 && i !== 2);
const childLegs = (rows: readonly string[]) => rows.filter((_, i) => i !== 1);

const cache = new Map<string, HTMLCanvasElement>();

export function characterSprite(look: Look, facing: Facing, pose: Pose, headphones: boolean): HTMLCanvasElement {
  const key = `${look.skin}.${look.hair}.${look.shirt}.${look.style}.${look.pants}.${look.badge}.${look.hiVis}.${look.child}|${facing}|${pose}|${headphones}`;
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = build(look, facing, pose, headphones);
    cache.set(key, sprite);
  }
  return sprite;
}

function build(look: Look, facing: Facing, pose: Pose, headphones: boolean): HTMLCanvasElement {
  const { canvas: c, ctx } = canvas(SPRITE_W, SPRITE_H);
  const skin = SKIN[look.skin] ?? SKIN[0]!;
  const hair = HAIR[look.hair] ?? HAIR[0]!;
  const shirt = SHIRT[look.shirt] ?? SHIRT[0]!;
  const pants = PANTS[look.pants] ?? PANTS[0]!;
  const colors: Record<string, string> = {
    o: OUTLINE,
    h: hair,
    H: shade(hair, -0.25),
    L: shade(hair, 0.3),
    s: skin,
    S: shade(skin, -0.15),
    e: EYE,
    t: shirt,
    T: shade(shirt, -0.22),
    c: shade(shirt, 0.3),
    p: pants,
    b: SHOE
  };

  if (pose === "sleep") {
    // Just a head on the pillow, eyes shut; the duvet is part of the bed.
    const y0 = HEADROOM + 7;
    paintAscii(ctx, HEAD.front, { ...colors, e: shade(skin, -0.35) }, 0, y0);
    return c;
  }

  const view = facing === "down" ? "front" : facing === "up" ? "back" : "side";
  const mirror = facing === "left";

  if (pose === "crawlA" || pose === "crawlB") {
    const y0 = SPRITE_H - 13;
    paintAscii(ctx, HEAD[view], colors, 0, y0, mirror);
    paintAscii(ctx, CRAWL[view === "side" ? "side" : "front"][pose === "crawlA" ? 0 : 1]!, colors, 0, y0 + 9, mirror);
    return c;
  }
  const y0 = HEADROOM + (look.child ? CHILD_DROP : 0) + (pose === "sitDesk" ? 2 : pose === "sitSofa" ? 1 : 0);
  const body = (rows: readonly string[]) => (look.child ? childBody(rows) : rows);
  const legRows = (rows: readonly string[]) => (look.child ? childLegs(rows) : rows);
  const legsAt = y0 + 9 + body(BODY.front).length;

  if (look.style === 1) longHairBehind(ctx, view, mirror, hair, y0);
  if (look.style === 2) bun(ctx, view, mirror, hair, y0);

  paintAscii(ctx, HEAD[view], colors, 0, y0, mirror);
  paintAscii(ctx, body(view === "side" ? BODY.side : BODY.front), colors, 0, y0 + 9, mirror);

  if (pose === "sitSofa" && view === "front") {
    paintAscii(ctx, LEGS.front.sofa, colors, 0, legsAt);
  } else if (pose !== "sitDesk") {
    const legs = view === "side" ? LEGS.side : LEGS.front;
    const walking = pose === "walkA" || pose === "walkB";
    // Front/back walk cycles alternate legs by mirroring; side view has one stride.
    const flip = view === "side" ? mirror : pose === "walkB";
    paintAscii(ctx, legRows(walking ? legs.walk : legs.stand), colors, 0, legsAt, flip);
  }

  if (look.style === 1) longHairFront(ctx, view, mirror, hair, y0);
  if (look.badge) paintBadge(ctx, view, mirror, look.badge, y0);
  if (look.hiVis) paintHiVis(ctx, view, y0);
  if (headphones) paintHeadphones(ctx, view, mirror, y0);
  return c;
}

/** A yellow hard hat and reflective stripes across the vest. */
function paintHiVis(ctx: Ctx, view: string, y0: number): void {
  const hat = "#f3c969";
  rect(ctx, 2, y0 - 1, 8, 3, OUTLINE);
  rect(ctx, 3, y0 - 1, 6, 2, hat);
  rect(ctx, view === "side" ? 2 : 1, y0 + 1, 10, 1, shade(hat, -0.25));
  const [from, to] = view === "side" ? [3, 8] : [1, 10];
  rect(ctx, from, y0 + 11, to - from + 1, 1, "#f4f4f4");
}

/** Lanyard and a department-coloured badge on the chest. */
function paintBadge(ctx: Ctx, view: string, mirror: boolean, color: string, y0: number): void {
  const strap = shade(color, -0.35);
  if (view === "front") {
    px(ctx, 4, y0 + 9, mirror, strap);
    px(ctx, 7, y0 + 9, mirror, strap);
    px(ctx, 5, y0 + 10, mirror, strap);
    px(ctx, 6, y0 + 10, mirror, strap);
    rect(ctx, 5, y0 + 11, 2, 2, color);
    px(ctx, 5, y0 + 11, mirror, "#ffffff");
  } else if (view === "side") {
    px(ctx, 6, y0 + 9, mirror, strap);
    px(ctx, 7, y0 + 10, mirror, strap);
    px(ctx, 7, y0 + 11, mirror, color);
    px(ctx, 7, y0 + 12, mirror, color);
  } else {
    px(ctx, 4, y0 + 9, mirror, strap);
    px(ctx, 7, y0 + 9, mirror, strap);
  }
}

function px(ctx: Ctx, x: number, y: number, mirror: boolean, color: string): void {
  rect(ctx, mirror ? SPRITE_W - 1 - x : x, y, 1, 1, color);
}

function longHairBehind(ctx: Ctx, view: string, mirror: boolean, hair: string, y0: number): void {
  if (view !== "back") return;
  for (let y = 8; y <= 11; y++) {
    px(ctx, 1, y0 + y, mirror, OUTLINE);
    px(ctx, 10, y0 + y, mirror, OUTLINE);
    for (let x = 2; x <= 9; x++) px(ctx, x, y0 + y, mirror, y === 11 ? shade(hair, -0.25) : hair);
  }
  for (let x = 2; x <= 9; x++) px(ctx, x, y0 + 12, mirror, OUTLINE);
}

function longHairFront(ctx: Ctx, view: string, mirror: boolean, hair: string, y0: number): void {
  const dark = shade(hair, -0.25);
  if (view === "front") {
    for (let y = 4; y <= 10; y++) {
      for (const x of [1, 10]) px(ctx, x, y0 + y, mirror, y === 10 ? dark : hair);
      px(ctx, 0, y0 + y, mirror, OUTLINE);
      px(ctx, 11, y0 + y, mirror, OUTLINE);
    }
    px(ctx, 1, y0 + 11, mirror, OUTLINE);
    px(ctx, 10, y0 + 11, mirror, OUTLINE);
  } else if (view === "side") {
    for (let y = 4; y <= 10; y++) {
      px(ctx, 0, y0 + y, mirror, OUTLINE);
      px(ctx, 1, y0 + y, mirror, hair);
      px(ctx, 2, y0 + y, mirror, y >= 9 ? dark : hair);
    }
    px(ctx, 1, y0 + 11, mirror, OUTLINE);
    px(ctx, 2, y0 + 11, mirror, OUTLINE);
  }
}

function bun(ctx: Ctx, view: string, mirror: boolean, hair: string, y0: number): void {
  const cx = view === "side" ? 3 : 4;
  for (let x = cx; x < cx + 4; x++) px(ctx, x, y0 - 3, mirror, OUTLINE);
  for (let x = cx; x < cx + 4; x++) px(ctx, x, y0 - 2, mirror, x === cx || x === cx + 3 ? OUTLINE : hair);
  for (let x = cx; x < cx + 4; x++) px(ctx, x, y0 - 1, mirror, x === cx || x === cx + 3 ? OUTLINE : shade(hair, -0.2));
}

function paintHeadphones(ctx: Ctx, view: string, mirror: boolean, y0: number): void {
  const band = "#e84855";
  const cup = "#b3263a";
  if (view === "side") {
    for (let x = 3; x <= 7; x++) px(ctx, x, y0 - 1, mirror, band);
    for (let y = 4; y <= 7; y++) for (let x = 4; x <= 6; x++) px(ctx, x, y0 + y, mirror, y === 4 || x === 4 ? band : cup);
    return;
  }
  for (let x = 3; x <= 8; x++) px(ctx, x, y0 - 1, mirror, band);
  px(ctx, 2, y0, mirror, band);
  px(ctx, 9, y0, mirror, band);
  for (let y = 4; y <= 7; y++) {
    for (const x of [0, 1]) px(ctx, x, y0 + y, mirror, x === 0 || y === 7 ? cup : band);
    for (const x of [10, 11]) px(ctx, x, y0 + y, mirror, x === 11 || y === 7 ? cup : band);
  }
}
