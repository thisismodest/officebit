// Game controls (docs/GAMES.md): the arrows or WASD and space or Enter, the on-screen joystick and A button, or a finger
// on the screen (a swipe for a direction, a tap where it lands). While a game's open it has the keys to itself.

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Key = Dir | 'a';

/** One frame's controls. */
export interface Input {
  /** Directions held down now. */
  held: ReadonlySet<Dir>;
  /** Pressed since the last frame (a swipe counts as a direction pressed). */
  pressed: ReadonlySet<Key>;
  /** Where a finger or the mouse is on the screen while it's down (screen pixels), and where it tapped this frame. */
  pointer: { x: number; y: number } | null;
  tap: { x: number; y: number } | null;
}

export const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Keys by where they are on the keyboard (`event.code`, so WASD is WASD on any layout, and a key lifted with Shift
 * down still matches the one pressed); by what they type, for keyboards that don't say where. */
const CODES: Record<string, Key> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'a',
  Enter: 'a',
  NumpadEnter: 'a',
};
const KEYS: Record<string, Key> = { ...CODES, w: 'up', s: 'down', a: 'left', d: 'right', ' ': 'a' };
/** A finger moved this far (CSS px) is a swipe, not a tap. */
const SWIPE = 18;

/** No controls at all (between frames, or in tests). */
export const NO_INPUT: Input = { held: new Set(), pressed: new Set(), pointer: null, tap: null };

export class GameControls {
  /** Directions held: keys down (by which key), and on-screen buttons pressed (by which finger). */
  private readonly keys = new Map<string, Dir>();
  private readonly fingers = new Map<number, Dir>();
  private readonly pressed = new Set<Key>();
  private pointer: { x: number; y: number } | null = null;
  private tap: { x: number; y: number } | null = null;
  private start: { x: number; y: number; swiped: boolean } | null = null;
  private attached = false;
  /** Escape: back out of the game. */
  onBack: () => void = () => {};

  private readonly keydown = (event: KeyboardEvent) => {
    // With ⌘ or Ctrl down, a Mac doesn't say when other keys come up: let go of everything rather than get stuck.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      this.letGo();
      return;
    }
    if (event.key === 'Escape') {
      this.stop(event);
      this.onBack();
      return;
    }
    const id = event.code || event.key;
    const key = CODES[event.code] ?? KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (!key) return;
    this.stop(event);
    if (key === 'a') {
      if (!event.repeat) this.pressed.add('a');
      return;
    }
    if (!this.keys.has(id)) this.pressed.add(key);
    this.keys.set(id, key);
  };
  private readonly keyup = (event: KeyboardEvent) => {
    this.keys.delete(event.code || event.key);
  };
  /** Away from the page (another app, another tab): the keys held come up without saying so. */
  private readonly letGo = () => {
    this.keys.clear();
    this.fingers.clear();
  };
  private readonly hidden = () => {
    if (document.hidden) this.letGo();
  };

  /** Take the keyboard (ahead of the town's own keys). */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    addEventListener('keydown', this.keydown, { capture: true });
    addEventListener('keyup', this.keyup, { capture: true });
    addEventListener('blur', this.letGo);
    document.addEventListener('visibilitychange', this.hidden);
  }

  detach(): void {
    this.attached = false;
    removeEventListener('keydown', this.keydown, { capture: true });
    removeEventListener('keyup', this.keyup, { capture: true });
    removeEventListener('blur', this.letGo);
    document.removeEventListener('visibilitychange', this.hidden);
    this.letGo();
    this.pressed.clear();
    this.pointer = this.tap = this.start = null;
  }

  /** On-screen buttons: any element inside `root` with `data-key` (up, down, left, right, a) is pressed while held. */
  buttons(root: HTMLElement): void {
    root.addEventListener('pointerdown', (event) => {
      // The button, wherever on it (its arrow, its border) the finger lands.
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-key]');
      const key = button?.dataset.key as Key | undefined;
      if (!button || !key) return;
      event.preventDefault();
      // Kept on the button if the finger slides off it (if the browser lets it: it says when it lets go, either way).
      try {
        button.setPointerCapture(event.pointerId);
      } catch {}
      this.pressed.add(key);
      if (key !== 'a') this.fingers.set(event.pointerId, key);
    });
    const lift = (event: PointerEvent) => this.fingers.delete(event.pointerId);
    root.addEventListener('pointerup', lift);
    root.addEventListener('pointercancel', lift);
    root.addEventListener('lostpointercapture', lift);
  }

  /** A screen (a canvas) you can tap and swipe on: `size` is its size in its own pixels. */
  screen(el: HTMLElement, size: () => { w: number; h: number }): void {
    const at = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const { w, h } = size();
      return { x: ((event.clientX - box.left) / box.width) * w, y: ((event.clientY - box.top) / box.height) * h };
    };
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      this.start = { x: event.clientX, y: event.clientY, swiped: false };
      this.pointer = at(event);
    });
    el.addEventListener('pointermove', (event) => {
      if (!this.start) return;
      this.pointer = at(event);
      const [dx, dy] = [event.clientX - this.start.x, event.clientY - this.start.y];
      if (Math.hypot(dx, dy) < SWIPE) return;
      // Each swipe is one press; a long drag goes on swiping from where it got to.
      this.pressed.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      this.start = { x: event.clientX, y: event.clientY, swiped: true };
    });
    const lift = (event: PointerEvent) => {
      if (this.start && !this.start.swiped && event.type === 'pointerup') this.tap = at(event);
      this.start = null;
      this.pointer = null;
    };
    el.addEventListener('pointerup', lift);
    el.addEventListener('pointercancel', lift);
  }

  /** This frame's controls; what was pressed is cleared for the next. */
  frame(): Input {
    const held = new Set<Dir>([...this.keys.values(), ...this.fingers.values()]);
    const input: Input = { held, pressed: new Set(this.pressed), pointer: this.pointer, tap: this.tap };
    this.pressed.clear();
    this.tap = null;
    return input;
  }

  private stop(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
