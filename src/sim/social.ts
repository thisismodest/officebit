// Conversations and what comes of them (docs/RELATIONSHIPS.md): walking up to
// someone, interrupting them at their desk, chats that bring people together
// or grate, rows, walk-offs, and crowds round the charismatic. The numbers
// live in relationships.ts; this is where they meet the story.
import { TICKS_PER_HOUR } from './clock.ts';
import { IN_LOVE } from './love.ts';
import { asleep, atDesk, type Person } from './person.ts';
import { DISLIKE, pairKey, type Turn } from './relationships.ts';
import { roleOf } from './roles.ts';
import type { Simulation } from './sim.ts';

/** Game ticks before the same pair's walk-off or row makes the news again, and before a crowd round someone does. */
const GRUDGE_COOLDOWN = 24 * TICKS_PER_HOUR;
const CROWD_COOLDOWN = TICKS_PER_HOUR;
/** A crowd: this many people standing within this many tiles of someone charismatic (this charismatic, at least). */
const CROWD = 3;
const CROWD_RADIUS = 1.8;
const CROWD_CHARISMA = 0.6;
/** How much being interrupted knocks someone's focus. */
const FOCUS_LOST = 0.5;

export class Social {
  private readonly sim: Simulation;
  private readonly lastGrudge = new Map<string, number>();
  private readonly lastCrowd = new Map<string, number>();

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Can these two make friends or fall out? People only; not anyone just passing through. */
  bonds(a: Person, b: Person): boolean {
    return a.species === 'human' && b.species === 'human' && roleOf(a).relationships && roleOf(b).relationships;
  }

  /** `p` has walked up to `target` to talk. */
  engage(p: Person, target: Person): void {
    const { sim } = this;
    if (target.status.activity === 'focus') {
      sim.log(`${p.name} tried to talk to ${target.name}, but they had headphones on`, [p.id, target.id]);
      p.timer = 15;
      return;
    }
    p.talkingTo = target.id;
    if (this.bonds(p, target) && sim.affinity(p, target) <= DISLIKE) this.grudge(p, target, `${p.name} and ${target.name} had words`);
    if (atDesk(target)) {
      target.distracted = Math.round(p.timer * (1 - 0.6 * target.traits.diligence));
      if (target.focus > 0.3) sim.log(`${p.name} interrupted ${target.name} mid-flow`, [p.id, target.id]);
      if (this.bonds(p, target)) this.feel(p, target, sim.relationships.interrupted(p, target));
      target.focus = Math.max(0, target.focus - FOCUS_LOST);
      target.stats.interrupted++;
      target.stats.weekInterrupted++;
      p.stats.interruptions++;
    } else if (target.phase === 'doing' && !target.talkingTo && !asleep(target)) {
      target.talkingTo = p.id;
    }
    if (p.venture) sim.ventures.pitch(p, target);
    sim.love.met(p, target);
    if (p.role === 'staff') target.lastServed = sim.tick;
    this.noticeCrowd(target);
  }

  /** `ticks` more of a conversation: on good terms it brings them together; keeping someone from their work (at their desk, or still thrown by it) grates. */
  talked(p: Person, target: Person, ticks: number): void {
    const { relationships, love } = this.sim;
    if (!this.bonds(p, target)) return;
    if (atDesk(target) || target.distracted > 0) this.feel(p, target, relationships.distracting(p, target, ticks));
    else this.feel(p, target, relationships.together(p, target, ticks, love.partnerOf(p) === target ? IN_LOVE : 0));
  }

  /** Time spent together doing something else (gaming on the sofa). */
  together(a: Person, b: Person, ticks: number): void {
    if (this.bonds(a, b)) this.feel(a, b, this.sim.relationships.together(a, b, ticks));
  }

  /** Something between two people who don't get on, unless it's happened lately. */
  grudge(a: Person, b: Person, text: string): void {
    const key = pairKey(a, b);
    if (this.sim.tick - (this.lastGrudge.get(key) ?? -Infinity) < GRUDGE_COOLDOWN) return;
    this.lastGrudge.set(key, this.sim.tick);
    this.sim.log(text, [a.id, b.id]);
  }

  /** A relationship crossed a line: that's news. */
  private feel(a: Person, b: Person, turn: Turn): void {
    if (turn === 'friends') this.sim.log(`${a.name} and ${b.name} have become good friends`, [a.id, b.id]);
    if (turn === 'fell-out') this.sim.log(`${a.name} and ${b.name} have fallen out`, [a.id, b.id]);
  }

  /** A crowd round someone charismatic is news; a family round the kitchen table isn't. */
  private noticeCrowd(p: Person): void {
    const { sim } = this;
    if (p.npc || p.traits.charisma < CROWD_CHARISMA || sim.levels.get(p.level)?.kind === 'home') return;
    if (sim.crowdAt(p.level, p.x, p.y, CROWD_RADIUS, p) < CROWD) return;
    if (sim.tick - (this.lastCrowd.get(p.id) ?? -Infinity) < CROWD_COOLDOWN) return;
    this.lastCrowd.set(p.id, sim.tick);
    sim.log(`A crowd is gathering around ${p.name}`, [p.id, ...sim.near(p.level, p.x, p.y, CROWD_RADIUS, p).map((q) => q.id)]);
  }
}
