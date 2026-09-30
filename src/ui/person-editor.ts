// Editing someone from their profile (docs/PEOPLE.md#editing): their name,
// look, department and personality; their household (a new baby, a partner, a
// pet, or someone moving out); letting them go, or seeing them leave town.
// Each change lands in the running town (sim methods) and in the design
// (worlds/edit.ts), which saves as you go.
import { PRESETS } from '../sim/personality.ts';
import type { Person } from '../sim/person.ts';
import { kindOf } from '../sim/roles.ts';
import type { PersonChanges, Simulation } from '../sim/sim.ts';
import type { WorldDef } from '../sim/world.ts';
import { FUR, HAIR, SHIRT, SKIN } from '../render/palette.ts';
import { addFamily, giveJob, letGo, planFamily, removeFamily, removePerson, updatePerson, type Newcomer } from '../worlds/edit.ts';
import { esc } from './html.ts';

/** Hair styles, as characters.ts draws them. */
const STYLES = ['Short', 'Long', 'Bun'];
/** Who can join a household. */
const NEWCOMERS: [value: Newcomer | 'cat' | 'dog', label: string][] = [
  ['child', 'A baby'],
  ['partner', 'A partner'],
  ['cat', 'A cat'],
  ['dog', 'A dog'],
];

export interface PersonEditorHost {
  sim(): Simulation;
  design(): WorldDef;
  /** Something changed: save the design soon. */
  saved(): void;
}

/** Who can be edited: the team, and the families and pets at home. Not venue staff, crews, riders or visitors. */
export function editable(p: Person): boolean {
  return ['employee', 'family', 'pet', 'child'].includes(kindOf(p));
}

export class PersonEditor {
  private readonly host: PersonEditorHost;

  constructor(host: PersonEditorHost) {
    this.host = host;
  }

