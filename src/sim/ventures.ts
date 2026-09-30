// Side projects that become companies (docs/VENTURES.md).
//
//   idea ──hustle──▶ side project ──pitch──▶ team ──launch──▶ own office ──grow──▶ bigger office
//                         └── nobody works on it for a week: fizzles out
//   once launched, each Friday: money in or out. Doing well, it hires; low, the
//   less committed leave; run out, and it closes (its office is left to let)
//
// Ambitious people hustle on evenings and weekends. Enough hours turns an idea
// into a venture; founders pitch colleagues to join. Enough work and the
// founder quits, taking an empty office in town (or a lot to build one on),
// which later grows.
import { buildOffice, type Tier } from '../worlds/offices.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR, dayOf, hourOf } from './clock.ts';
import type { Person } from './person.ts';
import type { Item, Simulation } from './sim.ts';
import type { PersonDef, Tile } from './world.ts';

/** Ambition needed to start hustling on an idea of your own. */
export const IDEA_AMBITION = 0.6;
/** Ambition needed to go full-time at launch, and when the venture grows. */
const FULL_TIME_AMBITION = { launch: 0.6, grow: 0.5 };
/** Hours of hustling before an idea becomes a named venture. */
const IDEA_HOURS = 10;
/** Hours of work before the founder quits to go full-time. */
const LAUNCH_HOURS = 60;
/** Hours of work before moving into a bigger office. */
const GROW_HOURS = 400;
/** A side project nobody touches for this long fizzles out. */
const FIZZLE_TICKS = 7 * TICKS_PER_DAY;
/** How long before anyone pitches the same person again. */
const PITCH_COOLDOWN = 3 * TICKS_PER_DAY;
/** Most people a side project signs up before it launches. */
const MAX_TEAM = 4;
/** New staff hired when moving into the bigger office. */
const HIRES = 2;
/** Crew-hours to build each tier of office. */
const BUILD_HOURS: Record<Tier, number> = { 1: 18, 2: 40 };
/**
 * A launched venture's money (roughly, good weeks in hand): what it starts
 * with, the most it keeps, enough to hire (one a week, while there's a desk
 * free), and low enough that the less committed start to worry.
 */
const FUNDS = { start: 1, most: 3, hiring: 1.5, worried: 0.5 };
/**
 * Each Friday's takings: luck (± half of `luck`), and a push from how hard the
 * team worked (their share of a full week's work hours, against `par`), and a
 * little from the founder's charisma.
 */
const TRADING = { luck: 1, work: 0.2, par: 0.8, charisma: 0.1 };
const FULL_WEEK = 45;
/** When money's low, anyone at it but the founder, with ambition below this, may leave for a steadier job (a weekly chance). */
const WORRIED = { ambition: 0.5, chance: 0.3 };
/** After a venture closes, its people don't start anything new for this long: they look for work first. */
const REST = 14 * TICKS_PER_DAY;

export type Stage = 'side' | 'building' | 'launched' | 'rebuilding' | 'grown';

export interface Venture {
  id: string;
  name: string;
  founder: string;
  members: string[];
  /** Hours of work put in, by everyone. */
  progress: number;
  stage: Stage;
  founded: number;
  lastWork: number;
  /** Top-left of the lot its office stands on. */
  site?: { level: string; p: Tile };
  /** What its office's level and rooms are named after: its own id, or the venture's whose office it took over. */
  stem?: string;
  /** Money in hand, once launched (`FUNDS`). */
  funds?: number;
}

/** An office a venture that closed left behind, to let. */
interface EmptyOffice {
  site: { level: string; p: Tile };
  stem: string;
  tier: Tier;
}

export class Ventures {
  readonly list: Venture[] = [];
  private readonly sim: Simulation;
  /** When each person was last pitched to. */
  private readonly pitched = new Map<string, number>();
  /** Offices left empty by ventures that closed, for the next one to take on. */
  private readonly empty: EmptyOffice[] = [];
  private started = 0;
  /** Until when each person who was on a venture that closed is taking a break from ideas. */
  private readonly resting = new Map<string, number>();

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  of(p: Person): Venture | undefined {
    return this.list.find((v) => v.id === p.venture);
  }

