// Small drawing helpers shared by the art modules.
export const TILE = 16;

export type Ctx = CanvasRenderingContext2D;

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function dot(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

/** Filled rectangle with a 1px outline. */
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, outline: string): void {
  rect(ctx, x, y, w, h, outline);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

/** Rounded-corner filled rectangle (1px corner cut), for a softer pixel look. */
export function pill(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, outline?: string): void {
  if (outline) {
    rect(ctx, x + 1, y, w - 2, h, outline);
    rect(ctx, x, y + 1, w, h - 2, outline);
    rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  } else {
    rect(ctx, x + 1, y, w - 2, h, fill);
    rect(ctx, x, y + 1, w, h - 2, fill);
  }
}

export function canvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d')! };
}

/** Paint an ASCII sprite: each char is looked up in `colors`; '.' (or unmapped) is transparent. */
export function paintAscii(ctx: Ctx, rows: readonly string[], colors: Record<string, string>, x = 0, y = 0, mirror = false): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const color = colors[row[dx]!];
      if (color) dot(ctx, x + (mirror ? row.length - 1 - dx : dx), y + dy, color);
    }
  });
}
