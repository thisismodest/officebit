// The arcade cabinet (docs/GAMES.md#the-arcade): what you see facing an arcade machine. Its marquee (ARCADE, in pixels), a little screen
// (the menu of games, then the game), and a panel with a joystick and an A button. Every arcade game plays in it.
// Best scores are kept in the browser.
import { BRICK_BASH } from './arcade/brick-bash.ts';
import { CATERPILLAR } from './arcade/caterpillar.ts';
import { SCREEN, box, prompt, wrap, write, type ArcadeGame, type Round } from './arcade/game.ts';
import { GameControls, type Input } from './controls.ts';
import { joystick, pixelCross, pixelGo, pixelWord } from './pixel.ts';

/** The arcade's games, in the menu's order. */
export const ARCADE: readonly ArcadeGame[] = [CATERPILLAR, BRICK_BASH];

const BEST_KEY = 'officebit:arcade-best';
/** The longest a frame can be (s): back from another tab, a game picks up where it was rather than leaping on. */
const LONGEST_FRAME = 0.05;
const ROW = { top: 34, height: 26 };

type Screen = { kind: 'menu' } | { kind: 'playing'; game: ArcadeGame; round: Round; since: number } | { kind: 'over'; game: ArcadeGame; round: Round; best: boolean };

export class Cabinet {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly controls = new GameControls();
  private screen: Screen = { kind: 'menu' };
  private selected = 0;
  private frameId = 0;
  private last = 0;
  private clock = 0;
  /** Told when the cabinet closes. */
  private onClose: () => void = () => {};

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'arcade';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Arcade');
    this.root.innerHTML = `
      <div class="arcade-cabinet">
        <div class="arcade-marquee">
          <span class="arcade-title">${pixelWord('Arcade', '#c8453a', '#2a2033')}</span>
          <button type="button" class="arcade-back" aria-label="Back" title="Back (Esc)">${pixelCross()}</button>
        </div>
        <div class="arcade-bezel"><canvas class="arcade-screen" width="${SCREEN.w}" height="${SCREEN.h}"></canvas></div>
        <div class="arcade-panel">
          <div class="arcade-stick pixel-pad" aria-label="Joystick">${joystick()}</div>
          <button type="button" class="arcade-a" data-key="a" aria-label="Go (space)">${pixelGo()}</button>
        </div>
      </div>`;
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.controls.buttons(this.root.querySelector('.arcade-panel')!);
    this.controls.screen(this.canvas, () => SCREEN);
    this.controls.onBack = () => this.back();
    this.root.querySelector('.arcade-back')!.addEventListener('click', () => this.back());
    // Nothing reaches the town underneath.
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root.addEventListener('wheel', (event) => event.stopPropagation());
    host.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Step up to the cabinet: its menu of games. `onClose` is told when you step away. */
  show(onClose: () => void = () => {}): void {
    this.onClose = onClose;
    this.screen = { kind: 'menu' };
    this.root.hidden = false;
    this.controls.attach();
    this.last = performance.now();
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }

  close(): void {
    if (this.root.hidden) return;
    this.keepScore();
    cancelAnimationFrame(this.frameId);
    this.controls.detach();
    this.root.hidden = true;
    this.onClose();
  }

  /** Back: from a game to the menu, from the menu away from the cabinet. */
  private back(): void {
    if (this.screen.kind === 'menu') {
      this.close();
      return;
    }
    this.keepScore();
    this.screen = { kind: 'menu' };
  }

  /** A round given up part way still counts: its score is the best if it beat it. True if it did. */
  private keepScore(): boolean {
    const screen = this.screen;
    if (screen.kind !== 'playing') return false;
    const best = screen.round.score > this.best(screen.game.id);
    if (best) this.saveBest(screen.game.id, screen.round.score);
    return best;
  }