  /** The form, in place of the profile's usual sections. */
  form(p: Person): string {
    const sim = this.host.sim();
    const human = p.species === 'human';
    const look = p.look;
    const swatches = (part: number, colours: readonly string[]) =>
      `<div class="swatches">${colours
        .map((c, i) => `<button type="button" class="swatch" style="--swatch: ${c}" data-look="${part}:${i}" aria-label="Colour ${i + 1}" aria-pressed="${(look[part] ?? 0) === i}"></button>`)
        .join('')}</div>`;
    const household = p.home ? sim.people.filter((q) => q !== p && q.home === p.home && editable(q)) : [];
    const team = !p.npc;
    return `
      <section class="person-edit">
        <label>Name <input type="text" class="mdst-input" data-edit="name" maxlength="40" value="${esc(p.name)}"></label>
        ${
          human
            ? `<div class="field"><span>Skin</span>${swatches(0, SKIN)}</div>
               <div class="field"><span>Hair</span>${swatches(1, HAIR)}</div>
               <div class="field"><span>Top</span>${swatches(2, SHIRT)}</div>
               <div class="field"><span>Hair style</span><div class="swatches">${STYLES.map((s, i) => `<button type="button" class="mdst-button--sm" data-look="3:${i}" aria-pressed="${(look[3] ?? 0) === i}">${s}</button>`).join('')}</div></div>
               <button type="button" class="mdst-button--sm" data-action="shuffle">Shuffle their look</button>`
            : `<div class="field"><span>Fur</span>${swatches(0, FUR)}</div>`
        }
        ${
          team
            ? `<label>Department <input type="text" class="mdst-input" data-edit="dept" list="departments" value="${esc(sim.world.departments.find((d) => d.id === p.dept)?.name ?? '')}" placeholder="None">
               <datalist id="departments">${sim.world.departments.map((d) => `<option value="${esc(d.name)}"></option>`).join('')}</datalist></label>`
            : ''
        }
        ${team ? this.work(p) : ''}
        ${
          human
            ? `<label>Personality <select class="mdst-dropdown--sm" data-edit="preset">${Object.entries(PRESETS)
                .map(([id, preset]) => `<option value="${id}"${id === p.preset ? ' selected' : ''}>${esc(preset.label)}: ${esc(preset.blurb)}</option>`)
                .join('')}</select></label>`
            : ''
        }
        ${
          p.home && (team || household.length)
            ? `<div class="field"><span>Household</span>
                <ul class="household">${household
                  .map((q) => `<li><button type="button" class="link" data-person="${q.id}">${esc(q.name)}</button><button type="button" class="mdst-button--sm mdst-button--ghost" data-move-out="${q.id}">Move out</button></li>`)
                  .join('')}</ul>
                <button type="button" class="mdst-button--sm" data-action="show-newcomer">+ Add to household</button>
                <div class="newcomer" hidden>
                  <label>Who <select class="mdst-dropdown--sm" data-edit="newcomer-kind">${NEWCOMERS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
                  <label>Name <input type="text" class="mdst-input" data-edit="newcomer" maxlength="40" placeholder="Their name"></label>
                  <div class="buttons"><button type="button" class="mdst-button--sm" data-add>Add</button><button type="button" class="mdst-button--sm mdst-button--ghost" data-action="hide-newcomer">Cancel</button></div>
                </div></div>`
            : ''
        }
        <div class="leaving">
          ${team ? '<button type="button" class="mdst-button--sm" data-action="leave-town">Leave town</button>' : '<button type="button" class="mdst-button--sm" data-action="move-out">Move out</button>'}
        </div>
        <p class="status mdst-p--sm" data-field="edit-status"></p>
      </section>`;
  }

  /** A change from the form. Returns a line for the status, and whether the profile should be rebuilt. */
  handle(p: Person, target: HTMLElement): { say?: string; bad?: boolean; rebuild?: boolean } | null {
    const { dataset } = target;
    if (dataset.look) {
      const [part, value] = dataset.look.split(':').map(Number) as [number, number];
      const look = [...p.look];
      look[part] = value;
      this.change(p, { look });
      return { rebuild: true };
    }
    if (dataset.action === 'shuffle') {
      const rng = () => Math.random();
      this.change(p, { look: [SKIN, HAIR, SHIRT, STYLES].map((list) => Math.floor(rng() * list.length)) });
      return { rebuild: true };
    }
    if (dataset.edit === 'name' && (target as HTMLInputElement).value.trim()) {
      this.change(p, { name: (target as HTMLInputElement).value });
      return { rebuild: true };
    }
    if (dataset.edit === 'dept') return this.department(p, (target as HTMLInputElement).value);
    if (dataset.edit === 'preset') {
      this.change(p, { preset: (target as HTMLSelectElement).value });
      return { say: 'A new personality: it shows in what they do from now on.', rebuild: true };
    }
    if (dataset.action === 'show-newcomer' || dataset.action === 'hide-newcomer') return this.showNewcomer(target, dataset.action === 'show-newcomer');
    if (dataset.add !== undefined) {
      const kind = target.closest('.newcomer')?.querySelector<HTMLSelectElement>('[data-edit="newcomer-kind"]')?.value ?? 'child';
      return this.addTo(p, kind as Newcomer | 'cat' | 'dog', target);
    }
    if (dataset.edit === 'work') {
      const company = (target as HTMLSelectElement).value;
      return company ? this.hire(p, company) : this.letGo(p);
    }
    if (dataset.moveOut) return this.moveOut(dataset.moveOut);
    if (dataset.action === 'move-out') return this.moveOut(p.id);
    if (dataset.action === 'leave-town') return this.leaveTown(p);
    return null;
  }

  /** Where they work: any company that isn't a venture, or out of work. A venture's people answer to themselves. */
  private work(p: Person): string {
    const sim = this.host.sim();
    const venture = sim.ventures.of(p);
    if (venture && p.company === venture.id) return `<div class="field"><span>Works at</span><p class="mdst-p--sm">${esc(venture.name)}, their own venture</p></div>`;
    const places = [...sim.companies.values()].filter((c) => !sim.ventures.isVenture(c.id));
    return `<label>Works at <select class="mdst-dropdown--sm" data-edit="work">
      <option value=""${p.company ? '' : ' selected'}>Out of work</option>
      ${places.map((c) => `<option value="${c.id}"${c.id === p.company ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
    </select></label>`;
  }

  /** The household's Add form: shown, or put away again. */
  private showNewcomer(button: HTMLElement, show: boolean): { rebuild: boolean } {
    const field = button.closest('.field');
    const form = field?.querySelector<HTMLElement>('.newcomer');
    const open = field?.querySelector<HTMLElement>('[data-action="show-newcomer"]');
    if (form) form.hidden = !show;
    if (open) open.hidden = show;
    if (show) form?.querySelector<HTMLInputElement>('[data-edit="newcomer"]')?.focus();
    return { rebuild: false };
  }

  // ── Changes, in the running town and in the design ────────────────────────

  private change(p: Person, changes: PersonChanges): void {
    this.host.sim().editPerson(p, changes);
    updatePerson(this.host.design(), p.id, changes);
    this.host.saved();
  }

  private department(p: Person, name: string): { say: string; rebuild: boolean } {
    const design = this.host.design();
    updatePerson(design, p.id, { dept: name });
    // The design makes a new department if it needs one; the town gets it too.
    const dept = design.departments.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());
    const sim = this.host.sim();
    if (dept && !sim.world.departments.some((d) => d.id === dept.id)) sim.world.departments.push(structuredClone(dept));
    sim.editPerson(p, { dept: dept?.id ?? '' });
    this.host.saved();
    return { say: dept ? `${p.name} is in ${dept.name} now.` : `${p.name} isn’t in a department now.`, rebuild: true };
  }

  private addTo(p: Person, what: Newcomer | 'cat' | 'dog', button: HTMLElement): { say: string; bad?: boolean; rebuild?: boolean } {
    const sim = this.host.sim();
    const input = button.closest('.newcomer')?.querySelector<HTMLInputElement>('[data-edit="newcomer"]');
    const kind: Newcomer = what === 'cat' || what === 'dog' ? 'pet' : what;
    const name = input?.value.trim() || { child: 'Baby', partner: 'Someone', pet: what === 'dog' ? 'Rex' : 'Tibbs' }[kind];
    // Checked against the town as it is (its beds and school desks), then made in both.
    const plan = planFamily(sim.world, p.home!, kind, name, what === 'dog' ? 'dog' : 'cat');
    if (typeof plan === 'string') return { say: plan, bad: true };
    const design = this.host.design();
    if (design.levels.some((l) => l.id === p.home)) addFamily(design, plan);
    if (plan.desk) {
      const desk = sim.activeItems().find((i) => i.level === plan.desk!.level && i.def.t === 'schoolDesk' && i.def.p[0] === plan.desk!.p[0] && i.def.p[1] === plan.desk!.p[1]);
      if (desk) desk.def.owner = plan.def.id;
    }
    sim.arrivals.welcome(structuredClone(plan.def), kind === 'child');
    this.host.saved();
    return { say: kind === 'child' ? `A car’s bringing ${plan.def.name} home.` : `${plan.def.name} is on their way.`, rebuild: true };
  }

  private moveOut(id: string): { say: string; rebuild: boolean } | null {
    const sim = this.host.sim();
    const q = sim.person(id);
    if (!q) return null;
    // The last one whose home it is takes the family and pets with them.
    const household = sim.lastAtHome(q);
    if (!confirm(`${q.name} moves out of town, for good${household ? ', with the family and pets they live with' : ''}?`)) return null;
    sim.moveOut(q);
    if (q.npc) removeFamily(this.host.design(), id);
    else removePerson(this.host.design(), id);
    this.host.saved();
    return { say: `${q.name} is moving out.`, rebuild: true };
  }

  /** Give them a job: a free desk at `company` (their own, if they still have one there). */
  private hire(p: Person, id: string): { say: string; bad?: boolean; rebuild: boolean } {
    const sim = this.host.sim();
    const company = sim.companies.get(id);
    if (!company) return { say: 'There’s no such place.', bad: true, rebuild: true };
    const desks = sim.activeItems().filter((i) => i.type.desk && company.levels.includes(i.level));
    const desk = desks.find((i) => i.def.owner === p.id) ?? desks.find((i) => !i.def.owner);
    if (!desk) return { say: `There’s no free desk at ${company.name}: add one in the map editor first.`, bad: true, rebuild: true };
    sim.employ(p, id, desk.level);
    p.formerCompany = p.leftCompany = undefined;
    sim.log(`💼 ${p.name} started work at ${company.name}`, [p.id]);
    giveJob(this.host.design(), p.id, id);
    this.host.saved();
    return { say: `${p.name} works at ${company.name} now.`, rebuild: true };
  }

  private letGo(p: Person): { say: string; rebuild: boolean } {
    const sim = this.host.sim();
    if (!p.company) return { say: `${p.name} is out of work already.`, rebuild: true };
    sim.careers.leave(p, 'fired');
    letGo(this.host.design(), p.id);
    this.host.saved();
    return { say: `${p.name} will look for work somewhere else.`, rebuild: true };
  }

  private leaveTown(p: Person): { say: string; rebuild: boolean } | null {
    if (!confirm(`${p.name} leaves town for good, with anyone they live with?`)) return null;
    this.host.sim().leaveTown(p);
    removePerson(this.host.design(), p.id);
    this.host.saved();
    return { say: `${p.name} is leaving town.`, rebuild: true };
  }
}
