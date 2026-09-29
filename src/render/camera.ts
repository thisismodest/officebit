// A 2D camera over the world (docs/RENDERING.md#camera). Positions are world
// pixels; the view size is CSS pixels. `zoom` is where the camera is heading;
// `scale` is what's on screen, easing towards it so zooming feels smooth.
/** Half size, for seeing a whole town at once. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
/** How much of the world always stays on screen when you drag it away, CSS px: enough to grab it back. */
const GRAB = 64;
/** Visiting somewhere this small (its share of the view, on its longer side) zooms in, to fill no more than FILL_TO. */
const FILL_BELOW = 0.5;
const FILL_TO = 0.75;
/** A fling slows by this time constant (ms), and stops below this speed (CSS px per ms). */
const FLING_FRICTION = 325;
const FLING_STOP = 0.02;
/** Zoom easing time constant, ms. */
const ZOOM_EASE = 55;

interface Anchor {
  /** World point that should stay under… */
  wx: number;
  wy: number;
  /** …this view point while the zoom eases. */
  vx: number;
  vy: number;
}

export class Camera {
  /** World pixel at the top-left of the view. */
  x = 0;
  y = 0;
  /** Target zoom: CSS pixels per world pixel. */
  zoom = 3;
  /** The zoom you picked (by hand, or the first look at a world). Visits start from it; zooming in for a small place doesn't change it. */
  private chosen = 3;
  /** Device pixels per CSS pixel. Zoom steps land on whole device pixels, so pixel art stays crisp. */
  pixelRatio = 1;
  /** Person id the camera is tracking, if any. */
  following: string | null = null;
  viewW = 0;
  viewH = 0;
  /** CSS px along the bottom of the view hidden behind something (a profile sliding up on a phone). Centring aims above it. */
  insetBottom = 0;
  worldW = 0;
  worldH = 0;
  private shown = 3;
  private anchor: Anchor | null = null;
  /** Momentum after a flick, in CSS px per ms. */
  private fling: { vx: number; vy: number } | null = null;

  /** The zoom actually on screen right now. */
  get scale(): number {
    return this.shown;
  }

  /** Smallest zoom change that keeps pixels crisp. */
  get step(): number {
    return 1 / this.pixelRatio;
  }

  /** Visible area in world pixels. */
  get width(): number {
    return this.viewW / this.shown;
  }

  get height(): number {
    return this.viewH / this.shown;
  }

