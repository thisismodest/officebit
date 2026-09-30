// The profile: a slide-out over the right of the stage for whoever's
// selected (docs/UI.md). Anyone, including family, pets, staff and crews.
// Built once per person, then updated in place a few times a second. Edit
// swaps its sections for a form (person-editor.ts).
import { PersonalityBrain } from '../sim/brain.ts';
import type { Person } from '../sim/person.ts';
import type { Traits } from '../sim/personality.ts';
import { DISLIKE, FRIENDS } from '../sim/relationships.ts';
import type { Simulation } from '../sim/sim.ts';
import type { Renderer } from '../render/renderer.ts';
import { formatTime, weekdayOf } from '../sim/clock.ts';
import { describe, presetLabel, whereIs } from './describe.ts';
import { esc } from './html.ts';
import { iconButton } from './icons.ts';
import { editable, type PersonEditor } from './person-editor.ts';
import { describeRole, householdOf, optionLabel, routineOf } from './who.ts';
import { roleOf } from '../sim/roles.ts';

const NEEDS = [
  ['energy', 'Energy'],
  ['hunger', 'Fed'],
  ['social', 'Social'],
  ['fun', 'Fun'],
] as const;
const TRAITS: [keyof Traits, string][] = [
  ['social', 'Social'],
  ['diligence', 'Diligent'],
  ['chaos', 'Chaotic'],
  ['charisma', 'Charismatic'],
  ['ambition', 'Ambitious'],
];
/** How many friends, and people they don't get on with, to show. */
const FRIENDS_SHOWN = 4;
const FOES_SHOWN = 2;
/** How many of their options to show under "Thinking about". */
const THOUGHTS = 4;
/** How many of their latest events to show under "Lately". */
const RECENT = 6;
/** Portrait scale: sprite pixels to CSS pixels. */
const PORTRAIT_SCALE = 4;

export interface ProfileCallbacks {
  follow(id: string | null): void;
  close(): void;
  pick(id: string): void;
  /** Take control of them, or let go (docs/INTERACTIONS.md). */
  control(id: string | null): void;
}

export class Profile {
  private readonly root: HTMLElement;
  private readonly renderer: Renderer;
  private readonly callbacks: ProfileCallbacks;
  private readonly brain = new PersonalityBrain();
  private readonly editor: PersonEditor | undefined;
  private id: string | null = null;
  private sim: Simulation | null = null;
  private controlling = false;
  /** Showing the edit form; `keepEditing` carries it over to a household member you open from it. */
  private editing = false;
  private keepEditing = false;
  private fields = new Map<string, HTMLElement>();

