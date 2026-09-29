// The map editor (docs/BUILDER.md): a floating toolbar over the stage. Move
// furniture (and, outside, whole buildings) by dragging it, add it from a
// picker, delete what's selected; outside, draw roads and paths freehand, put
// in zebra crossings, and rub things out; and undo (up to 50 steps, forgotten
// when you finish). Only safe spots are allowed (worlds/placement.ts, and
// worlds/ground.ts for roads); the outline goes red, and says why, where
// something can't go. Clicking the same spot again picks what's underneath (a
// rug under a sofa). Changes apply to the running town and to the design it
// was built from, so saving keeps them (except in places the story built
// itself, like a startup's office, which the design doesn't have).
import { CATALOG } from '../sim/catalog.ts';
import { interiorOf } from '../sim/places.ts';
import type { Item, Simulation } from '../sim/sim.ts';
import type { FurnitureDef, LevelDef, Rect, Tile, WorldDef } from '../sim/world.ts';
import type { Ghost, Renderer } from '../render/renderer.ts';
import { TILE, canvas } from '../render/pixels.ts';
import { HOME } from '../render/props/home.ts';
import { OFFICE } from '../render/props/office.ts';
import { PAINTERS } from '../render/props/index.ts';
import { SCHOOL } from '../render/props/school.ts';
import { VENUE } from '../render/props/venue.ts';
import { buildingMoveProblem, flipHouse, isBuilding, moveBuilding, moveFurniture, placeFurniture, removeFurniture, snapshot, type Snapshot } from '../worlds/edit.ts';
import { CLEARABLE, addCrossing, brush, crossingAt, erase, groundProblem, joinsUp, lay, strokeRects, type Surface } from '../worlds/ground.ts';
import { isCovering, placementProblem } from '../worlds/placement.ts';
import type { Grab } from './controls.ts';
import { esc } from './html.ts';
import { iconButton } from './icons.ts';

type Tool = 'move' | 'add' | Surface | 'crossing' | 'erase';
/** Tools for the ground outside: they only work on the town map. */
const GROUND_TOOLS = new Set<Tool>(['road', 'path', 'crossing', 'erase']);
const HOUSES = new Set(['terrace', 'house', 'detached']);

/** What the picker offers indoors and out. Buildings, houses, lots and building sites are placed some other way. */
const OUTSIDE_ONLY = ['tree', 'bush', 'flowers', 'bench', 'lamppost', 'pond'];
const NOT_PLACEABLE = new Set(['stairs', 'officeBuilding', 'diner', 'supermarket', 'school', 'house', 'terrace', 'detached', 'lot', 'siteSmall', 'siteLarge', 'startupSmall', 'startupLarge', 'foodTruck', 'pizza']);
const INDOOR_GROUPS: [string, string[]][] = [
  ['Office', Object.keys(OFFICE)],
  ['Home', Object.keys(HOME)],
  ['Venues', Object.keys(VENUE)],
  ['School', Object.keys(SCHOOL)],
];
/** Thumbnail size in the picker, CSS px. */
const THUMB = 52;
/** Steps of undo kept while editing. */
const UNDO_STEPS = 50;

/** One change, with what it takes to undo it. */
type Change =
  | { kind: 'add' | 'remove'; level: string; def: FurnitureDef }
  | { kind: 'move'; level: string; t: string; from: Tile; to: Tile }
  /** Roads, paths and buildings: the whole map as it was, in the town and in the design. */
  | { kind: 'map'; level: string; before: Snapshot[] };

export interface EditorHost {
  sim(): Simulation;
  design(): WorldDef;
  renderer: Renderer;
  tileAt(clientX: number, clientY: number): Tile;
}

export class Editor {
  active = false;
  private tool: Tool = 'move';
  private adding: string | null = null;
  private selected: Item | null = null;
  private readonly host: EditorHost;
  private readonly bar: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly status: HTMLElement;
  private pickerLevel = '';
  private readonly undos: Change[] = [];

