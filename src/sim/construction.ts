// Construction (docs/VENTURES.md#construction). Nothing appears out of thin
// air: a crew walks in from the edge of town during working hours, breaks
// ground when the first of them reaches the site, builds through the day,
// and walks back out when it's done. Then the finished building stands.
import { TICKS_PER_HOUR } from './clock.ts';
import type { Person } from './person.ts';
import type { Item, Simulation } from './sim.ts';
import type { FurnitureDef, Tile } from './world.ts';

/** People in a crew. */
const CREW_SIZE = 3;
/** How close (tiles) the first worker must get before breaking ground. */
const ARRIVAL_RADIUS = 2;
const CREW_NAMES = ['Stan', 'Bev', 'Kofi', 'Marta', 'Jonno', 'Ruth', 'Deng', 'Pip', 'Sully'];

export interface Job {
  id: string;
  label: string;
  level: string;
  /** Whatever stands there now (an empty lot, an old building): cleared when the crew arrives. */
  clears: Item;
  /** The fenced site while work is under way, then the finished building. */
  site: FurnitureDef;
  building: FurnitureDef;
  /** Where the crew heads to: the tile in front of the site. */
  door: Tile;
  /** Crew-hours of work needed, and done so far. */
  hours: number;
  done: number;
  crew: string[];
  siteItem?: Item;
  finished: boolean;
  onDone: () => void;
}

export interface JobSpec {
  label: string;
  clears: Item;
  siteType: string;
  at: Tile;
  building: FurnitureDef;
  door: Tile;
  hours: number;
  onDone: () => void;
}

export class Construction {
  readonly jobs: Job[] = [];
  private readonly sim: Simulation;
  private hired = 0;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Is this item spoken for by a job (an empty lot about to be built on)? */
  reserved(item: Item): boolean {
    return this.jobs.some((job) => job.clears === item);
  }

  /** Send for a crew. They'll turn up during working hours. */
  start(spec: JobSpec): void {
    const { sim } = this;
    const crew = Array.from({ length: CREW_SIZE }, () => {
      const name = CREW_NAMES[this.hired++ % CREW_NAMES.length]!;
      const id = `crew-${this.hired}-${name.toLowerCase()}`;
      sim.addNpc({ id, name, species: 'human', look: [sim.rng.int(0, 4), sim.rng.int(0, 6), 5, 0], home: '', role: 'crew' });
      return id;
    });
    this.jobs.push({
      id: `job-${this.jobs.length + 1}`,
      label: spec.label,
      level: spec.clears.level,
      clears: spec.clears,
      site: { t: spec.siteType, p: spec.at, label: `${spec.label} (under construction)`, progress: 0 },
      building: spec.building,
      door: spec.door,
      hours: spec.hours,
      done: 0,
      crew,
      finished: false,
      onDone: spec.onDone,
    });
  }

  /** The job this crew member is on, if it isn't finished. */
  jobFor(p: Person): Job | undefined {
    return this.jobs.find((job) => !job.finished && job.crew.includes(p.id));
  }

  /** Called every tick: break ground when the crew arrives; stand the crew down once they've gone. */
  step(): void {
    const { sim } = this;
    for (const job of [...this.jobs]) {
      if (!job.finished && !job.siteItem && this.crewAt(job)) this.breakGround(job);
      if (job.finished && job.crew.every((id) => sim.person(id)?.hidden ?? true)) {
        for (const id of job.crew) sim.removePerson(id);
        this.jobs.splice(this.jobs.indexOf(job), 1);
      }
    }
  }

  /** One tick of work by a crew member at a site. */
  worked(p: Person, item: Item): void {
    const job = this.jobs.find((j) => j.siteItem === item && j.crew.includes(p.id));
    if (!job || job.finished) return;
    job.done += this.sim.dt / TICKS_PER_HOUR;
    job.site.progress = Math.min(1, job.done / job.hours);
    if (job.done >= job.hours) this.finish(job);
  }

  private crewAt(job: Job): boolean {
    return job.crew.some((id) => {
      const p = this.sim.person(id);
      return !!p && p.level === job.level && this.sim.present(p) && Math.hypot(p.x - job.door[0], p.y - job.door[1]) <= ARRIVAL_RADIUS;
    });
  }

  private breakGround(job: Job): void {
    const { sim } = this;
    sim.removeItem(job.clears);
    job.siteItem = sim.addItem(job.level, job.site);
    sim.log(`🚧 A construction crew started work on ${job.label}`, job.crew);
  }

  private finish(job: Job): void {
    const { sim } = this;
    job.finished = true;
    if (job.siteItem) sim.removeItem(job.siteItem);
    sim.addItem(job.level, job.building);
    sim.log(`🏗️ The builders finished ${job.label} and packed up`, job.crew);
    job.onDone();
  }
}
