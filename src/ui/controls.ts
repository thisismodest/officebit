// Camera input: drag to pan, wheel / pinch to zoom, click to pick things,
// and keyboard equivalents. Dragging stops following. A press can instead
// grab something (the editor moving furniture), which then gets the drag.
import type { Renderer } from '../render/renderer.ts';

/** Movement (CSS px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** A flick's speed is measured over the last this-many ms of the drag; a pause this long before letting go means no flick. */
const FLICK_WINDOW = 100;
const KEY_PAN = 48;
/** Wheel travel per zoom step: mouse notches, trackpad scrolls, trackpad pinches (ctrl+wheel). */
const WHEEL_STEP = { notch: 50, scroll: 24, pinch: 5 };
/** A pause this long (ms) starts a fresh wheel gesture. */
const WHEEL_IDLE = 160;
/** Minimum time between zoom steps (ms), so trackpad momentum doesn't run away. */
const WHEEL_INTERVAL = 45;

export interface ControlCallbacks {
  /** A click (not a drag) at a client-space point. */
  click(clientX: number, clientY: number): void;
  /** The pointer is hovering: return true if something clickable is under it. */
  hover(clientX: number, clientY: number): boolean;
  /** The camera moved or zoomed by hand. */
  changed(): void;
  /** A press: return a Grab to drag something other than the camera. */
  grab?(clientX: number, clientY: number): Grab | null;
}

/** Something being dragged: told where the pointer goes, then dropped (after a drag) or let go of (a plain click). */
export interface Grab {
  move(clientX: number, clientY: number): void;
  drop(clientX: number, clientY: number): void;
  release(): void;
}

export function attachControls(renderer: Renderer, callbacks: ControlCallbacks): void {
  const { canvas, camera } = renderer;
  const pointers = new Map<number, { x: number; y: number }>();
  let pressStart = { x: 0, y: 0 };
  let dragged = false;
  let pinchStart = 0;
  let grabbed: Grab | null = null;
  /** Recent pointer positions while dragging, for the speed of a flick. */
  let trail: { t: number; x: number; y: number }[] = [];
  let pinched = false;
  let pinchZoom = camera.zoom;
  /** The world point between your fingers when the pinch began: it stays between them. */
  let pinchAt = { x: 0, y: 0 };

  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const pinchMiddle = () => {
    const [a, b] = [...pointers.values()];
    return local({ clientX: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, clientY: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 });
  };
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Touching the map stops any glide.
    camera.stopFling();
    if (pointers.size === 1) {
      pressStart = { x: event.clientX, y: event.clientY };
      dragged = false;
      pinched = false;
      trail = [{ t: event.timeStamp, x: event.clientX, y: event.clientY }];
      grabbed = callbacks.grab?.(event.clientX, event.clientY) ?? null;
    }
    if (pointers.size === 2) {
      pinchStart = pinchDistance();
      pinchZoom = camera.scale;
      const mid = pinchMiddle();
      pinchAt = camera.toWorld(mid.x, mid.y);
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) {
      canvas.classList.toggle('clickable', callbacks.hover(event.clientX, event.clientY));
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      dragged = true;
      pinched = true;
      // Smooth, like zooming a photo: the zoom follows the fingers exactly, and so does the map.
      const mid = pinchMiddle();
      camera.pinchTo(pinchZoom * (pinchDistance() / (pinchStart || 1)), pinchAt.x, pinchAt.y, mid.x, mid.y);
      callbacks.changed();
      return;
    }

    if (!dragged) dragged = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) >= DRAG_THRESHOLD;
    if (grabbed) {
      if (dragged) grabbed.move(event.clientX, event.clientY);
      return;
    }
    if (dragged) {
      canvas.classList.add('dragging');
      camera.following = null;
      camera.panBy(dx, dy);
      trail.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
      trail = trail.filter((p) => event.timeStamp - p.t <= FLICK_WINDOW);
      callbacks.changed();
    }
  });

  const release = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    // A finger lifting off a pinch: settle on a crisp zoom where the fingers were.
    if (pointers.size === 2) {
      const mid = pinchMiddle();
      camera.settle(mid.x, mid.y);
      callbacks.changed();
    }
    pointers.delete(event.pointerId);
    canvas.classList.remove('dragging');
    if (grabbed) {
      const grab = grabbed;
      grabbed = null;
      // A pinch to zoom isn't a drag: whatever was grabbed is let go of, not dropped.
      if (dragged && !pinched && event.type === 'pointerup') return grab.drop(event.clientX, event.clientY);
      grab.release();
    }
    if (event.type === 'pointerup' && !dragged && pointers.size === 0) callbacks.click(event.clientX, event.clientY);
    // Let go of a quick drag and the map carries on, slowing down.
    if (event.type === 'pointerup' && dragged && !pinched && pointers.size === 0) flick(event.timeStamp);
  };
  const flick = (now: number) => {
    const first = trail[0];
    const last = trail.at(-1);
    if (!first || !last || last === first || now - last.t > FLICK_WINDOW / 2) return;
    const dt = Math.max(1, last.t - first.t);
    camera.flingAt((last.x - first.x) / dt, (last.y - first.y) / dt);
  };
  // A long press on the map is just a press: no menu.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Wheel travel accumulates into zoom steps. A pause or a change of direction
  // starts afresh, so leftover scroll never carries into the next gesture.
  let wheel = 0;
  let lastWheel = 0;
  let lastStep = 0;
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 33 : 1);
      if (event.timeStamp - lastWheel > WHEEL_IDLE || Math.sign(delta) !== Math.sign(wheel)) wheel = 0;
      lastWheel = event.timeStamp;
      wheel += delta;
      const step = event.ctrlKey ? WHEEL_STEP.pinch : Math.abs(delta) >= WHEEL_STEP.notch ? WHEEL_STEP.notch : WHEEL_STEP.scroll;
      if (Math.abs(wheel) < step || event.timeStamp - lastStep < WHEEL_INTERVAL) return;
      const at = local(event);
      camera.zoomBy(wheel < 0 ? 1 : -1, at.x, at.y);
      wheel = 0;
      lastStep = event.timeStamp;
      callbacks.changed();
    },
    { passive: false },
  );

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN, 0], a: [KEY_PAN, 0],
      ArrowRight: [-KEY_PAN, 0], d: [-KEY_PAN, 0],
      ArrowUp: [0, KEY_PAN], w: [0, KEY_PAN],
      ArrowDown: [0, -KEY_PAN], s: [0, -KEY_PAN],
    };
    const delta = pan[event.key];
    if (delta) {
      event.preventDefault();
      camera.following = null;
      camera.panBy(...delta);
    } else if (event.key === '+' || event.key === '=') {
      camera.zoomBy(1);
    } else if (event.key === '-' || event.key === '_') {
      camera.zoomBy(-1);
    } else if (event.key === 'Escape') {
      camera.following = null;
    } else if (event.key === 'f' && renderer.selected) {
      camera.following = renderer.selected;
    } else {
      return;
    }
    callbacks.changed();
  });
}