  /** Is this company someone's venture? */
  isVenture(company: string): boolean {
    return this.list.some((v) => v.id === company);
  }

  /** Would this person spend an evening on a side project? */
  wantsToHustle(p: Person): boolean {
    return !p.npc && (!!p.venture || (p.traits.ambition >= IDEA_AMBITION && this.sim.tick >= (this.resting.get(p.id) ?? 0)));
  }

  /** One tick of evening hustle. */
  hustled(p: Person): void {
    const hours = ((0.5 + p.traits.diligence) * this.sim.dt) / TICKS_PER_HOUR;
    const venture = this.of(p);
    if (venture) {
      this.progress(venture, hours);
      return;
    }
    p.ideas += hours;
    if (p.ideas >= IDEA_HOURS) this.found(p);
  }

  /** One tick of full-time work at a venture's desk. */
  worked(p: Person): void {
    const venture = this.list.find((v) => v.id === p.company);
    if (venture) this.progress(venture, this.sim.dt / TICKS_PER_HOUR);
  }

  /** `founder` has just started a chat with `target`: maybe win them over. */
  pitch(founder: Person, target: Person): void {
    const venture = this.of(founder);
    if (!venture || target.npc || target.venture || venture.members.length >= MAX_TEAM) return;
    const { sim } = this;
    if (sim.tick - (this.pitched.get(target.id) ?? -Infinity) < PITCH_COOLDOWN) return;
    this.pitched.set(target.id, sim.tick);

    // The founder's own pitch lands best; converts are less persuasive.
    const conviction = founder.id === venture.founder ? 1 : 0.5;
    const appeal = target.traits.ambition * 0.35 + founder.traits.charisma * 0.1 + Math.max(0, sim.affinity(founder, target)) * 0.5;
    const chance = Math.min(0.5, conviction * appeal);
    if (sim.rng.next() < chance) {
      venture.members.push(target.id);
      target.venture = venture.id;
      // `founder` is whoever made the pitch; the side project is still its founder's.
      const owner = sim.person(venture.founder)?.name ?? founder.name;
      sim.log(`${target.name} is joining ${owner}'s side project, ${venture.name}`, [target.id, founder.id]);
    } else {
      sim.log(`${founder.name} pitched ${venture.name} to ${target.name}, who isn't convinced`, [founder.id, target.id]);
    }
  }

  /** How it's doing, for the World tab and profiles: "doing well", "struggling", or nothing to say. */
  fortunes(venture: Venture): string {
    if (venture.funds === undefined) return '';
    return venture.funds >= FUNDS.hiring ? 'doing well' : venture.funds < FUNDS.worried ? 'struggling' : '';
  }

