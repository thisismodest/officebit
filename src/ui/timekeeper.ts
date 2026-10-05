// Time modes (docs/TIME.md#modes). Live follows your clock: a game second per
// real second, pause only, running since the day it started (so the story
// carries on between visits), catching up (out of sight) on load and whenever
// the tab has been hidden; paused and played again, it goes back to now.
// Sandbox runs at whatever speed you pick. Jumping ahead fast-forwards to a later
// time (a short hop on screen at 60×; further, out of sight behind a progress bar),
// and carries on from there in sandbox. The sim never sees the wall clock; this does.
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_SECOND, dayOf } from '../sim/clock.ts';
import type { Simulation } from '../sim/sim.ts';
import { calendarDate, whereabouts } from './whereabouts.ts';

export type Mode = 'live' | 'sandbox';

/** Real milliseconds per step at 1× (and always, in live mode). */
const STEP_MS = 1000 / TICKS_PER_SECOND;
/** Real milliseconds in one game tick, in live mode (a tick is 6 game seconds). */
export const TICK_MS = 6000;
/** In live mode each step covers this much game time, in ticks: one real step's worth. */
const LIVE_DT = STEP_MS / TICK_MS;
/** Live mode catches up (at full speed) once it falls this many ticks behind the clock. */
const BEHIND = 2;
/** Fast-forwarding may use this much of each frame, in ms, leaving enough to keep the page responsive. */
const FAST_BUDGET_MS = 40;
/** Catching up out of sight (the loading screen; nothing's drawn), it takes bigger bites: the page only has the note to update. */
const CATCH_UP_BUDGET_MS = 250;
/** Catching up, everything but the last stretch is brisk (sim.brisk: no walking, no traffic), so you arrive to the town as it would be: this many ticks (two game hours). */
const FULL_TICKS = 1200;
/** A jump this far (ticks: two game hours) or less plays out on screen, at 60× (ticks per real ms); further, it's out of sight (brisk, as catching up is). */
const SHORT_JUMP = FULL_TICKS;
const JUMP_RATE = (60 * TICKS_PER_SECOND) / 1000;
/** Most steps per frame in sandbox mode, so a slow machine doesn't spiral. */
const MAX_STEPS_PER_FRAME = 100;

/** Where live time is pinned: this sim tick is this wall-clock time (06:00 on the day the town started). */
export interface LiveOrigin {
  tick: number;
  at: number;
}

