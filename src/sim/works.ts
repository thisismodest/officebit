// Works (docs/UPGRADES.md): the pieces newer releases add to an older town,
// put up by a crew (construction.ts). From its moment (the hour the town was
// opened and brought up to date), each piece's crew is sent for, if nothing's
// been put in the way since; they come in working hours. A Live town replays
// its story, so the crew comes at the same moment every time.
import { CATALOG } from './catalog.ts';
import { hourOf } from './clock.ts';
import type { Simulation } from './sim.ts';
import type { Tile } from './world.ts';
import { groundOf } from '../worlds/upgrades.ts';
import { footprint, overlap } from './geometry.ts';

/** Crew-hours to put a piece up. */
const PUT_UP_HOURS = 4;

export class Works {
  private readonly sim: Simulation;
  /** Works already seen to (sent for, or skipped), by their place in the world's list. */
  private readonly done = new Set<number>();

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Called once an hour: send for a crew for any works whose day has come. */
  hourly(): void {
    const { sim } = this;
    const { year, month, day } = sim.dateOf(sim.tick);
    const now = moment(year, month, day, Math.floor(hourOf(sim.tick)));
    for (const [i, works] of (sim.world.works ?? []).entries()) {
      if (this.done.has(i) || now < moment(...works.from)) continue;
      this.done.add(i);
      const { furniture, level } = works;
      const ground = groundOf(furniture);
      const taken = sim.activeItems().some((item) => item.level === level && ground.some((g) => overlap(footprint(item.def), g)));
      const door = this.doorFor(level, furniture.p);
      if (taken || !door) continue;
      const name = (CATALOG[furniture.t]?.name ?? 'something new').toLowerCase();
      sim.construction.start({
        label: `New ${name}`,
        level,
        siteType: 'siteTiny',
        at: furniture.p,
        building: structuredClone(furniture),
        door,
        hours: PUT_UP_HOURS,
        news: [`🚧 A crew came to put up a ${name}`, `🏗️ The new ${name} is up`],
        onDone: () => {},
      });
    }
  }

  /** Somewhere for the crew to stand: a free tile just below the works, else above or to either side. */
  private doorFor(level: string, [x, y]: Tile): Tile | null {
    const grid = this.sim.grids.get(level);
    const tries: Tile[] = [[x, y + 2], [x + 1, y + 2], [x, y - 1], [x - 1, y], [x + 2, y]];
    return tries.find(([tx, ty]) => grid?.free(tx, ty)) ?? null;
  }
}

/** A date and hour as one number, for comparing. */
function moment(year: number, month: number, day: number, hour = 0): number {
  return ((year * 100 + month) * 100 + day) * 100 + hour;
}