  /** Called once an hour. */
  hourly(): void {
    const { sim } = this;
    const hour = hourOf(sim.tick);
    // Friday, the end of the working week (before the week's work is reset for the review).
    const payday = !sim.dayOff() && Math.round(hour) === 17 && dayOf(sim.tick) % 7 === 4;
    for (const venture of [...this.list]) {
      if (venture.stage === 'side') {
        if (sim.tick - venture.lastWork > FIZZLE_TICKS) this.shutDown(venture);
        // Resignations happen on a weekday evening.
        else if (venture.progress >= LAUNCH_HOURS && !sim.dayOff() && hour >= 17 && hour < 23) this.launch(venture);
      } else if (venture.stage === 'launched' || venture.stage === 'grown') {
        if (payday) this.trade(venture);
        if (venture.stage === 'launched' && venture.progress >= GROW_HOURS) this.grow(venture);
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private progress(venture: Venture, hours: number): void {
    venture.progress += hours;
    venture.lastWork = this.sim.tick;
  }

  private found(p: Person): void {
    const { sim } = this;
    const venture: Venture = {
      id: `venture-${++this.started}-${p.id}`,
      name: ventureName(sim),
      founder: p.id,
      members: [p.id],
      progress: p.ideas,
      stage: 'side',
      founded: sim.tick,
      lastWork: sim.tick,
    };
    this.list.push(venture);
    p.venture = venture.id;
    p.ideas = 0;
    sim.log(`💡 ${p.name} started a side project: ${venture.name}`, [p.id]);
  }

  private shutDown(venture: Venture): void {
    const { sim } = this;
    for (const id of venture.members) {
      const member = sim.person(id);
      if (member) member.venture = undefined;
    }
    this.list.splice(this.list.indexOf(venture), 1);
    sim.log(`${venture.name} quietly fizzled out`, venture.members);
  }

  /**
   * The founder (and the keenest members) quit to go full-time: into an
   * office a venture that closed left empty, or working from home while a
   * crew builds one on an empty lot.
   */
  private launch(venture: Venture): void {
    const { sim } = this;
    const empty = this.empty[0];
    const lot = empty ? undefined : sim.activeItems().find((item) => item.type.lot && !sim.construction.reserved(item));
    if (!empty && !lot) return;
    sim.addCompany({ id: venture.id, name: venture.name, icon: 'rocket', levels: [] });

    const founder = sim.person(venture.founder)!;
    const fullTime = venture.members
      .map((id) => sim.person(id)!)
      .filter((m) => m === founder || m.traits.ambition >= FULL_TIME_AMBITION.launch);
    for (const member of fullTime) {
      // They walked out of their day job: if this doesn't work out, they might get it back.
      member.formerCompany = member.company;
      sim.employ(member, venture.id);
    }
    const others = fullTime.filter((m) => m !== founder).map((m) => m.name);
    const who = `${founder.name}${others.length ? ` and ${others.join(' and ')}` : ''}`;
    sim.log(`🚀 ${who} quit to run ${venture.name} full-time`, fullTime.map((m) => m.id));

    if (empty) this.takeOver(venture, empty);
    else {
      venture.site = { level: lot!.level, p: lot!.def.p };
      venture.stem = venture.id;
      venture.stage = 'building';
      this.build(venture, lot!, 1, () => this.opened(venture));
    }
  }

  /** Straight into an empty office: new name over the door, and desks for everyone. */
  private takeOver(venture: Venture, empty: EmptyOffice): void {
    const { sim } = this;
    this.empty.splice(this.empty.indexOf(empty), 1);
    venture.site = empty.site;
    venture.stem = empty.stem;
    const level = sim.levels.get(`${empty.stem}-office`)!;
    this.name(venture, level.id, venture.name, venture.founder);
    this.moveIn(venture, level.id);
    venture.stage = empty.tier === 2 ? 'grown' : 'launched';
    venture.funds = FUNDS.start;
    sim.log(`${venture.name} moved into the empty office on the lot`, venture.members);
  }

  /** The builders are done: open the doors and hand out desks. */
  private opened(venture: Venture): void {
    const { sim } = this;
    const office = buildOffice(1, venture.stem!, venture.name);
    const door = doorOf(venture.site!.p);
    sim.addLevel(office.level);
    sim.addPath(venture.site!.level, door);
    sim.addPortal({ kind: 'door', a: { level: venture.site!.level, p: door }, b: { level: office.level.id, p: office.entry } });
    this.moveIn(venture, office.level.id);
    venture.stage = 'launched';
    venture.funds = FUNDS.start;
    sim.log(`${venture.name} opened its first office`, venture.members);
  }

  /** Close the small office and send for the builders again, this time for something bigger. */
  private grow(venture: Venture): void {
    const { sim } = this;
    const building = venture.site && this.buildingOn(venture.site);
    if (!building) return;
    venture.stage = 'rebuilding';
    // Everyone works from home while the builders are in.
    sim.companies.get(venture.id)!.levels = [];
    this.build(venture, building, 2, () => this.moved(venture));
  }

  /** The bigger office is done: move in, bring the keen part-timers across, hire. */
  private moved(venture: Venture): void {
    const { sim } = this;
    const office = buildOffice(2, venture.stem!, venture.name);
    sim.replaceLevel(office.level, office.entry);
    for (const id of venture.members) {
      const member = sim.person(id)!;
      if (member.company !== venture.id && member.traits.ambition >= FULL_TIME_AMBITION.grow) sim.employ(member, venture.id);
    }
    const hires = Array.from({ length: HIRES }, () => sim.hire(newcomer(sim, venture.id)));
    for (const hire of hires) {
      venture.members.push(hire.id);
      hire.venture = venture.id;
    }
    this.moveIn(venture, office.level.id);
    venture.stage = 'grown';
    sim.log(`🏢 ${venture.name} moved into its bigger office and hired ${hires.map((h) => h.name).join(' and ')}`, venture.members);
  }

  /** The Friday takings. Money in hand, it hires; running low, the less committed leave; run out, it closes. */
  private trade(venture: Venture): void {
    const { sim } = this;
    const staff = sim.people.filter((p) => p.company === venture.id);
    const founder = sim.person(venture.founder);
    const pace = staff.length ? staff.reduce((sum, p) => sum + Math.min(1.2, p.stats.weekWork / TICKS_PER_HOUR / FULL_WEEK), 0) / staff.length : 0;
    const takings = (sim.rng.next() - 0.5) * TRADING.luck + (pace - TRADING.par) * TRADING.work + ((founder?.traits.charisma ?? 0.5) - 0.5) * TRADING.charisma;
    venture.funds = Math.min(FUNDS.most, (venture.funds ?? FUNDS.start) + takings);
    if (venture.funds < 0) this.close(venture);
    else if (venture.funds >= FUNDS.hiring) this.hireOne(venture);
    else if (venture.funds < FUNDS.worried) {
      for (const p of staff) {
        if (p.id === venture.founder || p.traits.ambition >= WORRIED.ambition || sim.rng.next() > WORRIED.chance) continue;
        this.leave(venture, p);
        sim.log(`${p.name} left ${venture.name}, worried it won't last`, [p.id]);
      }
    }
  }

  /** Doing well, with a desk free: someone out of work in town, or someone new moving here for it. */
  private hireOne(venture: Venture): void {
    const { sim } = this;
    const office = sim.companies.get(venture.id)?.levels[0];
    const desk = sim.activeItems().some((item) => item.level === office && item.type.desk && !item.def.owner);
    if (!office || !desk) return;
    const local = sim.people.find((p) => !p.npc && !p.company && !p.venture && !p.leaving && p.leftCompany !== venture.id);
    const hire = local ?? sim.hire(newcomer(sim, venture.id));
    sim.employ(hire, venture.id, office);
    venture.members.push(hire.id);
    hire.venture = venture.id;
    sim.log(local ? `${hire.name} started a new job at ${venture.name}` : `${venture.name} hired ${hire.name}, who's moving to town`, [hire.id]);
  }

  /** Out of money: everyone's out of work (their old jobs, the shop, anywhere: careers.ts), and the office is left to let. */
  private close(venture: Venture): void {
    const { sim } = this;
    sim.log(`📉 ${venture.name} ran out of money and closed its doors`, venture.members);
    for (const id of [...venture.members]) {
      const p = sim.person(id);
      if (!p) continue;
      this.leave(venture, p);
      this.resting.set(p.id, sim.tick + REST);
    }
    this.list.splice(this.list.indexOf(venture), 1);
    const office = `${venture.stem}-office`;
    sim.removeCompany(venture.id);
    this.name(venture, office, TO_LET, undefined);
    this.empty.push({ site: venture.site!, stem: venture.stem!, tier: venture.stage === 'grown' ? 2 : 1 });
  }

  /** Off the team: out of a job there, if it was theirs, and free to start something of their own again. */
  private leave(venture: Venture, p: Person): void {
    const { sim } = this;
    venture.members.splice(venture.members.indexOf(p.id), 1);
    p.venture = undefined;
    if (p.company === venture.id) {
      p.leftCompany = venture.id;
      sim.unemploy(p);
    }
  }

  /** The name over the door, and on the office inside. */
  private name(venture: Venture, office: string, name: string, owner: string | undefined): void {
    const { sim } = this;
    const building = venture.site && this.buildingOn(venture.site);
    if (building) {
      building.def.label = name;
      if (owner) building.def.owner = owner;
      else delete building.def.owner;
    }
    const level = sim.levels.get(office);
    if (level) {
      level.name = name;
      const main = level.rooms[0];
      if (main) main.name = name;
    }
    sim.touch([office, ...(venture.site ? [venture.site.level] : [])]);
  }

  /** The office standing on a lot (the small one sits in its middle, the big one fills it). */
  private buildingOn(site: { level: string; p: Tile }): Item | undefined {
    const [x, y] = site.p;
    return this.sim.activeItems().find((item) => item.level === site.level && OFFICES.has(item.def.t) && item.def.p[0] >= x && item.def.p[1] >= y && item.def.p[0] < x + LOT[0] && item.def.p[1] < y + LOT[1]);
  }

  /** Point the company at its office and give everyone who works there a desk. */
  private moveIn(venture: Venture, office: string): void {
    const { sim } = this;
    sim.companies.get(venture.id)!.levels = [office];
    for (const p of sim.people) if (p.company === venture.id) sim.employ(p, venture.id, office);
  }

  /** Send a crew to replace `where` with this venture's tier-`tier` office. */
  private build(venture: Venture, where: Item, tier: Tier, onDone: () => void): void {
    const origin = venture.site!.p;
    // The small office sits in the middle of the lot; the big one fills it. Both doors line up.
    const at: Tile = tier === 1 ? [origin[0] + 2, origin[1] + 2] : [origin[0], origin[1]];
    const office = buildOffice(tier, venture.id, venture.name);
    this.sim.construction.start({
      label: venture.name,
      clears: where,
      siteType: tier === 1 ? 'siteSmall' : 'siteLarge',
      at,
      building: { t: office.building, p: at, label: venture.name, owner: venture.founder },
      door: doorOf(origin),
      hours: BUILD_HOURS[tier],
      onDone,
    });
  }
}

/** The tile in front of a lot's door: every office on a lot opens here. */
function doorOf(lot: Tile): Tile {
  return [lot[0] + 4, lot[1] + 6];
}

// ── Names ───────────────────────────────────────────────────────────────────

const TO_LET = 'To let';
/** Lots are this big (tiles), and these are the offices built on them. */
const LOT: Tile = [9, 6];
const OFFICES = new Set(['startupSmall', 'startupLarge']);

const FIRST = ['Mothball', 'Paper Kite', 'Lanternfish', 'Tiny Robot', 'Honeycomb', 'Blue Fern', 'Quiet Engine', 'Sparrow', 'Marmalade', 'Northstar', 'Pocket', 'Oddfellow'];
const LAST = ['Labs', 'Studio', 'Co.', 'Works', 'Collective', 'HQ', 'Systems'];
const HIRE_NAMES = ['Zoe', 'Omar', 'Tess', 'Kit', 'Ravi', 'June', 'Otto', 'Mina', 'Leo', 'Ivy', 'Noor', 'Finn', 'Ada', 'Remy', 'Sol', 'Bex'];

function ventureName(sim: Simulation): string {
  const taken = new Set(sim.world.companies.map((c) => c.name));
  for (let tries = 0; tries < 20; tries++) {
    const name = `${sim.rng.pick(FIRST)} ${sim.rng.pick(LAST)}`;
    if (!taken.has(name)) return name;
  }
  return `Venture ${sim.world.companies.length}`;
}

/** Someone new moving to town for a job. */
export function newcomer(sim: Simulation, company: string): PersonDef {
  const used = new Set(sim.people.map((p) => p.name));
  const name = HIRE_NAMES.find((n) => !used.has(n)) ?? `New hire ${sim.people.length}`;
  const { rng } = sim;
  return {
    id: `hire-${sim.people.length}-${name.toLowerCase()}`,
    name,
    company,
    look: [rng.int(0, 4), rng.int(0, 6), rng.int(0, 7), rng.int(0, 2)],
    preset: rng.pick(['regular', 'workhorse', 'magnet', 'introvert']),
  };
}