  resize(viewW: number, viewH: number): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    this.viewW = viewW;
    this.viewH = viewH;
    this.centerOn(cx, cy);
  }

  /**
   * Point the camera at a new world. By default, zoom a notch closer than
   * "fit", so there's something to explore. With `keepZoom`, keep the zoom you
   * had, unless the world would be lost in the middle of the view: then zoom in
   * until it fills about three quarters of it.
   */
  setWorld(worldW: number, worldH: number, keepZoom = false): void {
    this.worldW = worldW;
    this.worldH = worldH;
    if (!keepZoom) this.zoom = this.chosen = this.quantise(Math.floor(Math.min(this.viewW / worldW, this.viewH / worldH)) + 1);
    else {
      this.zoom = this.chosen;
      if (this.fill(this.zoom) < FILL_BELOW) {
        const fits = this.levels().filter((z) => z > this.zoom && this.fill(z) <= FILL_TO);
        if (fits.length) this.zoom = fits.at(-1)!;
      }
    }
    this.shown = this.zoom;
    this.anchor = null;
    this.centerOn(worldW / 2, worldH / 2);
  }

  /** Where the camera is, to come back to. */
  snapshot(): { x: number; y: number; zoom: number } {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** Put the camera back exactly where a snapshot was, with no easing. */
  restore(view: { x: number; y: number; zoom: number }): void {
    this.zoom = this.chosen = this.shown = this.quantise(view.zoom);
    this.anchor = null;
    this.fling = null;
    this.x = view.x;
    this.y = view.y;
    this.clamp();
  }

  /** Let go mid-drag at this speed (CSS px per ms): the view carries on, slowing down. */
  flingAt(vx: number, vy: number): void {
    this.fling = Math.hypot(vx, vy) > FLING_STOP ? { vx, vy } : null;
  }

  /** Stop gliding (a new press, a zoom, following someone). */
  stopFling(): void {
    this.fling = null;
  }

  get flinging(): boolean {
    return this.fling !== null;
  }

  /** Pan by a drag delta in CSS pixels. */
  panBy(dx: number, dy: number): void {
    this.x -= dx / this.shown;
    this.y -= dy / this.shown;
    if (this.anchor) {
      this.anchor.wx -= dx / this.shown;
      this.anchor.wy -= dy / this.shown;
    }
    this.clamp();
  }

  /** Zoom to `next`, keeping the world point under (viewX, viewY) fixed. While following someone, zoom on them instead. */
  zoomAt(next: number, viewX = this.viewW / 2, viewY = this.viewH / 2): void {
    const zoom = this.quantise(next);
    if (zoom === this.zoom) return;
    this.fling = null;
    this.zoom = this.chosen = zoom;
    if (this.following) {
      // The follow keeps them centred; an anchor elsewhere would fight it.
      this.anchor = null;
      return;
    }
    const { x, y } = this.toWorld(viewX, viewY);
    this.anchor = { wx: x, wy: y, vx: viewX, vy: viewY };
  }

  /**
   * Mid-pinch: exactly this zoom, straight away (no easing, no snapping to
   * crisp steps), with the world point (wx, wy) under the view point (vx, vy),
   * so the map follows your fingers like a photo. While following someone,
   * it zooms on them.
   */
  pinchTo(zoom: number, wx: number, wy: number, vx: number, vy: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.fling = null;
    this.anchor = null;
    this.zoom = this.shown = z;
    if (this.following) return;
    this.x = wx - vx / z;
    this.y = wy - vy / z;
    this.clamp();
  }

  /** The pinch is over: ease onto the nearest crisp zoom, about the point where it ended. */
  settle(vx = this.viewW / 2, vy = this.viewH / 2): void {
    const crisp = this.quantise(this.zoom);
    this.chosen = crisp;
    if (crisp === this.zoom) return;
    this.zoom = crisp;
    const { x, y } = this.toWorld(vx, vy);
    if (!this.following) this.anchor = { wx: x, wy: y, vx, vy };
  }

  /** One zoom step in or out (`direction` ±1). */
  zoomBy(direction: number, viewX?: number, viewY?: number): void {
    const levels = this.levels();
    const i = levels.indexOf(this.zoom);
    const next = levels[Math.min(levels.length - 1, Math.max(0, i + Math.sign(direction)))]!;
    this.zoomAt(next, viewX, viewY);
  }

  /** Every zoom the camera can stop at: an overview, then whole steps (halves on high-DPI screens). */
  levels(): number[] {
    const steps = Array.from({ length: (MAX_ZOOM - 1) * this.pixelRatio + 1 }, (_, i) => 1 + i * this.step);
    return [MIN_ZOOM, ...steps.filter((z) => z > MIN_ZOOM)];
  }

  centerOn(wx: number, wy: number): void {
    this.anchor = null;
    this.fling = null;
    this.x = wx - this.width / 2;
    this.y = wy - this.seenHeight / 2;
    this.clamp();
  }

  /** How much of the view's height is actually visible, in world pixels. */
  private get seenHeight(): number {
    return Math.max(1, this.viewH - this.insetBottom) / this.shown;
  }

  /** Ease towards centring on a point; `dt` in ms. */
  glideTo(wx: number, wy: number, dt: number): void {
    this.anchor = null;
    this.fling = null;
    const t = 1 - Math.exp(-dt / 180);
    this.x += (wx - this.width / 2 - this.x) * t;
    this.y += (wy - this.seenHeight / 2 - this.y) * t;
    this.clamp();
  }

  /** Advance the zoom animation and any fling; `dt` in ms. */
  update(dt: number): void {
    if (this.fling) {
      const { vx, vy } = this.fling;
      this.panBy(vx * dt, vy * dt);
      const decay = Math.exp(-dt / FLING_FRICTION);
      this.fling = Math.hypot(vx, vy) * decay > FLING_STOP ? { vx: vx * decay, vy: vy * decay } : null;
    }
    if (this.shown === this.zoom) return;
    // Without an anchor, zoom about the middle of the view.
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    this.shown += (this.zoom - this.shown) * (1 - Math.exp(-dt / ZOOM_EASE));
    if (Math.abs(this.zoom - this.shown) < 0.005) this.shown = this.zoom;
    if (!this.anchor) {
      this.x = cx - this.width / 2;
      this.y = cy - this.height / 2;
      this.clamp();
    } else {
      const { wx, wy, vx, vy } = this.anchor;
      this.x = wx - vx / this.shown;
      this.y = wy - vy / this.shown;
      this.clamp();
    }
    if (this.shown === this.zoom) this.anchor = null;
  }

  toWorld(viewX: number, viewY: number): { x: number; y: number } {
    return { x: this.x + viewX / this.shown, y: this.y + viewY / this.shown };
  }

  toView(worldX: number, worldY: number): { x: number; y: number } {
    return { x: (worldX - this.x) * this.shown, y: (worldY - this.y) * this.shown };
  }

  /** How much of the view the world takes up at `zoom`, on its longer side (1 is edge to edge). */
  private fill(zoom: number): number {
    return Math.max((this.worldW * zoom) / this.viewW, (this.worldH * zoom) / this.viewH);
  }

  /** The nearest zoom level to `zoom`. */
  private quantise(zoom: number): number {
    return this.levels().reduce((best, z) => (Math.abs(z - zoom) < Math.abs(best - zoom) ? z : best));
  }

  private clamp(): void {
    const grab = GRAB / this.shown;
    this.x = clampAxis(this.x, this.width, this.worldW, grab);
    this.y = clampAxis(this.y, this.height, this.worldH, grab);
  }
}

/** The world can be dragged nearly off the view, but at least `grab` of it (or all of it, if smaller) stays in sight. */
function clampAxis(pos: number, view: number, world: number, grab: number): number {
  const keep = Math.min(grab, world, view);
  return Math.min(Math.max(pos, keep - view), world - keep);
}
