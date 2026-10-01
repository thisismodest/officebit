// Adding someone to the team (docs/PEOPLE.md#editing): a small form at the top
// of the People tab. They're added to the design (`addPerson` in
// worlds/edit.ts: a desk, and a house to let) and to the running town, where
// they walk in from the edge of town (`sim.arrivals.newStarter`) like anyone new.
import { CATALOG } from '../sim/catalog.ts';
import { PRESETS } from '../sim/personality.ts';
import type { Simulation } from '../sim/sim.ts';
import type { WorldDef } from '../sim/world.ts';
import { addPerson, removePerson } from '../worlds/edit.ts';
import { esc } from './html.ts';

export interface TeamFormHost {
  sim(): Simulation;
  design(): WorldDef;
  /** Something changed: save the design soon. */
  saved(): void;
  /** Open someone's profile. */
  pick(id: string): void;
}

export class TeamForm {
  private readonly host: TeamFormHost;
  private readonly open: HTMLButtonElement;
  private readonly form: HTMLFormElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement, host: TeamFormHost) {
    this.host = host;
    const box = document.createElement('div');
    box.className = 'team-add';
    box.innerHTML = `
      <button type="button" class="mdst-button--sm" data-action="open">+ Add someone to the team</button>
      <form class="mdst-card mdst-card--compact" hidden>
        <label>Name <input type="text" class="mdst-input--sm" name="name" maxlength="40" required autocomplete="off"></label>
        <label>Works at <select class="mdst-dropdown--sm" name="company"></select></label>
        <label>Department <input type="text" class="mdst-input--sm" name="dept" list="team-add-depts" placeholder="None" autocomplete="off"></label>
        <datalist id="team-add-depts"></datalist>
        <label>Personality <select class="mdst-dropdown--sm" name="preset">${Object.entries(PRESETS)
          .map(([id, preset]) => `<option value="${id}">${esc(preset.label)}</option>`)
          .join('')}</select></label>
        <div class="buttons">
          <button type="submit" class="mdst-button--sm">Add</button>
          <button type="button" class="mdst-button--sm mdst-button--ghost" data-action="cancel">Cancel</button>
        </div>
      </form>
      <p class="status mdst-p--sm" role="status"></p>`;
    root.prepend(box);
    this.open = box.querySelector('[data-action="open"]')!;
    this.form = box.querySelector('form')!;
    this.status = box.querySelector('.status')!;
    this.open.addEventListener('click', () => this.show(true));
    box.querySelector('[data-action="cancel"]')!.addEventListener('click', () => this.show(false));
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.add();
    });
    this.form.addEventListener('keydown', (event) => {
      // Typing here isn't steering the map; Esc puts the form away.
      event.stopPropagation();
      if (event.key === 'Escape') this.show(false);
    });
  }

  /** The form, filled in with the town's workplaces and departments as they are now; or put away. */
  private show(on: boolean): void {
    this.form.hidden = !on;
    this.open.hidden = on;
    if (!on) return;
    const sim = this.host.sim();
    const places = [...sim.companies.values()].filter((c) => !sim.ventures.isVenture(c.id));
    this.field<HTMLSelectElement>('company').innerHTML = places.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    this.form.querySelector('datalist')!.innerHTML = sim.world.departments.map((d) => `<option value="${esc(d.name)}">`).join('');
    this.field<HTMLSelectElement>('preset').value = 'regular';
    this.field<HTMLInputElement>('name').value = '';
    this.field<HTMLInputElement>('dept').value = '';
    this.say('');
    this.field<HTMLInputElement>('name').focus();
  }

  /** Into the design, then into the town: the same desk and home where they're free there too. */
  private add(): void {
    const sim = this.host.sim();
    const design = this.host.design();
    const name = this.field<HTMLInputElement>('name').value.trim();
    const company = sim.companies.get(this.field<HTMLSelectElement>('company').value);
    if (!name || !company) return;
    const { id, notes } = addPerson(design, { name, dept: this.field<HTMLInputElement>('dept').value, preset: this.field<HTMLSelectElement>('preset').value, company: company.id });
    if (sim.person(id)) {
      removePerson(design, id);
      return this.say(`There’s someone called ${name} in town already: try another name.`);
    }
    const def = structuredClone(design.people.find((p) => p.id === id)!);
    // A department new to the design is new to the town too.
    const dept = design.departments.find((d) => d.id === def.dept);
    if (dept) sim.addDepartment(dept);
    // Their desk: the one the design gave them, if it's free in the town; otherwise any free one at work, their department's kind first.
    const mine = design.levels.flatMap((l) => l.furniture.filter((f) => f.owner === id && CATALOG[f.t]?.desk).map((f) => ({ level: l.id, p: f.p })))[0];
    const free = sim.activeItems().filter((i) => i.type.desk && !i.def.owner && company.levels.includes(i.level));
    const desk =
      free.find((i) => mine && i.level === mine.level && i.def.p[0] === mine.p[0] && i.def.p[1] === mine.p[1]) ?? free.find((i) => i.def.t === dept?.station) ?? free[0];
    if (desk) desk.def.owner = id;
    // Their home: the design's if it's to let in the town too; otherwise the town finds them one.
    if (def.home && !sim.housing.vacant().some((h) => h.level.id === def.home)) delete def.home;
    sim.arrivals.newStarter(def);
    sim.log(`👋 ${name} joined ${company.name}`, [id]);
    this.host.saved();
    this.show(false);
    this.say([`${name} is on their way in.`, ...notes].join(' '));
    this.host.pick(id);
  }

  private field<T extends HTMLElement>(name: string): T {
    return this.form.querySelector<T>(`[name="${name}"]`)!;
  }

  private say(text: string): void {
    this.status.textContent = text;
  }
}
