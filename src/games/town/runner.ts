// Playing a game out in the town (docs/GAMES.md#town-games): the game drawn over the map, a bar along the top (how it's
// going, the time, which way to go), and a joystick for fingers if it's a game you steer. The camera follows you, or is
// left to you if the game's about looking round. The map still zooms; a tap on it goes to the game (main.ts). A Live
// town carries on behind you; a Sandbox one waits till you're done. The town's story never knows.
import { FEET, type Renderer } from '../../render/renderer.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import type { Simulation } from '../../sim/sim.ts';
import type { Tile } from '../../sim/world.ts';
import { DELTA, GameControls, type Dir, type Input } from '../controls.ts';
import { joystick, pixelStar } from '../pixel.ts';

/** What a town game needs of the page: where to put its bar, the map, the town, and a way to hold the town still. */
export interface TownHost {
  stage: HTMLElement;
  renderer: Renderer;
  sim(): Simulation;
  /** Hold the town still if it's a sandbox (not if it's Live): returns how to let it go again. */
  hold(): () => void;
  /** Told when the game moves the camera's zoom, so the zoom buttons say so. */
  zoomed(): void;
}

/** A chip in the bar, one for each thing to do: its colour, and whether it's done (a parcel delivered, a ball caught). */
export interface Chip {
  colour: string;
  done: boolean;
  title: string;
}

/** What the bar shows: a word on what to do (and who, by id, for their picture), the chips, the time, and which way to go (tiles). */
export interface Bar {
  say?: string;
  who?: string;
  chips: Chip[];
  time: string;
  /** Something's just gone wrong (a crash): the time shows it. */
  alert?: boolean;
  /** From where (the middle of the view, if it doesn't say) to where. */
  way?: { from?: { x: number; y: number }; to: { x: number; y: number }; colour: string } | null;
}

/** A standing, front-facing sprite of someone from town, by id. */
export type Portrait = (id: string) => HTMLCanvasElement | null;

/** One go at a town game, as the runner plays it. */
export interface TownRound {
  /** On by `dt` seconds, with the town to look at (never to change). */
  step(input: Input, dt: number, sim: Simulation): void;
  /** What's in the town (a van, a stand-in), in world pixels, drawn with it so night darkens it too; `portrait` draws
   * anyone from town, by id (for a stand-in of them). */
  paint(ctx: Ctx, time: number, portrait: Portrait): void;
  /** The game's markers (rings, sparkles), over the town after dark too; `night`, 0 by day to 1 at midnight. */
  mark?(ctx: Ctx, time: number, night: number): void;
  /** Vehicles it drives (tiles, and which way they face), to light the road ahead after dark like the town's cars. */
  headlamps?(): { x: number; y: number; facing: Dir }[];
  readonly done: boolean;
  /** One to three, once it's done. */
  readonly stars: number;
  bar(): Bar;
  /** Where the camera follows (tiles), or null to leave it to the player (looking round to find something). */
  focus(): { x: number; y: number } | null;
  /** Said when it's done. */
  result(): string;
  /** A tap on the map (tiles), for games you play by tapping. */
  tap?(x: number, y: number, sim: Simulation): void;
}

/** A town game: its name in the bar, whether it's steered (the joystick), how close it wants the map (at least), and how
 * a round's set up from where it's started. */
export interface TownGameDef {
  title: string;
  pad: boolean;
  zoom?: number;
  plan(sim: Simulation, from: Tile, random: () => number): TownRound | null;
}

/** The longest a frame can be (s), so a hidden tab doesn't send things flying. */
const LONGEST_FRAME = 0.05;
/** How fast the arrows look round the map, in a game that leaves it to you (CSS px a second). */
const LOOK_SPEED = 500;

