// The news feed: the sim's event log, newest first. With someone selected,
// "Only them" narrows it to their own story (docs/UI.md).
import { formatTime, weekdayOf } from '../sim/clock.ts';
import type { Person } from '../sim/person.ts';
import type { SimEvent, Simulation } from '../sim/sim.ts';

/** How many events to keep on screen. */
const KEEP = 80;

export class News {
  private readonly list: HTMLOListElement;
  private readonly filter: HTMLLabelElement;
  private readonly only: HTMLInputElement;
  private sim: Simulation | null = null;
  private person: Person | null = null;
  private unsubscribe = () => {};

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <label class="news-filter mdst-p--sm" hidden><input type="checkbox"> Only <span></span></label>
      <ol class="log mdst-p--sm"></ol>`;
    this.filter = root.querySelector('label')!;
    this.only = root.querySelector('input')!;
    this.list = root.querySelector('ol')!;
    this.only.addEventListener('change', () => this.refill());
  }

  setSim(sim: Simulation): void {
    this.unsubscribe();
    this.sim = sim;
    this.person = null;
    this.unsubscribe = sim.onEvent((event) => {
      if (this.shows(event)) this.add(event);
    });
    this.select(null);
  }

  /** Whoever's selected, for the "Only them" filter. */
  select(person: Person | null): void {
    this.person = person;
    this.filter.hidden = !person;
    this.filter.querySelector('span')!.textContent = person?.name ?? '';
    this.refill();
  }

  private get filtering(): boolean {
    return !!this.person && this.only.checked;
  }

  private shows(event: SimEvent): boolean {
    return !this.filtering || event.who.includes(this.person!.id);
  }

  private refill(): void {
    this.list.replaceChildren();
    if (!this.sim) return;
    const events = this.filtering ? this.sim.historyOf(this.person!.id) : this.sim.events;
    for (const event of events) this.add(event);
  }

  private add(event: SimEvent): void {
    const item = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = `${weekdayOf(event.tick)} ${formatTime(event.tick)}`;
    item.append(time, ` ${event.text}`);
    this.list.prepend(item);
    while (this.list.children.length > KEEP) this.list.lastElementChild!.remove();
  }
}
