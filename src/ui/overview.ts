// The world overview (docs/UI.md): the whole town at a glance — every
// workplace and venue with who's there, ventures and building work, and how
// the homes are doing. Click a place to go and look; from a workplace's …
// menu, order pizza or run a fire drill (docs/INTERACTIONS.md).
import { isWeekend } from '../sim/clock.ts';
import { asleep } from '../sim/person.ts';
import { occupants } from '../sim/places.ts';
import type { Simulation } from '../sim/sim.ts';
import type { LevelDef } from '../sim/world.ts';
import { esc } from './html.ts';
import { icon, iconButton, isIcon, type IconName } from './icons.ts';

export type OfficeEvent = 'pizza' | 'drill';
const EVENTS: [OfficeEvent, IconName, string][] = [
  ['pizza', 'pizza', 'Order pizza'],
  ['drill', 'bell', 'Fire drill'],
];

/** Kitchens with fewer meals than this count as running low. */
const LOW_PANTRY = 4;

export class Overview {
  private readonly root: HTMLElement;
  private html = '';
  private sim: Simulation | null = null;
  /** The company whose … menu is open. */
  private menu: string | null = null;

  constructor(root: HTMLElement, onVisit: (level: string) => void, onEvent: (company: string, event: OfficeEvent) => void) {
    this.root = root;
    root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>('[data-event]');
      if (item?.dataset.event && item.dataset.company) {
        this.openMenu(null);
        return onEvent(item.dataset.company, item.dataset.event as OfficeEvent);
      }
      const more = target.closest<HTMLElement>('[data-more]')?.dataset.more;
      if (more) return this.openMenu(more === this.menu ? null : more);
      const level = target.closest<HTMLElement>('[data-level]')?.dataset.level;
      if (level) onVisit(level);
    });
    // The menu closes when you tap anywhere else, or press Esc.
    document.addEventListener('pointerdown', (event) => {
      if (this.menu && !(event.target as HTMLElement).closest?.('.place-menu, [data-more]')) this.openMenu(null);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.menu) this.openMenu(null);
    });
  }

  private openMenu(company: string | null): void {
    this.menu = company;
    if (this.sim) this.update(this.sim);
  }

  update(sim: Simulation): void {
    this.sim = sim;
    const humans = sim.people.filter((p) => p.species === 'human' && !p.hidden);
    const sleeping = humans.filter(asleep).length;
    const count = (levels: readonly LevelDef[]) => occupants(sim, levels).filter((p) => p.species === 'human').length;
    const levelsOf = (ids: readonly string[]) => ids.map((id) => sim.levels.get(id)).filter((l): l is LevelDef => !!l);

    // Schools are listed under Schools, whoever they employ.
    const workplaces = [...sim.companies.values()].filter((c) => sim.levels.get(c.levels[0] ?? '')?.kind !== 'school').map((c) => {
      const staff = sim.people.filter((p) => p.company === c.id).length;
      const here = count(levelsOf(c.levels));
      const note = c.levels.length === 0 ? 'working from home while the builders are in' : `${here} here now`;
      const menu = c.levels.length && here > 0 ? this.menuFor(c.id) : '';
      return place(c.icon ?? 'office', c.name, `${staff} on the books · ${note}`, c.levels[0], menu);
    });
    const companyLevels = new Set([...sim.companies.values()].flatMap((c) => c.levels));
    const venues = sim.world.levels
      .filter((l) => l.kind === 'venue' && !l.floorOf && !companyLevels.has(l.id))
      .map((l) => place('cup', l.name, `${count(levelsOf(sim.floorsOf(l.id)))} in`, l.id));
    const schools = sim.world.levels.filter((l) => l.kind === 'school' && !l.floorOf).map((l) => {
      const pupils = sim.people.filter((p) => p.role === 'child' && p.works === l.id).length;
      return place('school', l.name, `${pupils} pupils · ${count(levelsOf(sim.floorsOf(l.id)))} in`, l.id);
    });
    const town = sim.world.levels.find((l) => l.kind === 'outside');

    const ventures = sim.ventures.list.map((v) => place('rocket', v.name, `${v.stage} · team of ${v.members.length}`));
    const building = sim.construction.jobs
      .filter((j) => !j.finished)
      .map((j) => place('building', j.label, j.siteItem ? `${Math.round((j.site.progress ?? 0) * 100)}% built` : 'crew on the way'));

    const homes = sim.world.levels.filter((l) => l.kind === 'home' && !l.floorOf);
    // People on any floor of a house are at home.
    const athome = count(sim.world.levels.filter((l) => l.kind === 'home'));
    const low = homes.filter((h) => sim.pantry(h.id) < LOW_PANTRY).length;
    const toLet = sim.housing.vacant().length;

    const html = `
      <section><h3>Today</h3>
        <p class="today mdst-p--sm">${stat(sim.dayOff() ? 'weekend' : 'workday', sim.holiday()?.name ?? (isWeekend(sim.tick) ? 'The weekend' : 'A working day'))}${stat('awake', `${humans.length - sleeping} up and about`)}${stat('asleep', `${sleeping} asleep`)}</p>
        ${town ? place('town', town.name, `${count([town])} out and about`, town.id) : ''}</section>
      <section><h3>Workplaces</h3>${workplaces.join('')}</section>
      ${schools.length ? `<section><h3>Schools</h3>${schools.join('')}</section>` : ''}
      ${venues.length ? `<section><h3>Out and about</h3>${venues.join('')}</section>` : ''}
      ${ventures.length || building.length ? `<section><h3>Ventures and building work</h3>${[...ventures, ...building].join('')}</section>` : ''}
      <section><h3>Homes</h3>
        <p class="today mdst-p--sm">${stat('home', `${athome} at home across ${homes.length} homes${toLet ? ` · ${toLet} to let` : ''}${low ? ` · ${low} kitchen${low === 1 ? '' : 's'} running low` : ''}`)}</p></section>`;
    if (html !== this.html) {
      this.root.innerHTML = html;
      this.html = html;
    }
  }

  /** A workplace's … button, and its menu of things to do there when it's open. */
  private menuFor(company: string): string {
    const open = this.menu === company;
    const items = EVENTS.map(([event, symbol, label]) => `<button type="button" class="mdst-button--sm" data-event="${event}" data-company="${esc(company)}">${icon(symbol)} ${label}</button>`).join('');
    return `<span class="popover-anchor">${iconButton('more', 'More', `data-more="${esc(company)}" aria-haspopup="true" aria-expanded="${open}"`)}${open ? `<div class="place-menu popover mdst-card mdst-card--compact">${items}</div>` : ''}</span>`;
  }
}

/** A row for a place: its icon (an icon name, or a world's own text, like an emoji), name, a line about it, and buttons. */
function place(symbol: string, name: string, detail: string, level?: string, extra = ''): string {
  const button = level ? iconButton('visit', `Visit ${esc(name)}`, `data-level="${esc(level)}"`) : '';
  const mark = isIcon(symbol) ? icon(symbol) : `<span class="mark">${esc(symbol)}</span>`;
  return `<div class="place">${mark}<div class="about"><strong>${esc(name)}</strong><small class="mdst-p--muted">${esc(detail)}</small></div><span class="actions">${extra}${button}</span></div>`;
}

/** One fact about today, after its icon. */
function stat(symbol: IconName, text: string): string {
  return `<span class="stat">${icon(symbol)}${esc(text)}</span>`;
}
