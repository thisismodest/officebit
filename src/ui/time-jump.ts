// The clock's panel (docs/TIME.md#modes): Live or Sandbox, and in Sandbox the speeds, jumping ahead to a later time
// (the same story it would have lived anyway: the sim is deterministic), or a fresh town on another day altogether,
// to see it at Halloween.
import { TICKS_PER_DAY, TICKS_PER_HOUR, dayOf, tickAt } from '../sim/clock.ts';
import type { Simulation } from '../sim/sim.ts';
import { popover, type Toggle } from './popover.ts';
import type { Mode, Timekeeper } from './timekeeper.ts';

export interface TimeJumpHost {
  sim(): Simulation;
  time: Timekeeper;
  /** Start the jump to a later tick. */
  jump(to: number): void;
  /** A fresh town in sandbox, from 06:00 on this day. */
  startOn(day: Date): void;
  setMode(mode: Mode): void;
  setSpeed(speed: number): void;
}

const SPEEDS = [1, 4, 16, 60];

export class TimeJump {
  private readonly root: HTMLElement;
  private readonly host: TimeJumpHost;
  private readonly toggle: Toggle;

  constructor(button: HTMLElement, host: TimeJumpHost) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'time-jump popover mdst-card mdst-card--compact';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="mode-switch" role="group" aria-label="Time">
        <button type="button" class="mdst-button--sm" data-mode="live">Live</button>
        <button type="button" class="mdst-button--sm" data-mode="sandbox">Sandbox</button>
      </div>
      <p class="mdst-p--sm mdst-p--muted" data-for="live">Follows your clock<span class="since"></span>.</p>
      <div data-for="sandbox">
        <h3>Speed</h3>
        <fieldset class="speeds" aria-label="Speed">
          ${SPEEDS.map((speed) => `<button type="button" class="mdst-button--sm" data-speed="${speed}">${speed}×</button>`).join('')}
        </fieldset>
        <h3>Jump ahead</h3>
        <div class="presets">
          <button type="button" class="mdst-button--sm" data-jump="hour">In an hour</button>
          <button type="button" class="mdst-button--sm" data-jump="morning">8am tomorrow</button>
          <button type="button" class="mdst-button--sm" data-jump="monday">Next Monday</button>
          <button type="button" class="mdst-button--sm" data-jump="week">A week on</button>
        </div>
        <form title="It fast-forwards to then and carries on from there">
          <label class="mdst-p--sm">Day <input type="number" name="day" min="1" inputmode="numeric"></label>
          <label class="mdst-p--sm">at <input type="time" name="time" value="09:00"></label>
          <button type="submit" class="mdst-button--sm mdst-button--inverted">Go</button>
        </form>
        <p class="status mdst-p--sm bad" role="status"></p>
        <h3>Another day</h3>
        <form class="another-day" title="A fresh town from 06:00 that day: to see what it's like at Halloween, say">
          <input type="date" name="date" aria-label="Start the town on">
          <button type="submit" class="mdst-button--sm">Start</button>
        </form>
      </div>`;
    button.after(this.root);
    this.toggle = popover(button, this.root, () => this.reset());
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-jump], [data-mode], [data-speed]');
      const { jump, mode, speed } = target?.dataset ?? {};
      if (jump) this.go(this.presetTick(jump));
      if (mode && mode !== this.host.time.mode) this.host.setMode(mode as Mode);
      if (speed) this.host.setSpeed(Number(speed));
    });
    this.root.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      this.go(this.chosenTick());
    });
    this.root.querySelector('.another-day')!.addEventListener('submit', (event) => {
      event.preventDefault();
      const [year, month, day] = this.input('date').value.split('-').map(Number);
      if (!year || !month || !day) return;
      // Midday, so it's that day however the clocks fall.
      this.host.startOn(new Date(year, month - 1, day, 12));
      this.toggle(false);
    });
  }

  /** The mode and speed as they are now: Live is just the clock; Sandbox has the rest. */
  update(): void {
    const { mode, speed, since } = this.host.time;
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-speed]')) button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed));
    for (const part of this.root.querySelectorAll<HTMLElement>('[data-for]')) part.hidden = part.dataset.for !== mode;
    this.root.querySelector('.since')!.textContent = since
      ? `, running since ${new Date(since).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
      : '';
  }

  /** Fresh choices each time it opens, starting from now. */
  private reset(): void {
    const { sim } = this.host;
    const tick = sim().tick;
    this.update();
    // Days of the story, as the clock numbers them.
    const day = this.input('day');
    const today = dayOf(tick) - sim().firstDay + 1;
    day.min = String(today);
    day.value = String(today + 1);
    // Another day: the town's own date to start with.
    const date = this.host.sim().dateOf();
    this.input('date').value = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    this.say('');
  }

  private presetTick(preset: string): number {
    const tick = this.host.sim().tick;
    const today = dayOf(tick);
    switch (preset) {
      case 'hour':
        return tick + TICKS_PER_HOUR;
      case 'morning':
        return tickAt(today + 1, 8);
      case 'monday':
        return tickAt(today + (7 - (today % 7)), 9);
      default:
        return tick + 7 * TICKS_PER_DAY;
    }
  }

  /** The day and time typed in. */
  private chosenTick(): number {
    const day = Number(this.input('day').value) - 1 + this.host.sim().firstDay;
    const [hh = 9, mm = 0] = this.input('time').value.split(':').map(Number);
    return tickAt(day, hh + mm / 60);
  }

  private go(to: number): void {
    const now = this.host.sim().tick;
    const problem = !Number.isFinite(to) ? 'Pick a time to go to.' : to <= now + 1 ? "That's not ahead of now." : null;
    if (problem) {
      this.say(problem);
      return;
    }
    this.host.jump(to);
    this.toggle(false);
  }

  private input(name: string): HTMLInputElement {
    return this.root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  }

  private say(text: string): void {
    this.root.querySelector('.status')!.textContent = text;
  }
}