  constructor(stage: HTMLElement, host: EditorHost, onDone: () => void) {
    this.host = host;
    this.bar = document.createElement('div');
    this.bar.className = 'editor mdst-card mdst-card--compact';
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Edit the map');
    this.bar.hidden = true;
    this.bar.innerHTML = `
      ${iconButton('move', 'Move: drag furniture or a building to move it', 'data-tool="move"')}
      ${iconButton('add', 'Add furniture', 'data-tool="add"')}
      <span class="divider"></span>
      ${iconButton('road', 'Road: drag to draw one', 'data-tool="road"')}
      ${iconButton('path', 'Path: drag to draw one', 'data-tool="path"')}
      ${iconButton('crossing', 'Zebra crossing: click a road', 'data-tool="crossing"')}
      ${iconButton('erase', 'Rub out roads, paths, pavements and crossings', 'data-tool="erase"')}
      <span class="divider"></span>
      ${iconButton('flip', 'Turn the house round', 'data-action="flip" disabled')}
      ${iconButton('trash', 'Delete what’s selected (Delete)', 'data-action="delete"')}
      ${iconButton('undo', 'Undo (Ctrl+Z)', 'data-action="undo" disabled')}
      <span class="divider"></span>
      ${iconButton('done', 'Done editing', 'data-action="done"')}`;
    this.status = document.createElement('p');
    this.status.className = 'editor-status mdst-p--sm';
    this.status.hidden = true;
    this.picker = document.createElement('div');
    this.picker.className = 'editor-picker mdst-card mdst-card--compact';
    this.picker.hidden = true;
    stage.append(this.bar, this.status, this.picker);

    this.bar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('button');
      if (button?.dataset.tool) this.setTool(button.dataset.tool as Tool);
      if (button?.dataset.action === 'delete') this.deleteSelected();
      if (button?.dataset.action === 'flip') this.flipSelected();
      if (button?.dataset.action === 'undo') this.undo();
      if (button?.dataset.action === 'done') onDone();
    });
    this.picker.addEventListener('click', (event) => {
      const t = (event.target as HTMLElement).closest<HTMLElement>('[data-type]')?.dataset.type;
      if (!t) return;
      this.adding = t;
      for (const b of this.picker.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.type === t));
      this.say(`Click the map to put down the ${CATALOG[t]!.name.toLowerCase()}.`);
    });
    for (const el of [this.bar, this.picker]) el.addEventListener('pointerdown', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (!this.active || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Delete' || event.key === 'Backspace') this.deleteSelected();
      if (event.key === 'Escape') this.select(null);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo();
      }
    });
  }

  /** Is this part of the editor (its toolbar, status line or picker)? */
  contains(node: Node): boolean {
    return [this.bar, this.status, this.picker].some((el) => el.contains(node));
  }

  open(): void {
    this.active = true;
    this.bar.hidden = false;
    this.setTool('move');
  }

  /** Finish editing: the undo steps go with it. */
  close(): void {
    this.active = false;
    this.undos.length = 0;
    this.showUndo();
    this.bar.hidden = this.picker.hidden = this.status.hidden = true;
    this.select(null);
    this.host.renderer.ghost = null;
  }

  /** A click on the map while editing: place, or select. Clicking what's selected again picks what's underneath it. */
  click(x: number, y: number): void {
    const tile = this.host.tileAt(x, y);
    if (this.tool === 'add') {
      this.place(tile);
      return;
    }
    if (this.tool === 'crossing') {
      this.crossing(tile);
      return;
    }
    // A tap with a brush: one dab of road or path, or one tile rubbed out.
    if (GROUND_TOOLS.has(this.tool)) {
      this.paint([tile]);
      return;
    }
    const here = this.itemsAt(x, y);
    const i = this.selected ? here.indexOf(this.selected) : -1;
    this.select(here[i >= 0 ? (i + 1) % here.length : 0] ?? null);
  }

  /** The outline under the pointer: where the new piece would go, or what you'd pick up. */
  hover(x: number, y: number): boolean {
    const { renderer } = this.host;
    if (GROUND_TOOLS.has(this.tool)) {
      renderer.ghost = this.groundPreview([this.host.tileAt(x, y)]);
      return true;
    }
    if (this.tool === 'add' && this.adding) {
      const tile = this.host.tileAt(x, y);
      const problem = this.problemAt(this.adding, tile);
      renderer.ghost = [this.outline(this.adding, tile, problem)];
      this.say(problem ?? `Click to put down the ${CATALOG[this.adding]!.name.toLowerCase()}.`, !!problem);
      return true;
    }
    const item = this.itemAt(x, y);
    renderer.ghost = item && item !== this.selected ? [this.outline(item.def.t, item.def.p, null)] : this.selection();
    return !!item;
  }

  /** Undo the last change, back to how it was. */
  undo(): void {
    const change = this.undos.pop();
    this.showUndo();
    if (!change) {
      this.say('Nothing to undo.', true);
      return;
    }
    const { level } = change;
    if (change.kind === 'add') {
      const item = this.find(level, change.def.t, change.def.p);
      if (item) this.take(item);
    } else if (change.kind === 'remove') {
      this.put(level, change.def);
    } else if (change.kind === 'move') {
      const item = this.find(level, change.t, change.to);
      if (item) this.shift(item, change.from);
    } else if (change.kind === 'map') {
      for (const before of change.before) before.restore();
      this.host.sim().edited(level);
    }
    this.select(null);
    this.say('Undone.');
  }

  /** Press on a piece of furniture with the move tool: drag it somewhere else. */
  grab(x: number, y: number): Grab | null {
    if (this.tool === 'road' || this.tool === 'path' || this.tool === 'erase') return this.stroke(this.host.tileAt(x, y));
    if (this.tool !== 'move') return null;
    // Drag what's selected if you press on it, even with something else drawn on top.
    const here = this.itemsAt(x, y);
    const item = this.selected && here.includes(this.selected) ? this.selected : here[0];
    if (!item) return null;
    const start = this.host.tileAt(x, y);
    const offset: Tile = [item.def.p[0] - start[0], item.def.p[1] - start[1]];
    const target = (cx: number, cy: number): Tile => {
      const [tx, ty] = this.host.tileAt(cx, cy);
      return [tx + offset[0], ty + offset[1]];
    };
    return {
      move: (cx, cy) => {
        const to = target(cx, cy);
        const problem = this.building(item) ? buildingMoveProblem(this.host.sim().world, item.level, item.def, to) : this.problemAt(item.def.t, to, item);
        this.host.renderer.ghost = [this.outline(item.def.t, to, problem)];
        this.say(problem ?? 'Let go to put it here.', !!problem);
      },
      drop: (cx, cy) => (this.building(item) ? this.moveBuildingTo(item, target(cx, cy)) : this.move(item, target(cx, cy))),
      release: () => this.select(item),
    };
  }

  /** Keep the picker in step with the level on screen (indoors and out offer different things). */
  update(): void {
    if (!this.active) return;
    const outside = this.outside();
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('[data-tool]')) b.disabled = GROUND_TOOLS.has(b.dataset.tool as Tool) && !outside;
    if (GROUND_TOOLS.has(this.tool) && !outside) this.setTool('move');
    if (this.tool === 'add' && this.pickerLevel !== this.host.renderer.level) this.fillPicker();
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    this.picker.hidden = tool !== 'add';
    if (tool === 'add') {
      this.select(null);
      this.fillPicker();
      this.say(this.adding ? `Click the map to put down the ${CATALOG[this.adding]!.name.toLowerCase()}.` : 'Pick something to add.');
    } else if (GROUND_TOOLS.has(tool)) {
      this.select(null);
      this.say(GROUND_HINTS[tool as keyof typeof GROUND_HINTS]);
    } else {
      this.say(this.outside() ? 'Drag furniture or a building to move it, or click it to select it.' : 'Drag furniture to move it, or click it to select it.');
    }
  }

  private fillPicker(): void {
    const { renderer, sim } = this.host;
    this.pickerLevel = renderer.level;
    const outside = sim().levels.get(renderer.level)?.kind === 'outside';
    const groups: [string, string[]][] = outside ? [['Outside', OUTSIDE_ONLY]] : INDOOR_GROUPS.map(([name, types]) => [name, types.filter((t) => !OUTSIDE_ONLY.includes(t))]);
    if (this.adding && !groups.some(([, types]) => types.includes(this.adding!))) this.adding = null;
    this.picker.innerHTML = groups
      .map(([name, types]) => {
        const items = types.filter((t) => CATALOG[t] && PAINTERS[t] && !NOT_PLACEABLE.has(t));
        return items.length
          ? `<h4>${name}</h4><div class="grid">${items.map((t) => `<button type="button" data-type="${t}" title="${esc(CATALOG[t]!.name)}" aria-label="${esc(CATALOG[t]!.name)}" aria-pressed="${t === this.adding}"></button>`).join('')}</div>`
          : '';
      })
      .join('');
    for (const button of this.picker.querySelectorAll<HTMLElement>('[data-type]')) {
      const name = document.createElement('span');
      name.textContent = CATALOG[button.dataset.type!]!.name;
      button.append(thumbnail(button.dataset.type!), name);
    }
  }

  private place(tile: Tile): void {
    const t = this.adding;
    if (!t) {
      this.say('Pick something to add.', true);
      return;
    }
    const level = this.host.renderer.level;
    const problem = this.problemAt(t, tile) ?? (this.designed(level) ? placeFurniture(this.host.design(), level, t, tile) : null);
    if (problem) {
      this.say(problem, true);
      return;
    }
    this.host.sim().addItem(level, { t, p: tile });
    this.remember({ kind: 'add', level, def: { t, p: tile } });
    this.say(`Added a ${CATALOG[t]!.name.toLowerCase()}. Click again to add another.${this.storyNote(level)}`);
  }

  private move(item: Item, to: Tile): void {
    const [from, t] = [item.def.p, item.def.t];
    if (from[0] === to[0] && from[1] === to[1]) {
      this.select(item);
      return;
    }
    const problem = this.problemAt(t, to, item) ?? (this.designed(item.level) ? moveFurniture(this.host.design(), item.level, t, from, to) : null);
    if (problem) {
      this.select(item);
      this.say(problem, true);
      return;
    }
    this.host.sim().moveItem(item, to);
    this.remember({ kind: 'move', level: item.level, t, from, to });
    this.select(item);
    this.say(`Moved the ${item.type.name.toLowerCase()}.${this.storyNote(item.level)}`);
  }

  private deleteSelected(): void {
    const item = this.selected;
    if (!item || this.building(item)) {
      this.say(item ? 'Buildings stay: move them instead.' : 'Click something to select it first.', true);
      return;
    }
    const def = this.take(item);
    this.remember({ kind: 'remove', level: item.level, def });
    this.select(null);
    this.say(`Deleted the ${item.type.name.toLowerCase()}.${this.storyNote(item.level)}`);
  }

  // ── Buildings, roads and paths ────────────────────────────────────────────

  /** Is this a building that moves with its doors and path (rather than a piece of furniture)? */
  private building(item: Item): boolean {
    return this.outside(item.level) && isBuilding(this.host.sim().world, item.level, item.def);
  }

  private moveBuildingTo(item: Item, to: Tile): void {
    const [from, t] = [item.def.p, item.def.t];
    if (from[0] === to[0] && from[1] === to[1]) {
      this.select(item);
      return;
    }
    // Selected first, so if it can't go there, the reason is what's left on the status line.
    this.select(item);
    const done = this.reshape(item.level, (world) => {
      const def = this.defIn(world, item, t, from);
      if (!def) return null;
      const problem = buildingMoveProblem(world, item.level, def, to);
      if (problem) return problem;
      moveBuilding(world, item.level, def, to);
      return null;
    });
    if (done) {
      this.select(item);
      this.say(`Moved ${this.nameOf(item)}.${this.doorNote(item)}`);
    }
  }

  private flipSelected(): void {
    const item = this.selected;
    if (!item || !HOUSES.has(item.def.t)) return;
    const [t, at] = [item.def.t, item.def.p];
    const done = this.reshape(item.level, (world) => {
      const def = this.defIn(world, item, t, at);
      const result = def ? flipHouse(world, item.level, def) : null;
      return typeof result === 'string' ? result : null;
    });
    if (done) {
      this.select(item);
      this.say(`Turned the house round.${this.doorNote(item)}`);
    }
  }

  /** The building in `world` (the running town's, or the design's) that `item` is. */
  private defIn(world: WorldDef, item: Item, t: string, [x, y]: Tile): FurnitureDef | undefined {
    if (world === this.host.sim().world) return item.def;
    return world.levels.find((l) => l.id === item.level)?.furniture.find((f) => f.t === t && f.p[0] === x && f.p[1] === y);
  }

  /** A tip if a building's front door doesn't join up with a path or road yet. */
  private doorNote(item: Item): string {
    const level = this.host.sim().levels.get(item.level);
    const [w, h] = item.type.size;
    const door: Tile = [item.def.p[0] + Math.min(1, w - 1), item.def.faces === 'up' ? item.def.p[1] - 1 : item.def.p[1] + h];
    return level && !joinsUp(level, door) ? ' Its front door doesn’t join up with a pavement yet: draw a path to it.' : '';
  }

  /** Drag with a brush: the stroke follows the pointer along the grid, turning where you turn, and backs up if you go back over it. */
  private stroke(start: Tile): Grab {
    const tiles: Tile[] = [start];
    let blocked: Tile | null = null;
    const extend = (to: Tile) => {
      blocked = null;
      for (let steps = 0; steps < 400; steps++) {
        const last = tiles.at(-1)!;
        const [dx, dy] = [to[0] - last[0], to[1] - last[1]];
        if (dx === 0 && dy === 0) return;
        // Keep going the way the stroke is going until the pointer's level with it, then turn.
        const before = tiles.at(-2);
        const alongX = before ? before[1] === last[1] : Math.abs(dx) >= Math.abs(dy);
        const step: Tile = (alongX && dx !== 0) || dy === 0 ? [last[0] + Math.sign(dx), last[1]] : [last[0], last[1] + Math.sign(dy)];
        const back = tiles.findIndex((t) => t[0] === step[0] && t[1] === step[1]);
        if (back >= 0) {
          tiles.length = back + 1;
          continue;
        }
        if (this.tool !== 'erase' && this.brushProblem(step)) {
          blocked = step;
          return;
        }
        tiles.push(step);
      }
    };
    return {
      move: (cx, cy) => {
        extend(this.host.tileAt(cx, cy));
        const preview = this.groundPreview(tiles);
        if (blocked) preview.push({ rect: this.brushRect(blocked), tone: 'bad' });
        this.host.renderer.ghost = preview;
        const problem = blocked && this.brushProblem(blocked);
        if (problem) this.say(problem, true);
        else this.say(this.tool === 'erase' ? 'Let go to rub it out.' : 'Let go to lay it.');
      },
      drop: () => this.paint(tiles),
      release: () => {},
    };
  }

  /** Lay a stroke of road or path, or rub one out. */
  private paint(tiles: Tile[]): void {
    const level = this.host.renderer.level;
    const tool = this.tool;
    if (tool !== 'erase' && tool !== 'road' && tool !== 'path') return;
    const problem = tool === 'erase' ? null : tiles.map((t) => this.brushProblem(t)).find(Boolean);
    if (problem) {
      this.say(problem, true);
      return;
    }
    let cleared = 0;
    let erased = false;
    const done = this.reshape(level, (world) => {
      const map = world.levels.find((l) => l.id === level);
      if (!map) return null;
      if (tool === 'erase') {
        for (const t of tiles) erased = erase(map, t) || erased;
        return world === this.host.sim().world && !erased ? 'There’s no road, path, pavement or crossing there.' : null;
      }
      const gone = lay(map, strokeRects(tiles, tool), tool);
      if (world === this.host.sim().world) cleared = gone.length;
      return null;
    });
    if (!done) return;
    this.host.renderer.ghost = null;
    const what = tool === 'erase' ? 'Rubbed it out' : tool === 'road' ? 'Laid a road' : 'Laid a path';
    this.say(`${what}.${cleared ? ` Cleared ${cleared === 1 ? 'a tree or bush' : `${cleared} trees, bushes and the like`} out of the way.` : ''}${this.storyNote(level)}`);
  }

  private crossing(tile: Tile): void {
    const level = this.host.renderer.level;
    const done = this.reshape(level, (world) => {
      const map = world.levels.find((l) => l.id === level);
      const problem = map ? addCrossing(map, tile) : null;
      return world === this.host.sim().world ? problem : null;
    });
    if (done) this.say('Put in a zebra crossing.');
  }

  /** What a stroke would do, for the outline: the ground it covers, and the small things it would clear. */
  private groundPreview(tiles: Tile[]): Ghost[] {
    const level = this.level();
    if (!level) return [];
    const last = tiles.at(-1)!;
    if (this.tool === 'crossing') {
      const at = crossingAt(level, last);
      return [{ rect: at ?? [last[0], last[1], 1, 1], tone: at ? 'ok' : 'bad' }];
    }
    if (this.tool === 'erase') return tiles.map((t) => ({ rect: [t[0], t[1], 1, 1], tone: 'bad' }));
    const surface = this.tool as Surface;
    const rects = strokeRects(tiles, surface);
    const problem = tiles.length === 1 ? this.brushProblem(last) : null;
    const reach = surface === 'road' ? rects.map(([x, y, w, h]): Rect => [x - 1, y - 1, w + 2, h + 2]) : rects;
    const clears = level.furniture.filter((f) => CLEARABLE.has(f.t) && reach.some((r) => overlapsRect(f, r)));
    return [
      ...rects.map((rect): Ghost => ({ rect, tone: problem ? 'bad' : 'ok' })),
      ...clears.map((f): Ghost => ({ rect: [f.p[0], f.p[1], ...(CATALOG[f.t]?.size ?? [1, 1])], tone: 'clear' })),
    ];
  }

  private brushRect(tile: Tile): Rect {
    return this.tool === 'road' || this.tool === 'path' ? brush(tile, this.tool) : [tile[0], tile[1], 1, 1];
  }

  private brushProblem(tile: Tile): string | null {
    const level = this.level();
    return level ? groundProblem(level, this.brushRect(tile)) : 'Nowhere to draw.';
  }

  /**
   * Change a map in the running town, then the same way in the design (if it
   * has the place), remembering how both were for undo. `change` returns a
   * problem to stop (the running town's say goes). Returns whether it happened.
   */
  private reshape(level: string, change: (world: WorldDef) => string | null): boolean {
    const sim = this.host.sim();
    const worlds = [sim.world, ...(this.designed(level) ? [this.host.design()] : [])];
    const before = worlds.map((w) => snapshot(w, level));
    for (const world of worlds) {
      const problem = change(world);
      if (problem && world === sim.world) {
        before[0]!.restore();
        this.say(problem, true);
        return false;
      }
    }
    sim.edited(level);
    this.remember({ kind: 'map', level, before });
    return true;
  }

  private level(): LevelDef | undefined {
    return this.host.sim().levels.get(this.host.renderer.level);
  }

  private outside(level = this.host.renderer.level): boolean {
    return this.host.sim().levels.get(level)?.kind === 'outside';
  }

  private nameOf(item: Item): string {
    return item.def.label ?? `the ${item.type.name.toLowerCase()}`;
  }

  // ── Changes, in the running town and in the design (where it has the place) ─

  /** Put a piece down (undoing a delete). */
  private put(level: string, def: FurnitureDef): void {
    if (this.designed(level)) this.host.design().levels.find((l) => l.id === level)?.furniture.push(structuredClone(def));
    this.host.sim().addItem(level, structuredClone(def));
  }

  /** Take a piece away, returning what it was so it can be put back. */
  private take(item: Item): FurnitureDef {
    const def = structuredClone(item.def);
    if (this.designed(item.level)) removeFurniture(this.host.design(), item.level, def.t, def.p);
    this.host.sim().removeItem(item);
    return def;
  }

  /** Move a piece without checking where it goes (undoing a move: it came from there). */
  private shift(item: Item, to: Tile): void {
    if (this.designed(item.level)) {
      const def = this.host.design().levels.find((l) => l.id === item.level)?.furniture.find((f) => f.t === item.def.t && f.p[0] === item.def.p[0] && f.p[1] === item.def.p[1]);
      if (def) def.p = to;
    }
    this.host.sim().moveItem(item, to);
  }

  private find(level: string, t: string, [x, y]: Tile): Item | undefined {
    return this.host.sim().activeItems().find((i) => i.level === level && i.def.t === t && i.def.p[0] === x && i.def.p[1] === y);
  }

  private remember(change: Change): void {
    this.undos.push(change);
    if (this.undos.length > UNDO_STEPS) this.undos.shift();
    this.showUndo();
  }

  private showUndo(): void {
    this.bar.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = this.undos.length === 0;
  }

  private select(item: Item | null): void {
    this.selected = item;
    const building = !!item && this.building(item);
    const house = building && HOUSES.has(item.def.t);
    this.bar.querySelector<HTMLButtonElement>('[data-action="delete"]')!.disabled = !item || building;
    this.bar.querySelector<HTMLButtonElement>('[data-action="flip"]')!.disabled = !house;
    this.host.renderer.ghost = this.selection();
    if (!item) return;
    const name = item.def.label ?? item.type.name;
    if (building) this.say(`${name}: drag to move it (its door and front path come too)${house ? ', or turn it round' : ''}.`);
    else this.say(`${name}: drag to move it, or delete it.`);
  }

  private selection(): Ghost[] | null {
    const item = this.selected;
    return item && !item.gone ? [{ ...this.outline(item.def.t, item.def.p, null), tone: 'selected' }] : null;
  }

  /** Is it safe for `t` to be at `tile` on the level on screen? Checked against the running town, which may have more in it than the design. */
  private problemAt(t: string, tile: Tile, moving?: Item): string | null {
    const sim = this.host.sim();
    const level = sim.levels.get(this.host.renderer.level);
    return level ? placementProblem(level, sim.world.portals, t, tile, moving?.def) : 'Nowhere to put it.';
  }

  /** What you'd pick up at a point: the selection if it's there, otherwise the top piece. */
  private itemAt(x: number, y: number): Item | null {
    const here = this.itemsAt(x, y);
    return this.selected && here.includes(this.selected) ? this.selected : (here[0] ?? null);
  }

  /**
   * Everything editable at a point, top first: pieces standing on the tile,
   * then rugs and the like under them, then anything whose picture reaches
   * over the tile from elsewhere. Not buildings with a way in, and not things
   * the town brought in itself.
   */
  private itemsAt(x: number, y: number): Item[] {
    const { renderer, sim, design } = this.host;
    const level = design().levels.find((l) => l.id === renderer.level);
    // In a place the story built (a startup's office), everything there is the story's; elsewhere, only what's in the design.
    // Buildings move as a whole, outside, unless a crew's about to build on it.
    const movable = (item: Item) => (this.building(item) ? !sim().construction.reserved(item) : !NOT_PLACEABLE.has(item.def.t) && !interiorOf(sim(), item));
    const editable = (item: Item) => (!level || level.furniture.some((f) => f.t === item.def.t && f.p[0] === item.def.p[0] && f.p[1] === item.def.p[1])) && movable(item);
    const [tx, ty] = this.host.tileAt(x, y);
    const covers = (item: Item) => tx >= item.def.p[0] && ty >= item.def.p[1] && tx < item.def.p[0] + item.type.size[0] && ty < item.def.p[1] + item.type.size[1];
    const onTile = sim().activeItems().filter((item) => item.level === renderer.level && covers(item) && editable(item));
    onTile.sort((a, b) => Number(isCovering(a.def.t)) - Number(isCovering(b.def.t)));
    const drawn = renderer.pickItem(x, y, editable)?.item;
    return drawn && !onTile.includes(drawn) ? [...onTile, drawn] : onTile;
  }

  /** Is this level in the design, or did the story build it (a startup's office)? */
  private designed(level: string): boolean {
    return this.host.design().levels.some((l) => l.id === level);
  }

  /** Changes in a place the story built last as long as this story; the design doesn't have it to save them in. */
  private storyNote(level: string): string {
    return this.designed(level) ? '' : ' (This office was built in the story, so this change isn’t saved with the design.)';
  }

  private outline(t: string, [x, y]: Tile, problem: string | null): Ghost {
    const [w, h] = CATALOG[t]?.size ?? [1, 1];
    return { rect: [x, y, w, h], tone: problem ? 'bad' : 'ok' };
  }

  private say(text: string, bad = false): void {
    this.status.hidden = false;
    this.status.textContent = text;
    this.status.classList.toggle('bad', bad);
  }
}

