// Games in the park (docs/PLANS.md): a frisbee (or a ball) thrown round the
// ring of friends playing catch, and a laptop open in front of anyone working
// on a project together. Drawn from the plans and the clock; never touches the story.
import type { Person } from '../sim/person.ts';
import type { Simulation } from '../sim/sim.ts';
import { OUTLINE } from './palette.ts';
import { TILE, dot, rect, type Ctx } from './pixels.ts';

/** A throw takes this long (ms of real time), rising this high (pixels) at its middle. */
const THROW_MS = 900;
const ARC = 10;

/** The frisbee in flight between two of the players, for each game going on here. */
export function paintGames(ctx: Ctx, sim: Simulation, level: string, time: number, at: (p: Person) => { x: number; y: number }): void {
  for (const plan of sim.plans.list) {
    if (plan.activity !== 'catch' || plan.level !== level) continue;
    const players = plan.members
      .map((id) => sim.person(id))
      .filter((p): p is Person => !!p && p.level === level && p.intent?.kind === 'play' && p.phase === 'doing');
    if (players.length < 2) continue;
    const throwNo = Math.floor(time / THROW_MS);
    const t = (time % THROW_MS) / THROW_MS;
    const from = at(players[throwNo % players.length]!);
    const to = at(players[(throwNo + 1) % players.length]!);
    const x = (from.x + (to.x - from.x) * t) * TILE + 8;
    const y = (from.y + (to.y - from.y) * t) * TILE + 4 - Math.sin(t * Math.PI) * ARC;
    const disc = plan.id % 2 === 0;
    rect(ctx, x - 2, y + ARC * 0.9, 4, 1, 'rgba(20,14,30,0.18)');
    if (disc) {
      rect(ctx, x - 3, y, 6, 2, OUTLINE);
      rect(ctx, x - 2, y, 4, 1, '#e4793a');
    } else {
      rect(ctx, x - 1, y - 1, 3, 3, OUTLINE);
      dot(ctx, x, y, '#ffd93d');
    }
  }
}

/** A laptop open on their lap, or on the table in front of them. */
export function paintLaptop(ctx: Ctx, x: number, feet: number): void {
  rect(ctx, x + 2, feet - 9, 8, 5, OUTLINE);
  rect(ctx, x + 3, feet - 8, 6, 3, '#8cc8ff');
  rect(ctx, x + 1, feet - 4, 10, 2, '#7d8791');
}
