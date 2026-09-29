// Jumping ahead (docs/TIME.md#modes): tap the clock to visit a later
// time. The town fast-forwards to it (the same story it would have lived
// anyway: the sim is deterministic) and carries on from there in sandbox.
import { TICKS_PER_DAY, TICKS_PER_HOUR, dayOf, tickAt } from '../sim/clock.ts';
import type { Simulation } from '../sim/sim.ts';
import { popover, type Toggle } from './popover.ts';
import type { Timekeeper } from './timekeeper.ts';

/** Game ticks per real millisecond in live mode (a tick is 6 seconds). */
const TICKS_PER_MS = 1 / 6000;

export interface TimeJumpHost {
  sim(): Simulation;
  time: Timekeeper;
  /** Start the jump to a later tick. */
  jump(to: number): void;
}

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
      <h3>Jump ahead</h3>
      <div class="presets">
        <button type="button" class="mdst-button--sm" data-jump="hour">In an hour</button>
        <button type="button" class="mdst-button--sm" data-jump="morning">Tomorrow at 8</button>
        <button type="button" class="mdst-button--sm" data-jump="monday">Next Monday</button>
        <button type="button" class="mdst-button--sm" data-jump="week">A week on</button>
      </div>
      <form>
        <label class="mdst-p--sm" data-for="live">To <input type="datetime-local" name="when"></label>
        <label class="mdst-p--sm" data-for="sandbox">To day <input type="number" name="day" min="1" inputmode="numeric"> at <input type="time" name="time" value="09:00"></label>
        <button type="submit" class="mdst-button--sm mdst-button--inverted">Go</button>
      </form>
      <p class="mdst-p--sm mdst-p--muted">It fast-forwards to then and carries on from there, in Sandbox.</p>
      <p class="status mdst-p--sm bad" role="status"></p>`;
    button.after(this.root);
    this.toggle = popover(button, this.root, () => this.reset());
    this.root.addEventListener('click', (event) => {
      const preset = (event.target as HTMLElement).closest<HTMLElement>('[data-jump]')?.dataset.jump;
      if (preset) this.go(this.presetTick(preset));
    });
    this.root.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      this.go(this.chosenTick());
    });
  }

  /** Fresh choices each time it opens, starting from now. */
  private reset(): void {
    const { sim, time } = this.host;
    const tick = sim().tick;
    for (const label of this.root.querySelectorAll<HTMLElement>('[data-for]')) label.hidden = label.dataset.for !== time.mode;
    // Start the custom time at tomorrow morning.
    const when = this.input('when');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(8, 0, 0, 0);
    when.min = localValue(new Date());
    when.value = localValue(tomorrow);
    // Days of the story, as the clock numbers them.
    const day = this.input('day');
    const today = dayOf(tick) - sim().firstDay + 1;
    day.min = String(today);
    day.value = String(today + 1);
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

  /** The time typed in: a real date and time in live mode, a day and time in sandbox. */
  private chosenTick(): number {
    const tick = this.host.sim().tick;
    if (this.host.time.mode === 'live') {
      const when = new Date(this.input('when').value).getTime();
      return Number.isNaN(when) ? NaN : tick + (when - Date.now()) * TICKS_PER_MS;
    }
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

/** A date as a datetime-local input wants it: local time, to the minute. */
function localValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