/** 06:00 on the most recent day, which the sim treats as the start of its day, on the right weekday. */
export function liveOrigin(now: Date): LiveOrigin {
  const start = new Date(now);
  start.setHours(START_HOUR, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const weekday = (start.getDay() + 6) % 7; // Monday is 0, as in the sim
  return { tick: weekday * TICKS_PER_DAY, at: start.getTime() };
}

/** The sim tick that matches a wall-clock time. */
export function liveTick(origin: LiveOrigin, ms: number): number {
  return origin.tick + (ms - origin.at) / TICK_MS;
}

export interface Travel {
  from: number;
  to: number;
  /** Too far to watch: it happens out of sight, behind the progress bar. */
  hidden: boolean;
  /** Live, going back to now after a pause: it stays Live. */
  live?: boolean;
}

export class Timekeeper {
  mode: Mode;
  /** Sandbox speed multiplier; 0 is paused. Live mode only uses 0 (paused) or 1. */
  speed = 1;
  origin: LiveOrigin | null = null;
  /** When live mode started (any time that day, in ms): the town has been running since 06:00 then. Null starts it today. */
  since: number | null = null;
  /** The day Sandbox starts on (any time that day): null starts it today. Pick one to see the town then, at Halloween or Christmas. */
  sandboxDate: Date | null = null;
  travelling: Travel | null = null;
  /** Live mode is behind the clock and catching up: there's nothing worth drawing until it's done. */
  catchingUp = false;
  private carry = 0;
  private readonly now: () => number;

  constructor(mode: Mode, now: () => number = Date.now) {
    this.mode = mode;
    this.now = now;
  }

  get paused(): boolean {
    return this.speed === 0;
  }

  /**
   * Set up a new sim for the current mode, from 06:00 on its first day, with
   * that day's date and your whereabouts for its calendar: in live mode the
   * day it started, catching up to now; in sandbox today, or the day you picked.
   */
  start(sim: Simulation): void {
    this.carry = 0;
    this.travelling = null;
    const day = this.mode === 'live' ? new Date(this.since ?? this.now()) : (this.sandboxDate ?? new Date(this.now()));
    const origin = liveOrigin(day);
    sim.tick = origin.tick;
    sim.firstDay = dayOf(sim.tick);
    sim.calendar = { start: calendarDate(new Date(origin.at)), ...whereabouts(day) };
    if (this.mode !== 'live') {
      this.origin = null;
      return;
    }
    this.origin = origin;
    this.catchUp(sim);
  }

  /** Carry on a Live town restored from a snapshot (snapshot.ts): it catches up from where it was saved, not from its first morning. */
  resume(sim: Simulation): void {
    this.carry = 0;
    this.travelling = null;
    this.origin = liveOrigin(new Date(this.since ?? this.now()));
    this.catchUp(sim);
  }

  /**
   * Up to a day behind: straight to now, before anything is drawn (a fraction of a second).
   * Further: a slice now, and the rest a frame at a time (out of sight), so the page stays responsive.
   */
  private catchUp(sim: Simulation): void {
    const target = liveTick(this.origin!, this.now());
    this.catchingUp = !this.fastForward(sim, target, target - sim.tick <= TICKS_PER_DAY ? Infinity : CATCH_UP_BUDGET_MS);
  }

  /** Jump ahead to a later tick at full speed. Live mode can't be ahead of the clock, so this switches to sandbox. */
  travel(sim: Simulation, to: number): void {
    if (to <= sim.tick) return;
    this.mode = 'sandbox';
    this.origin = null;
    this.travelling = { from: sim.tick, to, hidden: to - sim.tick > SHORT_JUMP };
    this.carry = 0;
    if (this.speed === 0) this.speed = 1;
  }

  /** Played again after a pause in Live: back to now, like a jump ahead. */
  backToNow(sim: Simulation): void {
    if (this.mode !== 'live' || !this.origin) return;
    const to = liveTick(this.origin, this.now());
    if (to - sim.tick <= BEHIND) return;
    this.travelling = { from: sim.tick, to, hidden: to - sim.tick > SHORT_JUMP, live: true };
    this.carry = 0;
  }

  /** Nothing worth drawing: catching up, or a long jump under way. */
  get outOfSight(): boolean {
    return this.catchingUp || !!this.travelling?.hidden;
  }

  /** Stop jumping ahead, wherever it's got to, and carry on from there. */
  stopTravelling(): void {
    this.travelling = null;
  }

  /** Run however many steps this frame needs. Returns how far between steps the view is, 0–1, for smooth drawing. */
  advance(sim: Simulation, elapsed: number): number {
    // Paused again on the way back to now: it waits there.
    if (this.travelling?.live && this.paused) this.travelling = null;
    if (this.travelling) {
      const { to, hidden } = this.travelling;
      // Too far to watch: as fast as it'll go, out of sight. A short hop: at 60×, on screen.
      const there = hidden ? this.fastForward(sim, to, CATCH_UP_BUDGET_MS) : this.hop(sim, to, elapsed);
      if (there) {
        this.travelling = null;
        this.carry = 0;
      }
      return 1;
    }
    this.catchingUp = false;
    if (this.paused) return 1;
    if (this.mode === 'live' && this.origin) {
      const target = liveTick(this.origin, this.now());
      if (target - sim.tick > BEHIND) {
        this.catchingUp = !this.fastForward(sim, target, CATCH_UP_BUDGET_MS);
        this.carry = 0;
        return 1;
      }
      return this.run(elapsed, () => sim.step(LIVE_DT));
    }
    return this.run(elapsed * this.speed, () => sim.step());
  }

  /** A short hop's steps for this frame, at 60× (within the frame's budget), stopping at `to`. True once there. */
  private hop(sim: Simulation, to: number, elapsed: number): boolean {
    this.carry = Math.min(this.carry + elapsed * JUMP_RATE, JUMP_RATE * FAST_BUDGET_MS);
    const until = performance.now() + FAST_BUDGET_MS;
    while (this.carry >= 1 && sim.tick + 1 <= to && performance.now() < until) {
      sim.step();
      this.carry -= 1;
    }
    return sim.tick + 1 > to;
  }

  /** Steps at the real-time rate, carrying the remainder to the next frame. */
  private run(elapsed: number, step: () => void): number {
    this.carry += elapsed;
    let steps = 0;
    while (this.carry >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      step();
      this.carry -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.carry = 0;
    return this.carry / STEP_MS;
  }

  /** Whole-tick steps towards `to`, for up to `budget` ms: brisk (out of sight) till the last stretch. True once there. */
  private fastForward(sim: Simulation, to: number, budget: number): boolean {
    const until = performance.now() + budget;
    while (sim.tick + 1 <= to && performance.now() < until) {
      sim.brisk = to - sim.tick > FULL_TICKS;
      sim.step();
    }
    sim.brisk = false;
    return sim.tick + 1 > to;
  }
}
