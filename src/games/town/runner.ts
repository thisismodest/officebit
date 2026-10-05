// Playing a game out in the town (docs/GAMES.md#town-games): the game drawn over the map, the camera on the player, a
// bar along the top (what's left, the time, which way to go) and a joystick for fingers. The map still zooms; clicks on
// it are ignored while you play (main.ts). A Live town carries on behind
// you; a Sandbox one waits till you're done. The town's story never knows.
import type { Renderer } from '../../render/renderer.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import { MOVERS, type Mover } from '../../sim/movement.ts';
import type { Simulation } from '../../sim/sim.ts';
import { vehicleKind } from '../../sim/traffic.ts';
import type { Tile } from '../../sim/world.ts';
import { GameControls } from '../controls.ts';
import { joystick, pixelStar } from '../pixel.ts';
import { CRASH_SECONDS, paintParcelDash, plan, type ParcelDash } from './parcel-dash.ts';

/** What a town game needs of the page: where to put its bar, the map, the town, and a way to hold the town still. */
export interface TownHost {
  stage: HTMLElement;
  renderer: Renderer;
  sim(): Simulation;
  /** Hold the town still if it's a sandbox (not if it's Live): returns how to let it go again. */
  hold(): () => void;
}

/** The longest a frame can be (s), so a hidden tab doesn't send the van flying. */
const LONGEST_FRAME = 0.05;
/** How long the time shows what a crash added (s). */
const CRASH_SHOWN = 1.2;

export class TownGame {
  private readonly host: TownHost;
  private readonly root: HTMLElement;
  private readonly controls = new GameControls();
  private game: ParcelDash | null = null;
  private from: Tile = [0, 0];
  private release: (() => void) | null = null;
  private frameId = 0;
  private last = 0;
  private clock = 0;
  /** Seconds left showing a crash's penalty on the time. */
  private crashShown = 0;
  private readonly paint = (ctx: Ctx, level: string) => {
    if (this.game && level === this.host.sim().traffic.level) paintParcelDash(ctx, this.game, this.clock);
  };

  constructor(host: TownHost) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'town-game';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="town-game-bar mdst-card mdst-card--compact">
        <strong>📦 Parcel Dash</strong>
        <span class="town-game-parcels" aria-label="Parcels left"></span>
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

  /** Parcel Dash from a signpost: false if there's nowhere to drive to from here. */
  start(from: Tile): boolean {
    this.from = from;
    if (!this.begin()) return false;
    const { renderer } = this.host;
    renderer.showLevel(this.host.sim().traffic.level!);
    renderer.overlays.push(this.paint);
    this.release = this.host.hold();
    this.root.hidden = false;
    this.controls.attach();
    this.last = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
    return true;
  }

  /** A fresh round (again, after the last). */
  private begin(): boolean {
    const game = plan(this.host.sim(), this.from, Math.random);
    if (!game) return false;
    this.game = game;
    this.root.querySelector<HTMLElement>('.town-game-done')!.hidden = true;
    const camera = this.host.renderer.camera;
    camera.following = null;
    camera.centerOn((game.x + 0.5) * TILE, (game.y + 0.5) * TILE);
    this.showParcels();
    return true;
  }

  stop(): void {
    if (this.root.hidden) return;
    cancelAnimationFrame(this.frameId);
    this.controls.detach();
    const { overlays } = this.host.renderer;
    overlays.splice(overlays.indexOf(this.paint), 1);
    this.release?.();
    this.release = null;
    this.game = null;
    this.root.hidden = true;
  }

  private frame(now: number): void {
    const dt = Math.min(LONGEST_FRAME, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    const game = this.game;
    if (game) {
      const wasDone = game.done;
      // The town's vehicles, to crash into (only looked at: they never know).
      const vehicles = this.host.sim().traffic.cars.filter((c) => !c.removed).map((c) => ({ x: c.x, y: c.y, facing: c.facing, reach: (MOVERS[vehicleKind(c)] as Mover).reach ?? 0 }));
      game.step(this.controls.frame(), dt, vehicles);
      this.crashShown = game.crashed ? CRASH_SHOWN : Math.max(0, this.crashShown - dt);
      if (game.delivered) this.showParcels();
      if (game.done && !wasDone) this.finished(game);
      this.host.renderer.camera.glideTo((game.x + 0.5) * TILE, (game.y + 0.5) * TILE, dt * 1000);
      this.showBar(game);
    }
    this.frameId = requestAnimationFrame((t) => this.frame(t));
  }

  private showParcels(): void {
    const chips = this.root.querySelector('.town-game-parcels')!;
    chips.replaceChildren(
      ...(this.game?.drops ?? []).map((drop) => {
        const chip = document.createElement('span');
        chip.className = 'town-game-parcel';
        chip.style.setProperty('--parcel', drop.colour);
        chip.dataset.done = String(drop.done);
        chip.title = drop.name;
        chip.textContent = drop.done ? '✓' : '';
        return chip;
      }),
    );
  }

  /** The time, and an arrow to the nearest house still waiting. */
  private showBar(game: ParcelDash): void {
    const time = this.root.querySelector<HTMLElement>('.town-game-time')!;
    time.textContent = this.crashShown > 0 ? `${clock(game.time)} +${CRASH_SECONDS}s` : clock(game.time);
    time.toggleAttribute('data-crash', this.crashShown > 0);
    const next = game.drops.filter((d) => !d.done).sort((a, b) => Math.hypot(a.at[0] - game.x, a.at[1] - game.y) - Math.hypot(b.at[0] - game.x, b.at[1] - game.y))[0];
    const way = this.root.querySelector<HTMLElement>('.town-game-way')!;
    way.hidden = !next;
    if (next) {
      way.style.color = next.colour;
      way.style.transform = `rotate(${Math.atan2(next.at[1] - game.y, next.at[0] - game.x)}rad)`;
    }
  }

  private finished(game: ParcelDash): void {
    const done = this.root.querySelector<HTMLElement>('.town-game-done')!;
    done.querySelector('.town-game-stars')!.innerHTML = [1, 2, 3].map((n) => pixelStar(n <= game.stars)).join('');
    done.querySelector('.town-game-said')!.textContent = `All delivered in ${clock(game.time)}!`;
    done.hidden = false;
  }
}

/** Seconds as m:ss. */
function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