  constructor(host: HTMLElement, renderer: Renderer, callbacks: ProfileCallbacks, editor?: PersonEditor) {
    this.renderer = renderer;
    this.callbacks = callbacks;
    this.editor = editor;
    this.root = document.createElement('aside');
    this.root.className = 'profile';
    this.root.setAttribute('aria-label', 'Profile');
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-person], [data-look], [data-add], [data-move-out]');
      if (!target) return;
      if (target.dataset.person) {
        this.keepEditing = this.editing;
        return this.callbacks.pick(target.dataset.person);
      }
      if (target.dataset.action === 'edit') return this.setEditing(!this.editing);
      if (this.editing && target.closest('.person-edit')) return this.edit(target);
      if (target.dataset.action === 'close') this.callbacks.close();
      if (target.dataset.action === 'follow') {
        this.callbacks.follow(this.renderer.camera.following === this.id ? null : this.id);
      }
      if (target.dataset.action === 'control' && this.id) this.callbacks.control(this.controlling ? null : this.id);
    });
    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      if (this.editing && target.dataset.edit && !target.dataset.edit.startsWith('newcomer')) this.edit(target);
    });
    // Clicks in the profile shouldn't reach the map underneath.
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    host.append(this.root);
  }

  /** How much of the stage the profile covers from the bottom (it slides up on phones), in CSS px. */
  coveredHeight(): number {
    return this.id ? this.root.offsetHeight : 0;
  }

  open(p: Person, sim: Simulation): void {
    if (p.id !== this.id) this.editing = this.keepEditing && editable(p);
    this.keepEditing = false;
    this.id = p.id;
    this.sim = sim;
    this.build(p, sim);
    this.root.dataset.open = '';
    this.update(sim);
  }

  close(): void {
    this.id = null;
    this.editing = false;
    delete this.root.dataset.open;
  }

  update(sim: Simulation): void {
    const p = this.id ? sim.person(this.id) : undefined;
    if (!p) {
      if (this.id) this.callbacks.close();
      return;
    }
    this.sim = sim;
    const set = (key: string, text: string) => {
      const el = this.fields.get(key);
      if (el && el.textContent !== text) el.textContent = text;
    };
    const following = this.renderer.camera.following === p.id;
    this.toggle('follow', following, following ? 'Stop following' : 'Follow');
    // While you edit, the form's all there is.
    if (this.editing) return;
    set('doing', describe(p, sim));
    set('where', whereIs(p, sim) || '—');
    for (const [need] of NEEDS) (this.fields.get(`need-${need}`) as HTMLMeterElement).value = p.needs[need];
    (this.fields.get('need-focus') as HTMLMeterElement).value = p.focus;

    // Friends and thoughts change slowly; rebuild them as lists.
    this.list(
      'friends',
      relationshipsOf(p, sim).map(
        ([q, affinity]) =>
          `<li><span><button type="button" class="link" data-person="${q.id}">${esc(q.name)}</button> <small class="mdst-p--muted">${feeling(affinity)}</small></span><meter min="-1" max="1" low="${DISLIKE}" high="${FRIENDS}" optimum="1" value="${affinity}"></meter></li>`,
      ),
    );
    // Only people their personality drives: not builders on the job, or riders and visitors on an errand.
    const thoughts = p.species === 'human' && p.role !== 'crew' && roleOf(p).day !== 'errand' ? sim.peek(() => this.brain.options(p, sim)) : [];
    const top = thoughts.sort((a, b) => b.score - a.score).slice(0, THOUGHTS);
    const max = Math.max(0.01, ...top.map((o) => o.score));
    this.list('thoughts', top.map((o) => `<li><span>${esc(optionLabel(o.intent, sim, p))}</span><meter min="0" max="1" value="${Math.max(0, o.score / max)}"></meter></li>`));
    this.root.querySelector('[data-field="thoughts"]')!.closest('section')!.hidden = top.length === 0;
    this.list('recent', [...sim.historyOf(p.id)].slice(-RECENT).reverse().map((e) => `<li><time>${weekdayOf(e.tick)} ${formatTime(e.tick)}</time> ${esc(e.text)}</li>`));
    set('stats', statsOf(p));
    this.controlling = sim.interactions.isControlled(p);
    this.toggle('control', this.controlling, this.controlling ? 'Let go' : 'Take control');
    set('venture', ventureOf(p, sim));
    set('love', loveOf(p, sim));
  }

  private build(p: Person, sim: Simulation): void {
    this.root.innerHTML = `
      <header>
        <canvas class="portrait"></canvas>
        <div class="who">
          <div class="title">
            <h2 class="mdst-h"></h2>
            <button type="button" class="mdst-button--ghost mdst-button--sm" data-action="close" aria-label="Close">✕</button>
          </div>
          <p class="role mdst-p--sm mdst-p--muted"></p>
          <div class="meta">
            <span class="mdst-badge mdst-badge--sm mdst-badge--muted"></span>
            <div class="actions">
              ${iconButton('follow', 'Follow', 'data-action="follow" aria-pressed="false"')}
              ${roleOf(p).controllable && !this.editing ? iconButton('control', 'Take control', 'data-action="control" aria-pressed="false"') : ''}
              ${this.editor && editable(p) ? iconButton(this.editing ? 'done' : 'edit', this.editing ? 'Done editing' : 'Edit', `data-action="edit" aria-pressed="${this.editing}"`) : ''}
            </div>
          </div>
        </div>
      </header>
      ${this.editing && this.editor ? this.editor.form(p) : this.sections(p, sim)}`;
    this.fill(p, sim);
  }

  private sections(p: Person, sim: Simulation): string {
    const household = householdOf(p, sim);
    return `
      <section><h3>Now</h3><p data-field="doing"></p><p class="mdst-p--sm mdst-p--muted" data-field="where"></p></section>
      <section><h3>Needs</h3><dl class="bars">${[...NEEDS, ['focus', 'Focus']]
        .map(([key, label]) => `<dt>${label}</dt><dd><meter data-field="need-${key}" min="0" max="1" low="0.25" high="0.5" optimum="1"></meter></dd>`)
        .join('')}</dl></section>
      <section><h3>Personality</h3><dl class="bars">${TRAITS.map(([key, label]) => `<dt>${label}</dt><dd><meter min="0" max="1" value="${p.traits[key]}"></meter></dd>`).join('')}</dl></section>
      <section><h3>Their day</h3><p class="mdst-p--sm">${esc(routineOf(p))}</p></section>
      <section><h3>Life</h3>
        <p class="mdst-p--sm">${esc(sim.levels.get(p.home ?? '')?.name ?? 'No fixed abode')}${household.length ? ', with' : ''}</p>
        ${household.length ? `<p class="people-links">${household.map((q) => `<button type="button" class="mdst-button--sm" data-person="${q.id}">${esc(q.name)}</button>`).join('')}</p>` : ''}
        <p class="mdst-p--sm" data-field="love"></p>
        <p class="mdst-p--sm" data-field="venture"></p>
      </section>
      <section><h3>Lately</h3><ol class="log mdst-p--sm" data-field="recent"></ol></section>
      <section><h3>Relationships</h3><ol class="bars-list" data-field="friends"></ol></section>
      <section><h3>Thinking about</h3><ol class="bars-list" data-field="thoughts"></ol></section>
      <section><h3>So far</h3><p class="mdst-p--sm mdst-p--muted" data-field="stats"></p></section>`;
  }

  /** The name, role and portrait at the top, and the fields to update. */
  private fill(p: Person, sim: Simulation): void {
    this.root.querySelector('h2')!.textContent = p.name;
    this.root.querySelector('.role')!.textContent = describeRole(p, sim);
    this.root.querySelector('.mdst-badge')!.textContent = presetLabel(p.preset);
    this.fields = new Map([...this.root.querySelectorAll<HTMLElement>('[data-field]')].map((el) => [el.dataset.field!, el]));

    const sprite = this.renderer.portrait(p);
    const portrait = this.root.querySelector<HTMLCanvasElement>('.portrait')!;
    portrait.width = sprite.width;
    portrait.height = sprite.height;
    portrait.style.width = `${sprite.width * PORTRAIT_SCALE}px`;
    portrait.style.height = `${sprite.height * PORTRAIT_SCALE}px`;
    portrait.getContext('2d')!.drawImage(sprite, 0, 0);
  }

  /** An on/off button in the actions row: pressed or not, and its tooltip saying what a press would do. */
  private toggle(action: string, on: boolean, label: string): void {
    const button = this.root.querySelector(`.actions [data-action="${action}"]`);
    if (!button || button.getAttribute('aria-pressed') === String(on) && button.getAttribute('title') === label) return;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('title', label);
    button.setAttribute('aria-label', label);
  }

  private setEditing(on: boolean): void {
    const p = this.id && this.sim ? this.sim.person(this.id) : undefined;
    if (!p || !this.sim) return;
    this.editing = on;
    this.build(p, this.sim);
    if (!on) this.update(this.sim);
  }

  /** A change from the edit form: made, then the profile rebuilt to show it (with a word on what happened). */
  private edit(target: HTMLElement): void {
    const p = this.id && this.sim ? this.sim.person(this.id) : undefined;
    if (!p || !this.sim || !this.editor) return;
    const result = this.editor.handle(p, target);
    if (!result) return;
    if (result.rebuild) this.build(p, this.sim);
    const status = this.fields.get('edit-status');
    if (status && result.say) {
      status.textContent = result.say;
      status.classList.toggle('bad', !!result.bad);
    }
  }

  private list(field: string, items: string[]): void {
    const el = this.fields.get(field);
    const html = items.length ? items.join('') : '<li class="mdst-p--muted">—</li>';
    if (el && el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  }
}

