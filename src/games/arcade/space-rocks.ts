// Space Rocks (docs/GAMES.md#space-rocks): a little ship among drifting space rocks. Turn, thrust and fire; a rock that's
// hit breaks in two, and the smallest crumble away. Three ships; a clear sky brings a new wave, one rock more. Off one
// edge of the screen is on at the other.
import type { Input } from '../controls.ts';
import { SCREEN, box, line, outline, write, type ArcadeGame, type Round } from './game.ts';

/** The strip at the top for the score. */
const TOP = 12;
/** The ship: how fast it turns (radians a second), pushes on (px/s²) and slows (a share of its speed a second); its size and top speed. */
const SHIP = { turn: 3.6, thrust: 70, drag: 0.6, size: 5, fastest: 70 };
/** Shots: speed (px/s), how long they last (s), how many at once, and the gap between them (s). */
const SHOT = { speed: 120, life: 0.9, most: 4, gap: 0.22 };
/** Rocks by size (3 big to 1 small): their radius (px), and the score for hitting one. */
const RADIUS = [0, 4, 7, 11];
const POINTS = [0, 3, 2, 1];
/** How fast rocks drift (px/s), at least and at most, and how many in the first wave. */
const DRIFT = [10, 26];
const FIRST_WAVE = 3;
const SHIPS = 3;
/** Seconds a new ship can't be hit (it blinks), and the pause before it comes back after a crash. */
const SAFE = 2.5;
const RESPAWN = 1;

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** Its jagged outline, as a radius at each of its corners (a share of its full size). */
  shape: number[];
  spin: number;
  turn: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export class SpaceRocks implements Round {
  ship = { x: SCREEN.w / 2, y: (SCREEN.h + TOP) / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  rocks: Rock[] = [];
  shots: Shot[] = [];
  ships = SHIPS;
  wave = 1;
  score = 0;
  over = false;
  /** Seconds the ship can't be hit yet; seconds till it's back after a crash (0: it's flying). */
  safe = SAFE;
  gone = 0;
  private reload = 0;
  private thrusting = false;
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
    this.fill(FIRST_WAVE);
  }

  step(input: Input, dt: number): void {
    if (this.over) return;
    for (const rock of this.rocks) {
      rock.x = wrapX(rock.x + rock.vx * dt);
      rock.y = wrapY(rock.y + rock.vy * dt);
      rock.spin += rock.turn * dt;
    }
    this.moveShots(dt);
    if (this.gone > 0) {
      this.gone = Math.max(0, this.gone - dt);
      return;
    }
    this.fly(input, dt);
    this.safe = Math.max(0, this.safe - dt);
    if (this.safe === 0 && this.rocks.some((r) => Math.hypot(r.x - this.ship.x, r.y - this.ship.y) < RADIUS[r.size]! + SHIP.size - 1)) this.crash();
    if (this.rocks.length === 0) {
      this.wave++;
      this.fill(FIRST_WAVE + this.wave - 1);
    }
  }

  private fly(input: Input, dt: number): void {
    const { ship } = this;
    const turning = (input.held.has('right') ? 1 : 0) - (input.held.has('left') ? 1 : 0);
    ship.angle += turning * SHIP.turn * dt;
    this.thrusting = input.held.has('up');
    if (this.thrusting) {
      ship.vx += Math.cos(ship.angle) * SHIP.thrust * dt;
      ship.vy += Math.sin(ship.angle) * SHIP.thrust * dt;
    }
    const slow = Math.max(0, 1 - SHIP.drag * dt);
    ship.vx *= slow;
    ship.vy *= slow;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > SHIP.fastest) {
      ship.vx *= SHIP.fastest / speed;
      ship.vy *= SHIP.fastest / speed;
    }
    ship.x = wrapX(ship.x + ship.vx * dt);
    ship.y = wrapY(ship.y + ship.vy * dt);
    this.reload = Math.max(0, this.reload - dt);
    // The go button fires (a tap on the screen too), as fast as it reloads.
    const fire = input.pressed.has('a') || !!input.tap;
    if (fire && this.reload === 0 && this.shots.length < SHOT.most) {
      this.reload = SHOT.gap;
      const [cx, cy] = [Math.cos(ship.angle), Math.sin(ship.angle)];
      this.shots.push({ x: ship.x + cx * SHIP.size, y: ship.y + cy * SHIP.size, vx: ship.vx + cx * SHOT.speed, vy: ship.vy + cy * SHOT.speed, life: SHOT.life });
    }
  }

  private moveShots(dt: number): void {
    for (const shot of this.shots) {
      shot.x = wrapX(shot.x + shot.vx * dt);
      shot.y = wrapY(shot.y + shot.vy * dt);
      shot.life -= dt;
      const rock = this.rocks.find((r) => Math.hypot(r.x - shot.x, r.y - shot.y) <= RADIUS[r.size]! + 1);
      if (!rock) continue;
      shot.life = 0;
      this.score += POINTS[rock.size]!;
      this.rocks.splice(this.rocks.indexOf(rock), 1);
      // In two, smaller and a little quicker, off either side of the way the shot was going.
      if (rock.size > 1)
        for (const side of [-1, 1]) {
          const angle = Math.atan2(shot.vy, shot.vx) + (side * Math.PI) / 2;
          const speed = Math.hypot(rock.vx, rock.vy) * 1.2 + 6;
          this.rocks.push(this.rock(rock.x, rock.y, rock.size - 1, Math.cos(angle) * speed, Math.sin(angle) * speed));
        }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private crash(): void {
    this.ships--;
    this.over = this.ships === 0;
    this.gone = RESPAWN;
    this.safe = SAFE;
    this.ship = { x: SCREEN.w / 2, y: (SCREEN.h + TOP) / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  }

  /** A wave of big rocks round the edges, well away from the ship. */
  private fill(count: number): void {
    for (let i = 0; i < count; i++) {
      const edge = this.random() * 4;
      const along = this.random();
      const [x, y] = edge < 1 ? [along * SCREEN.w, TOP] : edge < 2 ? [along * SCREEN.w, SCREEN.h - 1] : edge < 3 ? [0, TOP + along * (SCREEN.h - TOP)] : [SCREEN.w - 1, TOP + along * (SCREEN.h - TOP)];
      const angle = this.random() * Math.PI * 2;
      const speed = DRIFT[0]! + this.random() * (DRIFT[1]! - DRIFT[0]!);
      this.rocks.push(this.rock(x, y, 3, Math.cos(angle) * speed, Math.sin(angle) * speed));
    }
  }

  private rock(x: number, y: number, size: number, vx: number, vy: number): Rock {
    const shape = Array.from({ length: 8 }, () => 0.75 + this.random() * 0.25);
    return { x, y, vx, vy, size, shape, spin: 0, turn: (this.random() - 0.5) * 1.5 };
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    box(ctx, 0, 0, SCREEN.w, SCREEN.h, '#0d1020');
    for (let i = 0; i < 24; i++) box(ctx, (i * 41) % SCREEN.w, TOP + ((i * 67) % (SCREEN.h - TOP)), 1, 1, i % 3 ? '#3a4466' : '#6b7aa6');
    for (const rock of this.rocks) {
      const r = RADIUS[rock.size]!;
      const corners = rock.shape.map((k, i): [number, number] => {
        const a = rock.spin + (i / rock.shape.length) * Math.PI * 2;
        return [rock.x + Math.cos(a) * r * k, rock.y + Math.sin(a) * r * k];
      });
      outline(ctx, corners, '#c9b48a');
    }
    for (const shot of this.shots) box(ctx, shot.x - 1, shot.y - 1, 2, 2, '#f3c969');
    // The ship blinks while it can't be hit.
    const blink = this.safe > 0 && Math.floor(time * 8) % 2 === 0;
    if (this.gone === 0 && !this.over && !blink) this.drawShip(ctx, time);
    box(ctx, 0, 0, SCREEN.w, TOP, '#2a2033');
    write(ctx, `SCORE ${this.score}`, 4, 2, '#f3c969');
    for (let i = 0; i < this.ships; i++) {
      const x = SCREEN.w - 8 - i * 9;
      outline(ctx, [[x, 2], [x + 3, 9], [x - 3, 9]], '#9fd3f0');
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D, time: number): void {
    const { x, y, angle } = this.ship;
    const at = (a: number, r: number): [number, number] => [x + Math.cos(angle + a) * r, y + Math.sin(angle + a) * r];
    const nose = at(0, SHIP.size + 1);
    const left = at(2.5, SHIP.size);
    const right = at(-2.5, SHIP.size);
    outline(ctx, [nose, left, at(Math.PI, SHIP.size * 0.4), right], '#9fd3f0');
    // A flicker of flame out of the back while it pushes on.
    if (this.thrusting && Math.floor(time * 20) % 2 === 0) {
      const [fx, fy] = at(Math.PI, SHIP.size + 2);
      const [bx, by] = at(Math.PI, SHIP.size * 0.4);
      line(ctx, bx, by, fx, fy, '#e7793a');
    }
  }
}

const wrapX = (x: number) => (x + SCREEN.w) % SCREEN.w;
const wrapY = (y: number) => TOP + ((y - TOP + (SCREEN.h - TOP)) % (SCREEN.h - TOP));

export const SPACE_ROCKS: ArcadeGame = {
  id: 'spaceRocks',
  name: 'Space Rocks',
  icon: '🚀',
  how: 'Steer and fly with the stick, and fire to break up the rocks!',
  start: (random) => new SpaceRocks(random),
};
