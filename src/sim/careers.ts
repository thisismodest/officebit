// Jobs (docs/CAREERS.md): quitting, getting let go, job hunting, hiring.
//
//   Friday 17:00  weekly review: slackers may be let go, the fed-up may quit,
//                 the unambitious may fancy a simpler job at the shop
//   weekdays 09:00  anyone out of work applies anywhere with a free desk (the
//                 office, the shop, the diner, the school…), just not where
//                 they were let go; companies with desks empty for a while
//                 hire a newcomer from out of town
//
// Venture teams are exempt: they answer to themselves.
import { TICKS_PER_DAY, dayOf, hourOf } from './clock.ts';
import type { Person } from './person.ts';
import type { Simulation } from './sim.ts';
import { newcomer } from './ventures.ts';

/** Output below this share of the company median, with diligence below `FIRE_DILIGENCE`, risks being let go. */
const FIRE_OUTPUT = 0.5;
const FIRE_DILIGENCE = 0.3;
/** Weekly chance of actually being let go, once at risk. */
const FIRE_CHANCE = 0.35;
/** Interrupted this many times in a week, someone who doesn't much like company might quit. */
const FED_UP_INTERRUPTIONS = 15;
const FED_UP_SOCIAL = 0.6;
const QUIT_CHANCE = 0.4;
/** Weekly chance an unambitious person fancies a simpler job. */
const CHANGE_CHANCE = 0.03;
const CHANGE_AMBITION = 0.35;
/** New starters aren't reviewed until they've had this long in the job. */
const GRACE = 7 * TICKS_PER_DAY;
/** Daily chance of landing a job you apply for. */
const HIRE_CHANCE = 0.5;
/** Weekly chance a company with empty desks and no applicants hires from out of town. */
const RECRUIT_CHANCE = 0.3;

export class Careers {
  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Called once an hour. */
  hourly(): void {
    const { sim } = this;
    if (sim.dayOff()) return;
    const hour = Math.round(hourOf(sim.tick));
    if (hour === 9) this.jobHunt();
    if (hour === 17 && dayOf(sim.tick) % 7 === 4) this.review();
  }

  /** `p` leaves their job, for whatever reason. Their desk is freed. */
  leave(p: Person, why: 'quit' | 'fired' | 'change'): void {
    const { sim } = this;
    const company = sim.companies.get(p.company ?? '');
    if (!company) return;
    // Only those who walked out might be taken back; the let-go and the change-seekers look elsewhere.
    p.formerCompany = why === 'quit' ? company.id : undefined;
    p.leftCompany = company.id;
    sim.unemploy(p);
    const lines = {
      quit: `${p.name} had enough of the interruptions and quit ${company.name}`,
      fired: `${p.name} was let go from ${company.name}`,
      change: `${p.name} handed in their notice at ${company.name}, fancying a change`,
    };
    sim.log(lines[why], [p.id]);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private review(): void {
    const { sim } = this;
    const staff = sim.people.filter((p) => !p.npc && p.company && !sim.ventures.isVenture(p.company));
    for (const company of sim.companies.values()) {
      const team = staff.filter((p) => p.company === company.id);
      const median = middle(team.map((p) => p.stats.weekWork));
      for (const p of team) {
        if (sim.tick - p.hiredAt < GRACE) continue;
        if (median > 0 && p.stats.weekWork < median * FIRE_OUTPUT && p.traits.diligence < FIRE_DILIGENCE && sim.rng.next() < FIRE_CHANCE) {
          this.leave(p, 'fired');
        } else if (p.stats.weekInterrupted >= FED_UP_INTERRUPTIONS && p.traits.social < FED_UP_SOCIAL && sim.rng.next() < QUIT_CHANCE) {
          this.leave(p, 'quit');
        } else if (p.traits.ambition < CHANGE_AMBITION && !company.walkIn && sim.rng.next() < CHANGE_CHANCE) {
          this.leave(p, 'change');
        }
      }
    }
    for (const p of sim.people) {
      p.stats.weekWork = 0;
      p.stats.weekInterrupted = 0;
    }
    this.recruit();
  }

  /** Everyone out of work applies for a free desk: their old job if they walked out and it's going, otherwise anywhere but where they left. */
  private jobHunt(): void {
    const { sim } = this;
    for (const p of sim.people) {
      if (p.npc || p.company || p.venture) continue;
      const hiring = [...sim.companies.values()].filter(
        (c) => !sim.ventures.isVenture(c.id) && this.freeDesk(c.id) && (c.id !== p.leftCompany || c.id === p.formerCompany),
      );
      const job = hiring.find((c) => c.id === p.formerCompany) ?? hiring[sim.rng.int(0, hiring.length - 1)];
      if (!job || sim.rng.next() > HIRE_CHANCE) continue;
      sim.employ(p, job.id, this.freeDesk(job.id)!.level);
      sim.log(job.id === p.formerCompany ? `${p.name} got their old job back at ${job.name}` : `${p.name} started a new job at ${job.name}`, [p.id]);
    }
  }

  /** Companies with desks nobody's applying for take on someone from out of town. */
  private recruit(): void {
    const { sim } = this;
    const lookingForWork = sim.people.some((p) => !p.npc && !p.company && !p.venture);
    if (lookingForWork) return;
    for (const company of sim.companies.values()) {
      const desk = this.freeDesk(company.id);
      if (!desk || sim.ventures.isVenture(company.id) || sim.rng.next() > RECRUIT_CHANCE) continue;
      const hire = sim.hire(newcomer(sim, company.id));
      sim.employ(hire, company.id, desk.level);
      sim.log(`${company.name} hired ${hire.name}, who's moving to town`, [hire.id]);
    }
  }

  private freeDesk(company: string) {
    const levels = this.sim.companies.get(company)?.levels ?? [];
    return this.sim.activeItems().find((item) => item.type.desk && !item.def.owner && levels.includes(item.level));
  }
}

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