/** Their closest friends, then anyone they don't get on with. */
function relationshipsOf(p: Person, sim: Simulation): [Person, number][] {
  const all = sim.relationships.of(p, sim.people.filter((q) => q.species === 'human'));
  const friends = all.filter(([, a]) => a > 0.05).slice(0, FRIENDS_SHOWN);
  const foes = all.filter(([, a]) => a <= DISLIKE).slice(0, FOES_SHOWN);
  return [...friends, ...foes];
}

function feeling(affinity: number): string {
  if (affinity >= 0.8) return 'close';
  if (affinity >= FRIENDS) return 'friends';
  if (affinity > 0) return 'getting on';
  return affinity <= -0.7 ? "can't stand" : "don't get on";
}

function loveOf(p: Person, sim: Simulation): string {
  const couple = sim.love.coupleOf(p);
  const partner = sim.love.partnerOf(p);
  if (!couple || !partner) return '';
  if (p.date) return `💞 On a date with ${partner.name}`;
  return couple.together ? `❤️ Lives with ${partner.name}` : `💘 Seeing ${partner.name}`;
}

function ventureOf(p: Person, sim: Simulation): string {
  const venture = sim.ventures.of(p);
  if (!venture) return p.ideas > 0 ? '💡 Has a big idea they tinker with' : '';
  const role = venture.founder === p.id ? 'Founder of' : p.company === venture.id ? 'Works at' : 'Moonlighting on';
  return `🚀 ${role} ${venture.name} (${venture.stage})`;
}

function statsOf(p: Person): string {
  const parts = [];
  if (p.stats.work > 0) parts.push(`${Math.round(p.stats.work / 600)} hours of good work`);
  if (p.stats.interruptions) parts.push(`interrupted others ${p.stats.interruptions}×`);
  if (p.stats.interrupted) parts.push(`been interrupted ${p.stats.interrupted}×`);
  return parts.join(' · ') || 'Nothing much yet';
}