export class TownGame {
  private readonly host: TownHost;
  private readonly root: HTMLElement;
  private readonly controls = new GameControls();
  private def: TownGameDef | null = null;
  private round: TownRound | null = null;
  /** The done card's up for this round (it may finish between frames: on a tap). */
  private shownDone = false;
  private from: Tile = [0, 0];
  private release: (() => void) | null = null;
  private frameId = 0;
  private last = 0;
  private clock = 0;
  private readonly paint = (ctx: Ctx, level: string) => {
    if (this.round && level === this.host.sim().traffic.level) this.round.paint(ctx, this.clock, this.portrait);
  };
  private readonly headlamps = (level: string) => (this.round && level === this.host.sim().traffic.level ? (this.round.headlamps?.() ?? []) : []);
  private readonly mark = (ctx: Ctx, level: string) => {
    const sim = this.host.sim();
    if (this.round && level === sim.traffic.level) this.round.mark?.(ctx, this.clock, 1 - sim.daylight());
  };
  private readonly portrait: Portrait = (id) => {
    const who = this.host.sim().person(id);
    return who ? this.host.renderer.portrait(who) : null;
  };

  constructor(host: TownHost) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'town-game';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="town-game-bar mdst-card mdst-card--compact">
        <strong class="town-game-title"></strong>
        <span class="town-game-say"></span>
        <span class="town-game-chips"></span>
        <span class="town-game-time">0:00</span>
        <span class="town-game-way" aria-hidden="true">➤</span>
        <button type="button" class="mdst-button--sm mdst-button--ghost" data-action="quit" aria-label="Stop playing">✕</button>
      </div>
      <div class="town-game-pad pixel-pad" aria-label="Joystick">${joystick()}</div>
      <div class="town-game-done mdst-card" hidden>
        <p class="town-game-stars"></p>
        <p class="town-game-said"></p>
        <div class="town-game-actions">
          <button type="button" class="mdst-button--inverted" data-action="again">Play again</button>
          <button type="button" data-action="quit">Back to town</button>
        </div>
      </div>`;
    this.controls.buttons(this.root.querySelector('.town-game-pad')!);
    this.controls.onBack = () => this.stop();
    this.root.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'quit') this.stop();
      if (action === 'again') this.begin();
    });
    host.stage.append(this.root);
  }

  get playing(): boolean {
    return !this.root.hidden;
  }

  /** A town game from where it was started (its signpost): false if it can't be played from here. */
  start(def: TownGameDef, from: Tile): boolean {
    this.def = def;
    this.from = from;
    if (!this.begin()) return false;
    const { renderer } = this.host;
    renderer.showLevel(this.host.sim().traffic.level!);
    if (def.zoom && renderer.camera.zoom < def.zoom) {
      renderer.camera.zoomAt(def.zoom);
      this.host.zoomed();
    }
    renderer.overlays.push(this.paint);
    renderer.marks.push(this.mark);
    renderer.headlamps.push(this.headlamps);
    this.release = this.host.hold();
    this.root.querySelector('.town-game-title')!.textContent = def.title;
    this.root.querySelector<HTMLElement>('.town-game-pad')!.hidden = !def.pad;
    this.root.hidden = false;
    this.controls.attach();
    this.last = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
    return true;
  }

  /** A tap on the map while playing (screen coordinates): to the game, if it's played by tapping. */
  tap(clientX: number, clientY: number): void {
    const round = this.round;
    if (!round?.tap || round.done) return;
    const { x, y } = this.host.renderer.toWorld(clientX, clientY);
    round.tap(x / TILE - 0.5, y / TILE - 0.5, this.host.sim());
  }

  /** A fresh round (again, after the last). */
  private begin(): boolean {
    const round = this.def?.plan(this.host.sim(), this.from, Math.random);
    if (!round) return false;
    this.round = round;
    this.shownDone = false;
    this.root.querySelector<HTMLElement>('.town-game-done')!.hidden = true;
    const camera = this.host.renderer.camera;
    camera.following = null;
    const focus = round.focus() ?? { x: this.from[0], y: this.from[1] };
    camera.centerOn((focus.x + 0.5) * TILE, (focus.y + 0.5) * TILE);
    return true;
  }

  stop(): void {
    if (this.root.hidden) return;
    cancelAnimationFrame(this.frameId);
    this.controls.detach();
    const { overlays, marks, headlamps } = this.host.renderer;
    overlays.splice(overlays.indexOf(this.paint), 1);
    marks.splice(marks.indexOf(this.mark), 1);
    headlamps.splice(headlamps.indexOf(this.headlamps), 1);
    this.release?.();
    this.release = null;
    this.round = null;
    this.root.hidden = true;
  }

  private frame(now: number): void {
    const dt = Math.min(LONGEST_FRAME, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    const round = this.round;
    if (round) {
      const input = this.controls.frame();
      round.step(input, dt, this.host.sim());
      if (round.done && !this.shownDone) this.finished(round);
      const camera = this.host.renderer.camera;
      const focus = round.focus();
      if (focus) camera.glideTo((focus.x + 0.5) * TILE, (focus.y + 0.5) * TILE, dt * 1000);
      // Left to you: the arrows look round.
      else for (const way of input.held) camera.panBy(-DELTA[way][0] * LOOK_SPEED * dt, -DELTA[way][1] * LOOK_SPEED * dt);
      this.showBar(round.bar());
    }
    this.frameId = requestAnimationFrame((t) => this.frame(t));
  }

  private showBar(bar: Bar): void {
    const say = this.root.querySelector<HTMLElement>('.town-game-say')!;
    say.hidden = !bar.say;
    const said = `${bar.who ?? ''}|${bar.say ?? ''}`;
    if (say.dataset.said !== said) {
      say.dataset.said = said;
      const words = document.createElement('span');
      words.textContent = bar.say ?? '';
      const who = bar.who ? this.host.sim().person(bar.who) : undefined;
      say.replaceChildren(...(who ? [picture(this.host.renderer.portrait(who))] : []), words);
    }
    const chips = this.root.querySelector<HTMLElement>('.town-game-chips')!;
    const shown = bar.chips.map((c) => `${c.colour}${c.done}`).join();
    if (chips.dataset.shown !== shown) {
      chips.dataset.shown = shown;
      chips.replaceChildren(
        ...bar.chips.map((c) => {
          const chip = document.createElement('span');
          chip.className = 'town-game-chip';
          chip.style.setProperty('--chip', c.colour);
          chip.dataset.done = String(c.done);
          chip.title = c.title;
          chip.textContent = c.done ? '✓' : '';
          return chip;
        }),
      );
    }
    const time = this.root.querySelector<HTMLElement>('.town-game-time')!;
    time.textContent = bar.time;
    time.toggleAttribute('data-alert', !!bar.alert);
    const way = this.root.querySelector<HTMLElement>('.town-game-way')!;
    way.hidden = !bar.way;
    if (bar.way) {
      const from = bar.way.from ?? this.middle();
      way.style.color = bar.way.colour;
      way.style.transform = `rotate(${Math.atan2(bar.way.to.y - from.y, bar.way.to.x - from.x)}rad)`;
    }
  }

  /** The middle of what's showing of the map (tiles). */
  private middle(): { x: number; y: number } {
    const { camera } = this.host.renderer;
    const { x, y } = camera.toWorld(camera.viewW / 2, (camera.viewH - camera.insetBottom) / 2);
    return { x: x / TILE - 0.5, y: y / TILE - 0.5 };
  }

  private finished(round: TownRound): void {
    this.shownDone = true;
    const done = this.root.querySelector<HTMLElement>('.town-game-done')!;
    done.querySelector('.town-game-stars')!.innerHTML = [1, 2, 3].map((n) => pixelStar(n <= round.stars)).join('');
    done.querySelector('.town-game-said')!.textContent = round.result();
    done.hidden = false;
  }
}

/** Someone standing at (x, y) in tiles, as the town's people stand, with a shadow at their feet. */
export function standAt(ctx: Ctx, sprite: HTMLCanvasElement, x: number, y: number): void {
  const left = Math.round(x * TILE) + 2;
  const feet = Math.round(y * TILE) + FEET;
  ctx.fillStyle = 'rgba(20, 14, 30, 0.22)';
  ctx.fillRect(left + 2, feet - 1, 8, 2);
  ctx.drawImage(sprite, left, feet - sprite.height + 1);
}

/** A sprite as a picture in the bar: copied, so it's the bar's own. */
function picture(sprite: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = sprite.width;
  copy.height = sprite.height;
  copy.getContext('2d')!.drawImage(sprite, 0, 0);
  return copy;
}

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