/** A piece of furniture as its sprite, scaled to fit a thumbnail. */
function thumbnail(t: string): HTMLCanvasElement {
  const painter = PAINTERS[t]!;
  const [w, h] = CATALOG[t]!.size;
  const { canvas: img, ctx } = canvas(w * TILE, painter.up + h * TILE + (painter.down ?? 0));
  painter.paint(ctx, w * TILE, h * TILE, painter.up, 0.3, { t, p: [0, 0] });
  const scale = Math.min(THUMB / img.width, THUMB / img.height, 2);
  img.style.width = `${Math.round(img.width * scale)}px`;
  img.style.height = `${Math.round(img.height * scale)}px`;
  return img;
}

const GROUND_HINTS = {
  road: 'Drag to draw a road: it follows you along the grid and turns where you turn. Trees and the like in the way are cleared.',
  path: 'Drag to draw a path. Draw one to a front door so people keep to it.',
  crossing: 'Click a road to put in a zebra crossing, where you’d like people to cross.',
  erase: 'Drag over roads, paths, pavements or crossings to rub them out.',
} as const;

function overlapsRect(f: FurnitureDef, [x, y, w, h]: Rect): boolean {
  const [fw, fh] = CATALOG[f.t]?.size ?? [1, 1];
  return x < f.p[0] + fw && f.p[0] < x + w && y < f.p[1] + fh && f.p[1] < y + h;
}