  private frame(now: number): void {
    const dt = Math.min(LONGEST_FRAME, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    const input = this.controls.frame();
    this.update(input, dt);
    this.draw();
    this.frameId = requestAnimationFrame((t) => this.frame(t));
  }

  private update(input: Input, dt: number): void {
    const screen = this.screen;
    if (screen.kind === 'menu') {
      if (input.pressed.has('up')) this.selected = (this.selected + ARCADE.length - 1) % ARCADE.length;
      if (input.pressed.has('down')) this.selected = (this.selected + 1) % ARCADE.length;
      const tapped = input.tap ? Math.floor((input.tap.y - ROW.top) / ROW.height) : -1;
      if (tapped >= 0 && tapped < ARCADE.length) this.play(ARCADE[tapped]!);
      else if (input.pressed.has('a')) this.play(ARCADE[this.selected]!);
    } else if (screen.kind === 'playing') {
      screen.round.step(input, dt);
      if (screen.round.over) this.screen = { kind: 'over', game: screen.game, round: screen.round, best: this.keepScore() };
    } else if (input.pressed.has('a') || input.tap) {
      this.play(screen.game);
    }
  }

  private play(game: ArcadeGame): void {
    this.selected = ARCADE.indexOf(game);
    this.screen = { kind: 'playing', game, round: game.start(Math.random), since: this.clock };
  }

  private draw(): void {
    const { ctx } = this;
    const screen = this.screen;
    if (screen.kind === 'menu') {
      this.drawMenu();
      return;
    }
    screen.round.draw(ctx, this.clock - (screen.kind === 'playing' ? screen.since : 0));
    if (screen.kind === 'over') {
      box(ctx, 16, 36, SCREEN.w - 32, 72, '#1b1824ee');
      write(ctx, screen.best ? 'NEW BEST!' : 'WELL PLAYED!', SCREEN.w / 2, 44, '#f3c969', { align: 'center', size: 10 });
      write(ctx, `SCORE ${screen.round.score}`, SCREEN.w / 2, 62, '#f4f4f0', { align: 'center' });
      write(ctx, `BEST ${this.best(screen.game.id)}`, SCREEN.w / 2, 74, '#9fd3f0', { align: 'center' });
      if (Math.floor(this.clock * 2) % 2 === 0) prompt(ctx, '◆ / SPACE: AGAIN', SCREEN.w / 2, 92, '#8fd14f');
    }
  }

  private drawMenu(): void {
    const { ctx } = this;
    box(ctx, 0, 0, SCREEN.w, SCREEN.h, '#14182e');
    // A few stars twinkling.
    for (let i = 0; i < 18; i++) {
      const on = Math.floor(this.clock * 2 + i) % 3 !== 0;
      if (on) box(ctx, (i * 37) % SCREEN.w, (i * 53) % SCREEN.h, 1, 1, '#9fb3c8');
    }
    write(ctx, 'CHOOSE A GAME', SCREEN.w / 2, 12, '#f3c969', { align: 'center', size: 10 });
    for (const [i, game] of ARCADE.entries()) {
      const y = ROW.top + i * ROW.height;
      const chosen = i === this.selected;
      box(ctx, 8, y, SCREEN.w - 16, ROW.height - 4, chosen ? '#7f4aa6' : '#2a2033');
      write(ctx, game.icon, 14, y + 4, '#ffffff', { size: 12 });
      write(ctx, game.name.toUpperCase(), 32, y + 4, chosen ? '#ffffff' : '#c9c3d6');
      write(ctx, `BEST ${this.best(game.id)}`, 32, y + 13, '#9fd3f0', { size: 7 });
      if (chosen && Math.floor(this.clock * 3) % 2 === 0) write(ctx, '▶', SCREEN.w - 20, y + 7, '#f3c969');
    }
    const how = wrap(ARCADE[this.selected]?.how ?? '', 26);
    for (const [i, line] of how.entries()) write(ctx, line, SCREEN.w / 2, SCREEN.h - 10 - (how.length - i) * 9, '#c9c3d6', { align: 'center', size: 7 });
  }

  private best(id: string): number {
    return this.bests()[id] ?? 0;
  }

  private saveBest(id: string, score: number): void {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ ...this.bests(), [id]: score }));
    } catch {
      // Private browsing, or no room: the best just isn't kept.
    }
  }

  private bests(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }
}
