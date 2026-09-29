// The directory (docs/UI.md): everyone in the world — staff, family, pets,
// crews — searchable, and grouped by where they are, where they work or who
// they live with. Click someone to open their profile and follow them, even
// when they're nowhere near the screen.
import type { Person } from '../sim/person.ts';
import type { Simulation } from '../sim/sim.ts';
import type { Renderer } from '../render/renderer.ts';
import { describe } from './describe.ts';
import { esc } from './html.ts';
import { describeRole, groupOf } from './who.ts';

type GroupBy = 'place' | 'work' | 'home';

/** Thumbnail scale: sprite pixels to CSS pixels. */
const THUMB_SCALE = 2;
/** Rows of a character sprite to show: head and shoulders, below the headroom. */
const BUST: [top: number, height: number] = [2, 14];

interface Row {
  root: HTMLLIElement;
  doing: HTMLElement;
}

export class Directory {
  private readonly list: HTMLOListElement;
  private readonly search: HTMLInputElement;
  private readonly groupBy: HTMLSelectElement;
  private readonly renderer: Renderer;
  private rows = new Map<string, Row>();
  private headers = new Map<string, HTMLLIElement>();

  constructor(root: HTMLElement, renderer: Renderer, onPick: (id: string) => void) {
    this.renderer = renderer;
    root.innerHTML = `
      <div class="directory-tools">
        <input type="search" placeholder="Find someone…" aria-label="Find someone">
        <select aria-label="Group by" class="mdst-dropdown--sm">
          <option value="place">Where they are</option>
          <option value="work">Where they work</option>
          <option value="home">Who they live with</option>
        </select>
      </div>
      <ol class="directory"></ol>`;
    this.search = root.querySelector('input')!;
    this.groupBy = root.querySelector('select')!;
    this.list = root.querySelector('ol')!;
    this.list.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (row?.dataset.id) onPick(row.dataset.id);
    });
  }

  /** A new world: forget every row. */
  reset(): void {
    this.rows.clear();
    this.headers.clear();
    this.list.replaceChildren();
  }

  update(sim: Simulation, selected: string | null): void {
    const query = this.search.value.trim().toLowerCase();
    const by = this.groupBy.value as GroupBy;
    const groups = new Map<string, Person[]>();
    for (const p of sim.people) {
      if (query && !p.name.toLowerCase().includes(query)) continue;
      const group = groupOf(p, sim, by);
      groups.set(group, [...(groups.get(group) ?? []), p]);
    }

    const children: HTMLElement[] = [];
    for (const [name, people] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      children.push(this.headerFor(name, people.length));
      for (const p of people) {
        const row = this.rowFor(p, sim);
        row.root.toggleAttribute('data-selected', p.id === selected);
        const doing = describe(p, sim);
        if (row.doing.textContent !== doing) row.doing.textContent = doing;
        children.push(row.root);
      }
    }
    // Only touch the DOM if the order or grouping actually changed.
    if (children.length !== this.list.children.length || children.some((el, i) => this.list.children[i] !== el)) {
      this.list.replaceChildren(...children);
    }
  }

  private headerFor(name: string, count: number): HTMLLIElement {
    let li = this.headers.get(name);
    if (!li) {
      li = document.createElement('li');
      li.className = 'group';
      this.headers.set(name, li);
    }
    const text = `${name} · ${count}`;
    if (li.textContent !== text) li.textContent = text;
    return li;
  }

  private rowFor(p: Person, sim: Simulation): Row {
    let row = this.rows.get(p.id);
    if (!row) {
      const root = document.createElement('li');
      root.dataset.id = p.id;
      root.innerHTML = `
        <button type="button" class="mdst-button--ghost">
          <span class="thumb"><canvas></canvas></span>
          <span class="who">
            <span class="line"><strong>${esc(p.name)}</strong><span class="doing mdst-p--sm"></span></span>
            <small class="mdst-p--muted">${esc(describeRole(p, sim))}</small>
          </span>
        </button>`;
      paintThumb(root.querySelector('canvas')!, this.renderer.portrait(p), p.species === 'human');
      row = { root, doing: root.querySelector('.doing')! };
      this.rows.set(p.id, row);
    }
    return row;
  }
}

/** Draw someone's sprite at its true proportions: people as a head-and-shoulders crop, pets whole. */
function paintThumb(canvas: HTMLCanvasElement, sprite: HTMLCanvasElement, bust: boolean): void {
  const [top, height] = bust ? BUST : [0, sprite.height];
  canvas.width = sprite.width;
  canvas.height = height;
  canvas.style.width = `${sprite.width * THUMB_SCALE}px`;
  canvas.style.height = `${height * THUMB_SCALE}px`;
  canvas.getContext('2d')!.drawImage(sprite, 0, top, sprite.width, height, 0, 0, sprite.width, height);
}
