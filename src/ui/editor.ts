// The map editor (docs/BUILDER.md): a floating toolbar over the stage. Move
// furniture (and, outside, whole buildings) by dragging it, add it from a
// picker, delete what's selected; outside, draw roads and paths freehand, put
// in zebra crossings, and rub things out; and undo (up to 50 steps, forgotten
// when you finish). Only safe spots are allowed (worlds/placement.ts, and
// worlds/ground.ts for roads); the outline goes red, and says why, where
// something can't go. Clicking the same spot again picks what's underneath (a
// rug under a sofa). Changes apply to the running town and to the design it
// was built from, and save themselves; a place the story built itself (a
// startup's office) is kept as an override, for whenever the story builds it.
import { CATALOG } from '../sim/catalog.ts';
import { covers, doorOf, footprint, overlap } from '../sim/geometry.ts';
import { interiorOf } from '../sim/places.ts';
import type { Item, Simulation } from '../sim/sim.ts';
import type { FurnitureDef, LevelDef, Rect, Tile, WorldDef } from '../sim/world.ts';
import type { Ghost, Renderer } from '../render/renderer.ts';
import { TILE, canvas } from '../render/pixels.ts';
import { HOME } from '../render/props/home.ts';
import { OFFICE } from '../render/props/office.ts';
import { PAINTERS } from '../render/props/index.ts';
import { SCHOOL } from '../render/props/school.ts';
import { LEISURE } from '../render/props/leisure.ts';
import { VENUE } from '../render/props/venue.ts';
import { buildingMoveProblem, flipHouse, isBuilding, moveBuilding, moveFurniture, placeFurniture, removeFurniture, snapshot, type Floor, type Snapshot } from '../worlds/edit.ts';
import { CLEARABLE, addCrossing, brush, crossingAt, eraseAll, groundProblem, joinsUp, lay, strokeRects, type Surface } from '../worlds/ground.ts';
import { aOrAn, isCovering, placementProblem } from '../worlds/placement.ts';
import type { Grab } from './controls.ts';
import { esc, narrow } from './html.ts';
import { hasIcon, iconButton, type IconName } from './icons.ts';
import { ROOM_HINTS, RoomTools, type RoomTool } from './room-tools.ts';

type Tool = 'move' | 'add' | Surface | 'crossing' | 'grass' | RoomTool | LineTool;
/** Putting up a line of something, a tile at a time (`line:hedge`). */
type LineTool = `line:${string}`;
/** Tools for the ground outside: they only work on the town map. */
const GROUND_TOOLS = new Set<Tool>(['road', 'pavement', 'path', 'forecourt', 'water', 'sand', 'shallows', 'runway', 'crossing', 'grass']);
/** Tools for walls, doorways and floors: they only work indoors (room-tools.ts). */
const INDOOR_TOOLS = new Set<Tool>(['room', 'area', 'door', 'stairs']);
const HOUSES = new Set(['terrace', 'house', 'detached']);

/** What the picker offers out of doors, by kind (hedges, fences and flowers are drawn in lines, beside the ground). */
const OUTSIDE_GROUPS: [string, string[]][] = [
  ['Nature', ['tree', 'bush', 'pond']],
  ['Street', ['bench', 'lamppost', 'busStop', 'billboard', 'lifebuoy']],
  ['Fields', ['fieldGate', 'goal']],
  ['Airfield', ['stand', 'gate', 'hangar', 'windsock']],
  ['Transport', ['plane', 'sailboat']],
];
/** Everything only for out of doors (kept out of the indoor groups). */
const OUTSIDE_ONLY = OUTSIDE_GROUPS.flatMap(([, types]) => types);
/** Never in the picker: buildings, houses, lots and building sites (placed some other way), and what the story brings. */
const NOT_PLACEABLE = new Set(['stairs', 'officeBuilding', 'diner', 'supermarket', 'school', 'house', 'terrace', 'detached', 'lot', 'siteTiny', 'siteSmall', 'siteLarge', 'christmasTree', 'homeTree', 'bonfire', 'picnicBlanket', 'startupSmall', 'startupLarge', 'foodTruck', 'pizza', 'birthdayCake', 'rowboat', 'narrowboat', 'boathouse', 'leisureCentre']);
const INDOOR_GROUPS: [string, string[]][] = [
  ['Office', Object.keys(OFFICE)],
  ['Home', Object.keys(HOME)],
  ['Venues', Object.keys(VENUE)],
  ['School', Object.keys(SCHOOL)],
  ['Leisure', Object.keys(LEISURE)],
];
/** What the ground button lays (the kinds of ground, and zebra crossings on the roads), as its label says each. */
type GroundTool = Surface | 'crossing' | 'grass';
const GROUND: Record<GroundTool, string> = {
  road: 'Road: drag to draw one',
  pavement: 'Pavement: drag to draw it beside a road',
  path: 'Path: drag to draw one',
  forecourt: 'Concrete: drag to lay hard standing, for a forecourt, a car park or an airfield’s apron',
  water: 'Water: drag to draw a river, canal or pond',
  shallows: 'Shallows: drag to draw water shallow enough to paddle in',
  sand: 'Beach: drag to draw sand',
  runway: 'Runway: drag to draw one, for the plane',
  crossing: 'Zebra crossing: click a road',
  grass: 'Grass: drag to lay grass over roads, paths, water, beach and pavement',
};
/** What's put up in lines, a tile at a time (`line` in the catalog: hedges, fences), each a tool beside the ground's. */
const LINES = Object.keys(CATALOG).filter((t) => CATALOG[t]!.line);
/** The catalog type a line tool puts up, if it's one. */
const lineOf = (tool: Tool): string | null => (tool.startsWith('line:') ? tool.slice(5) : null);
const lineLabel = (t: string) => `${CATALOG[t]!.name}: drag to put up a row, a tile at a time`;
const lineIcon = (t: string): IconName => (hasIcon(t) ? t : 'add');
/** What a stroke of each kind of ground says once it's down. */
const LAID: Record<Surface | 'grass', string> = {
  road: 'Laid a road',
  pavement: 'Laid some pavement',
  path: 'Laid a path',
  forecourt: 'Laid some concrete',
  water: 'Drew some water',
  shallows: 'Drew some shallows',
  sand: 'Laid a stretch of beach',
  runway: 'Laid a runway',
  grass: 'Laid grass',
};
/** How long (ms) to hold the ground button down for the others; and with a mouse, how long after leaving them they stay open. */
const HOLD_MS = 450;
const LINGER_MS = 300;
/** Thumbnail size in the picker, CSS px. */
const THUMB = 52;
/** Steps of undo kept while editing. */
const UNDO_STEPS = 50;

/** One change, with what it takes to undo it. */
type Change =
  | { kind: 'add' | 'remove'; level: string; def: FurnitureDef }
  | { kind: 'move'; level: string; t: string; from: Tile; to: Tile }
  /** Roads, paths, buildings, rooms and doorways: the whole map as it was, in the town and in the design. */
  | { kind: 'map'; level: string; before: Snapshot[] }
  /** A floor built (`added`) or taken away (`removed`), with the stairs up to it from `level`. */
  | { kind: 'floor'; level: string; added?: Floor; removed?: Floor };

export interface EditorHost {
  sim(): Simulation;
  design(): WorldDef;
  renderer: Renderer;
  tileAt(clientX: number, clientY: number): Tile;
  /** The design changed: save it. */
  saved(): void;
}

/** Things the town brings in for a while (free pizza): never kept in a place you've arranged. */
const PASSING = new Set(['pizza', 'birthdayCake', 'rowboat']);

export class Editor {
  active = false;
  private tool: Tool = 'move';
  private adding: string | null = null;
  private selected: Item | null = null;
  readonly host: EditorHost;
  private readonly bar: HTMLElement;
  private readonly picker: HTMLElement;
  /** Rooms, doorways and floors, indoors. */
  private readonly rooms: RoomTools;
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
      <span class="group" data-scene="outside">
        <span class="divider"></span>
        <span class="tool-set">
          ${iconButton('road', GROUND.road, 'data-tool="road" data-face aria-haspopup="true" aria-expanded="false"')}
          <span class="flyout" role="menu" hidden>${(Object.keys(GROUND) as GroundTool[]).map((t) => iconButton(t, GROUND[t], `data-tool="${t}" role="menuitemradio"`)).join('')}</span>
        </span>
        ${
          LINES.length
            ? `<span class="tool-set">
          ${iconButton(lineIcon(LINES[0]!), lineLabel(LINES[0]!), `data-tool="line:${LINES[0]}" data-face aria-haspopup="true" aria-expanded="false"`)}
          <span class="flyout" role="menu" hidden>${LINES.map((t) => iconButton(lineIcon(t), lineLabel(t), `data-tool="line:${t}" role="menuitemradio"`)).join('')}</span>
        </span>`
            : ''
        }
      </span>
      <span class="group" data-scene="inside">
        <span class="divider"></span>
        ${iconButton('room', 'Room: drag to build one, or click one to change it', 'data-tool="room"')}
        ${iconButton('area', 'Area: drag to mark out a floor of its own, with no walls', 'data-tool="area"')}
        ${iconButton('door', 'Doorway: click a wall to open or close one', 'data-tool="door"')}
        ${iconButton('stairs', 'Stairs up: click where they go to build a floor above', 'data-tool="stairs"')}
      </span>
      <span class="divider"></span>
      <span class="group" data-scene="outside">${iconButton('flip', 'Turn the house round', 'data-action="flip" disabled')}</span>
      ${iconButton('trash', 'Delete what’s selected (Delete)', 'data-action="delete"')}
      ${iconButton('undo', 'Undo (Ctrl+Z)', 'data-action="undo" disabled')}
      <span class="divider"></span>
      ${iconButton('done', 'Done editing (Esc)', 'data-action="done"')}`;
    this.status = document.createElement('p');
    this.status.className = 'editor-status mdst-p--sm';
    this.status.hidden = true;
    this.picker = document.createElement('div');
    this.picker.className = 'editor-picker mdst-card mdst-card--compact';
    this.picker.hidden = true;
    // The toolbar, and beside it (never under it) the status line with the picker or the selected room's card below.
    const dock = document.createElement('div');
    dock.className = 'editor-dock';
    const side = document.createElement('div');
    side.className = 'editor-side';
    side.append(this.status, this.picker);
    dock.append(this.bar, side);
    stage.append(dock);
    this.rooms = new RoomTools(side, this);

    this.bar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('button');
      if (button?.dataset.tool) this.setTool(button.dataset.tool as Tool);
      if (button?.dataset.action === 'delete') this.deleteSelected();
      if (button?.dataset.action === 'flip') this.flipSelected();
      if (button?.dataset.action === 'undo') this.undo();
      if (button?.dataset.action === 'done') onDone();
    });
    // Press and hold a button with others beside it (the ground, lines) to see them too; letting go after that isn't a click on it.
    for (const set of this.bar.querySelectorAll<HTMLElement>('.tool-set')) {
      const face = set.querySelector<HTMLElement>('[data-face]')!;
      let hold: ReturnType<typeof setTimeout> | undefined;
      let held = false;
      face.addEventListener('pointerdown', () => {
        held = false;
        hold = setTimeout(() => {
          held = true;
          this.showFlyout(set, true);
        }, HOLD_MS);
      });
      for (const type of ['pointerup', 'pointerleave', 'pointercancel']) face.addEventListener(type, () => clearTimeout(hold));
      face.addEventListener('click', (event) => {
        if (held) event.stopPropagation();
        held = false;
      });
      face.addEventListener('contextmenu', (event) => event.preventDefault());
      // With a mouse, hovering shows them too, and they go a moment after the pointer leaves.
      let linger: ReturnType<typeof setTimeout> | undefined;
      set.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'mouse') return;
        clearTimeout(linger);
        this.showFlyout(set, true);
      });
      set.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') linger = setTimeout(() => this.showFlyout(set, false), LINGER_MS);
      });
    }
    this.picker.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      // Shrunk to what you've picked (small screens): Change opens it out again.
      if (target.closest('[data-action="change"]')) {
        delete this.picker.dataset.collapsed;
        return;
      }
      const t = target.closest<HTMLElement>('[data-type]')?.dataset.type;
      if (!t) return;
      this.adding = t;
      for (const b of this.picker.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.type === t));
      // On a small screen the picker gets out of the way, so there's map to tap.
      if (narrow.matches) this.picker.dataset.collapsed = '';
      this.say(`${narrow.matches ? 'Tap' : 'Click'} the map to put down the ${CATALOG[t]!.name.toLowerCase()}.`);
    });
    for (const el of [this.bar, this.picker]) el.addEventListener('pointerdown', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (!this.active || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Delete' || event.key === 'Backspace') this.deleteSelected();
      if (event.key === 'Escape') this.escape(onDone);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.undo();
      }
    });
  }

  /** Esc puts away whatever's on top: the other kinds of ground, then what's selected, then the tool (back to Move), then the editor itself. */
  private escape(done: () => void): void {
    if (this.flyoutOpen()) this.closeFlyouts();
    else if (this.selected) this.select(null);
    else if (this.tool !== 'move') this.setTool('move');
    else done();
  }

  /** The others beside a button (the other kinds of ground, the other lines), shown or put away; showing one puts the rest away. */
  private showFlyout(set: HTMLElement, on: boolean): void {
    if (on) this.closeFlyouts();
    set.querySelector<HTMLElement>('.flyout')!.hidden = !on;
    set.querySelector('[data-face]')!.setAttribute('aria-expanded', String(on));
  }

  private closeFlyouts(): void {
    for (const set of this.bar.querySelectorAll<HTMLElement>('.tool-set')) this.showFlyout(set, false);
  }

  private flyoutOpen(): boolean {
    return [...this.bar.querySelectorAll<HTMLElement>('.flyout')].some((f) => !f.hidden);
  }

  /** Is this part of the editor (its toolbar, status line, picker or room card)? */
  contains(node: Node): boolean {
    return [this.bar, this.status, this.picker].some((el) => el.contains(node)) || this.rooms.contains(node);
  }

  open(): void {
    this.active = true;
    // Only this place's tools, before the toolbar shows (not on the next panel refresh, which would flash them all).
    this.update();
    this.bar.hidden = false;
    this.setTool('move');
  }

  /** Finish editing: the undo steps go with it. */
  close(): void {
    this.active = false;
    this.holdHand(false);
    this.undos.length = 0;
    this.showUndo();
    this.bar.hidden = this.picker.hidden = this.status.hidden = true;
    this.select(null);
    this.rooms.clear();
    this.host.renderer.ghost = null;
  }

  /** A click on the map while editing: place, or select. Clicking what's selected again picks what's underneath it. */
  click(x: number, y: number): void {
    this.closeFlyouts();
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
    if (INDOOR_TOOLS.has(this.tool)) {
      this.rooms.click(this.tool as RoomTool, tile);
      return;
    }
    const here = this.itemsAt(x, y);
    const i = this.selected ? here.indexOf(this.selected) : -1;
    this.select(here[i >= 0 ? (i + 1) % here.length : 0] ?? null);
  }

  /** The outline under the pointer: where the new piece would go, or what you'd pick up. */
  hover(x: number, y: number): boolean {
    const { renderer } = this.host;
    // Moving the map (Space held): no brush outline under the hand.
    if (this.hand) {
      renderer.ghost = null;
      return false;
    }
    if (GROUND_TOOLS.has(this.tool) || lineOf(this.tool)) {
      renderer.ghost = this.groundPreview([this.host.tileAt(x, y)]);
      return true;
    }
    if (INDOOR_TOOLS.has(this.tool)) {
      renderer.ghost = this.rooms.hover(this.tool as RoomTool, this.host.tileAt(x, y));
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
    } else if (change.kind === 'floor') {
      if (change.added) this.rooms.takeFloor(change.added);
      if (change.removed) this.rooms.buildFloor(change.removed);
    }
    this.rooms.clear();
    this.keep(level);
    this.select(null);
    this.say('Undone.');
  }

  /** Press on a piece of furniture with the move tool: drag it somewhere else. */
  grab(x: number, y: number): Grab | null {
    // Space held: the press moves the map, whatever the tool.
    if (this.hand) return null;
    if (this.drawing() || this.tool === 'grass' || lineOf(this.tool)) return this.stroke(this.host.tileAt(x, y));
    if (this.tool === 'room' || this.tool === 'area') return this.rooms.grab(this.tool, this.host.tileAt(x, y), (cx, cy) => this.host.tileAt(cx, cy));
    if (this.tool === 'door') return this.rooms.grabDoor(this.host.tileAt(x, y), (cx, cy) => this.host.tileAt(cx, cy));
    if (this.tool !== 'move') return null;
    // Drag what's selected if you press on it, even with something else drawn on top.
    const here = this.itemsAt(x, y);
    const item = this.selected && here.includes(this.selected) ? this.selected : here[0];
    // Stairs stay where they are: they're how you get up there.
    if (!item || item.def.t === 'stairs') return null;
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
    // Only the tools this place has any use for: roads, paths and turning houses round are for the town.
    const scene = this.outside() ? 'outside' : 'inside';
    if (this.bar.dataset.scene !== scene) {
      this.bar.dataset.scene = scene;
      for (const group of this.bar.querySelectorAll<HTMLElement>('[data-scene]')) group.hidden = group.dataset.scene !== scene;
      const move = this.bar.querySelector<HTMLElement>('[data-tool="move"]')!;
      const label = scene === 'outside' ? 'Move: drag furniture or a building to move it' : 'Move: drag furniture to move it';
      move.title = label;
      move.setAttribute('aria-label', label);
    }
    if ((GROUND_TOOLS.has(this.tool) && scene !== 'outside') || (INDOOR_TOOLS.has(this.tool) && scene === 'outside')) this.setTool('move');
    if (this.tool === 'add' && this.pickerLevel !== this.host.renderer.level) this.fillPicker();
  }

  /** Does the tool draw (or build) on every press, so dragging can't move the map? Then Space held does (`holdHand`). */
  drawsOnPress(): boolean {
    return this.drawing() || !!lineOf(this.tool) || this.tool === 'grass' || this.tool === 'room' || this.tool === 'area' || this.tool === 'door';
  }

  /** Space held, or let go: presses move the map while it's held (like Figma's hand), and draw again after. */
  holdHand(on: boolean): void {
    if (this.hand === on) return;
    this.hand = on;
    this.host.renderer.canvas.classList.toggle('hand', on);
    if (on) this.host.renderer.ghost = null;
  }
  private hand = false;

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.holdHand(false);
    // The button with others beside it takes the look of the one picked, for next time.
    const picked = this.bar.querySelector<HTMLElement>(`.flyout [data-tool="${tool}"]`);
    const face = picked?.closest('.tool-set')?.querySelector<HTMLElement>('[data-face]');
    if (picked && face) {
      face.dataset.tool = tool;
      face.innerHTML = picked.innerHTML;
      face.title = picked.title;
      face.setAttribute('aria-label', picked.getAttribute('aria-label') ?? '');
    }
    this.closeFlyouts();
    for (const b of this.bar.querySelectorAll<HTMLElement>('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    this.picker.hidden = tool !== 'add';
    this.rooms.clear();
    if (tool === 'add') {
      this.select(null);
      this.fillPicker();
      this.say(this.adding ? `Click the map to put down the ${CATALOG[this.adding]!.name.toLowerCase()}.` : 'Pick something to add.');
    } else if (lineOf(tool)) {
      this.select(null);
      this.say(`Drag to put up a row of ${CATALOG[lineOf(tool)!]!.name.toLowerCase()}, a tile at a time (it leaves out tiles where something's in the way). Lay grass over it to take it down.${HAND_HINT}`);
    } else if (GROUND_TOOLS.has(tool)) {
      this.select(null);
      this.say(GROUND_HINTS[tool as keyof typeof GROUND_HINTS] + HAND_HINT);
    } else if (INDOOR_TOOLS.has(tool)) {
      this.select(null);
      this.say(ROOM_HINTS[tool as RoomTool] + (this.drawsOnPress() ? HAND_HINT : ''));
    } else {
      this.say(this.outside() ? 'Drag furniture or a building to move it, or click it to select it.' : 'Drag furniture to move it, or click it to select it.');
    }
  }

  private fillPicker(): void {
    const { renderer, sim } = this.host;
    this.pickerLevel = renderer.level;
    const outside = sim().levels.get(renderer.level)?.kind === 'outside';
    const groups: [string, string[]][] = outside ? OUTSIDE_GROUPS : INDOOR_GROUPS.map(([name, types]) => [name, types.filter((t) => !OUTSIDE_ONLY.includes(t))]);
    if (this.adding && !groups.some(([, types]) => types.includes(this.adding!))) this.adding = null;
    delete this.picker.dataset.collapsed;
    this.picker.innerHTML =
      '<button type="button" class="change mdst-button--sm" data-action="change">Change</button>' +
      groups
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
    // A gate on a fence (anything that stands in a line, on that line): it takes that tile's place.
    if (this.lineAt(t, tile)) {
      const joins = CATALOG[t]!.joinsWith!;
      const done = this.reshapeHere((map) => {
        map.furniture = map.furniture.filter((f) => !(f.t === joins && f.p[0] === tile[0] && f.p[1] === tile[1]));
        map.furniture.push({ t, p: [tile[0], tile[1]] });
        return null;
      });
      if (done) this.say(`Put ${aOrAn(CATALOG[t]!.name.toLowerCase())} in the ${CATALOG[joins]!.name.toLowerCase()}.`);
      return;
    }
    const problem = this.problemAt(t, tile) ?? (this.designed(level) ? placeFurniture(this.host.design(), level, t, tile) : null);
    if (problem) {
      this.say(problem, true);
      return;
    }
    const label = t === 'busStop' ? this.stopName(tile) : undefined;
    const def: FurnitureDef = label ? { t, p: tile, label } : { t, p: tile };
    this.host.sim().addItem(level, def);
    this.remember({ kind: 'add', level, def });
    this.say(label ? `Added a bus stop: ${label}. The buses call there from the next one.` : `Added a ${CATALOG[t]!.name.toLowerCase()}. Click again to add another.`);
  }

  /** A new bus stop's name: the road it's on (and a number, if that road has one already). */
  private stopName(at: Tile): string {
    const sim = this.host.sim();
    const level = sim.levels.get(this.host.renderer.level);
    const bay = sim.traffic.roads()?.stopBay({ t: 'busStop', p: at });
    const grid = sim.grids.get(this.host.renderer.level);
    const road = (bay && grid && level?.rooms[grid.roomAt(...bay)]?.name) || 'Bus stop';
    const taken = new Set(sim.activeItems().filter((i) => i.def.t === 'busStop').map((i) => i.def.label));
    let name = road;
    for (let n = 2; taken.has(name); n++) name = `${road} ${n}`;
    return name;
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
    this.say(`Moved the ${item.type.name.toLowerCase()}.`);
  }

  /** Whether the delete button deletes something (the room tools say, for the selected room). */
  deletable(on: boolean): void {
    this.bar.querySelector<HTMLButtonElement>('[data-action="delete"]')!.disabled = !on;
  }

  private deleteSelected(): void {
    if (INDOOR_TOOLS.has(this.tool) && this.rooms.remove()) return;
    const item = this.selected;
    // Stairs up to a floor you added: the floor comes away with them.
    if (item?.def.t === 'stairs') {
      this.rooms.removeFloorAbove(item);
      this.select(null);
      return;
    }
    if (!item || this.building(item)) {
      this.say(item ? 'Buildings stay: move them instead.' : 'Click something to select it first.', true);
      return;
    }
    const def = this.take(item);
    this.remember({ kind: 'remove', level: item.level, def });
    this.select(null);
    this.say(`Deleted the ${item.type.name.toLowerCase()}.`);
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
    return level && !joinsUp(level, doorOf(item.def)) ? ' Its front door doesn’t join up with a pavement yet: draw a path to it.' : '';
  }

  /**
   * Drag with a brush: the stroke follows the pointer along the grid, turning where you turn. Going back the way you came
   * backs it up; crossing it anywhere else carries on over it (a loop, a circle, scribbling to fill an area).
   */
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
        if (before && before[0] === step[0] && before[1] === step[1]) {
          tiles.pop();
          continue;
        }
        if (this.tool !== 'grass' && !lineOf(this.tool) && this.brushProblem(step)) {
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
        else this.say(this.tool === 'grass' ? 'Let go to lay the grass.' : 'Let go to lay it.');
      },
      drop: () => this.paint(tiles),
      release: () => {},
    };
  }

  /** Lay a stroke of road or path, or rub one out. */
  private paint(tiles: Tile[]): void {
    const tool = this.tool;
    const line = lineOf(tool);
    if (line) {
      this.putUp(line, tiles);
      return;
    }
    if (tool !== 'grass' && !this.drawing(tool)) return;
    const problem = tool === 'grass' ? null : tiles.map((t) => this.brushProblem(t)).find(Boolean);
    if (problem) {
      this.say(problem, true);
      return;
    }
    let cleared = 0;
    let erased = false;
    const done = this.reshapeHere((map, _world, live) => {
      if (tool === 'grass') {
        // Lines on the ground come down too (a hedge, a fence and its gates).
        const lines = map.furniture.length;
        map.furniture = map.furniture.filter((f) => !((CATALOG[f.t]?.line || CATALOG[f.t]?.joinsWith) && tiles.some(([x, y]) => f.p[0] === x && f.p[1] === y)));
        erased = eraseAll(map, tiles) || map.furniture.length < lines;
        return live && !erased ? 'That’s grass already.' : null;
      }
      const gone = lay(map, strokeRects(tiles, tool), tool);
      if (live) cleared = gone.length;
      return null;
    });
    if (!done) return;
    this.host.renderer.ghost = null;
    const what = LAID[tool];
    this.say(`${what}.${cleared ? ` Cleared ${cleared === 1 ? 'a tree or bush' : `${cleared} trees, bushes and the like`} out of the way.` : ''}`);
  }

  /** Put up a line of `t` along a stroke: a piece on each tile where there's room (the rest left out). */
  private putUp(t: string, tiles: Tile[]): void {
    let put = 0;
    const done = this.reshapeHere((map, world, live) => {
      for (const tile of tiles) {
        if (placementProblem(map, world.portals, t, tile)) continue;
        map.furniture.push({ t, p: [tile[0], tile[1]] });
        if (live) put++;
      }
      return live && put === 0 ? `There's no room for ${aOrAn(CATALOG[t]!.name.toLowerCase())} along there.` : null;
    });
    if (!done) return;
    this.host.renderer.ghost = null;
    this.say(`Put up ${put} ${put === 1 ? 'tile' : 'tiles'} of ${CATALOG[t]!.name.toLowerCase()}.`);
  }

  private crossing(tile: Tile): void {
    const done = this.reshapeHere((map, _world, live) => {
      const problem = addCrossing(map, tile);
      return live ? problem : null;
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
    if (this.tool === 'grass') return tiles.map((t) => ({ rect: [t[0], t[1], 1, 1], tone: 'ok' }));
    const line = lineOf(this.tool);
    if (line) return tiles.map((t): Ghost => ({ rect: [t[0], t[1], 1, 1], tone: this.problemAt(line, t) ? 'bad' : 'ok' }));
    const surface = this.tool as Surface;
    const rects = strokeRects(tiles, surface);
    const problem = tiles.length === 1 ? this.brushProblem(last) : null;
    const clears = level.furniture.filter((f) => CLEARABLE.has(f.t) && rects.some((r) => overlap(footprint(f), r)));
    return [
      ...rects.map((rect): Ghost => ({ rect, tone: problem ? 'bad' : 'ok' })),
      ...clears.map((f): Ghost => ({ rect: [f.p[0], f.p[1], ...(CATALOG[f.t]?.size ?? [1, 1])], tone: 'clear' })),
    ];
  }

  private brushRect(tile: Tile): Rect {
    const tool = this.tool;
    return this.drawing(tool) ? brush(tile, tool) : [tile[0], tile[1], 1, 1];
  }

  /** Is the tool one that draws ground (a road, path, concrete…)? */
  private drawing(tool: Tool = this.tool): tool is Surface {
    return tool === 'road' || tool === 'pavement' || tool === 'path' || tool === 'forecourt' || tool === 'water' || tool === 'sand' || tool === 'shallows' || tool === 'runway';
  }

  private brushProblem(tile: Tile): string | null {
    const level = this.level();
    const tool = this.tool;
    return level ? groundProblem(level, this.brushRect(tile), this.drawing(tool) ? tool : undefined) : 'Nowhere to draw.';
  }

  /**
   * Change a map in the running town, then the same way in the design (if it
   * has the place), remembering how both were for undo. `change` returns a
   * problem to stop (the running town's say goes). Returns whether it happened.
   */
  reshape(level: string, change: (world: WorldDef) => string | null): boolean {
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

  /** `reshape` the level you're looking at: `change` gets it in each world that has it, and whether that's the running town's. */
  reshapeHere(change: (level: LevelDef, world: WorldDef, live: boolean) => string | null): boolean {
    const id = this.host.renderer.level;
    return this.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      return level ? change(level, world, world === this.host.sim().world) : null;
    });
  }

  /** The level you're looking at, in the running town. */
  level(): LevelDef | undefined {
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

  remember(change: Change): void {
    this.undos.push(change);
    if (this.undos.length > UNDO_STEPS) this.undos.shift();
    this.showUndo();
    this.keep(change.level);
  }

  /**
   * Keep a change: the design is saved. A place the story built isn't in the
   * design, so its furniture is kept as an override (world.overrides), for
   * whenever the story builds it.
   */
  private keep(level: string): void {
    if (!this.designed(level)) {
      const place = this.host.sim().levels.get(level);
      const design = this.host.design();
      if (place) {
        design.overrides ??= {};
        design.overrides[level] = {
          size: [...place.size],
          furniture: structuredClone(place.furniture.filter((f) => !PASSING.has(f.t))),
          rooms: structuredClone(place.rooms),
          doors: structuredClone(place.doors),
        };
      }
    }
    this.host.saved();
  }

  private showUndo(): void {
    this.bar.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = this.undos.length === 0;
  }

  private select(item: Item | null): void {
    this.selected = item;
    const building = !!item && this.building(item);
    const house = building && HOUSES.has(item.def.t);
    this.deletable(!!item && !building);
    this.bar.querySelector<HTMLButtonElement>('[data-action="flip"]')!.disabled = !house;
    this.host.renderer.ghost = this.selection();
    if (!item) return;
    const name = item.def.label ?? item.type.name;
    if (building) this.say(`${name}: drag to move it (its door comes too; draw a path to it with Path)${house ? ', or turn it round' : ''}.`);
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
    if (!moving && this.lineAt(t, tile)) return null;
    return level ? placementProblem(level, sim.world.portals, t, tile, moving?.def) : 'Nowhere to put it.';
  }

  /** Is there a line that `t` stands in (a fence, for a gate) at this tile, for it to take the place of? */
  private lineAt(t: string, [x, y]: Tile): boolean {
    const joins = CATALOG[t]?.joinsWith;
    return !!joins && !!this.level()?.furniture.some((f) => f.t === joins && f.p[0] === x && f.p[1] === y);
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
    // (And stairs up to a floor you added: selecting them is how the floor comes away.)
    const movable = (item: Item) =>
      this.building(item) ? !sim().construction.reserved(item) : (!NOT_PLACEABLE.has(item.def.t) && !interiorOf(sim(), item)) || (item.def.t === 'stairs' && this.rooms.leadsUp(item));
    const editable = (item: Item) => (!level || level.furniture.some((f) => f.t === item.def.t && f.p[0] === item.def.p[0] && f.p[1] === item.def.p[1])) && movable(item);
    const [tx, ty] = this.host.tileAt(x, y);
    const onTile = sim().activeItems().filter((item) => item.level === renderer.level && covers(item.def, tx, ty) && editable(item));
    onTile.sort((a, b) => Number(isCovering(a.def.t)) - Number(isCovering(b.def.t)));
    const drawn = renderer.pickItem(x, y, editable)?.item;
    return drawn && !onTile.includes(drawn) ? [...onTile, drawn] : onTile;
  }

  /** Is this level in the design, or did the story build it (a startup's office)? */
  designed(level: string): boolean {
    return this.host.design().levels.some((l) => l.id === level);
  }

  private outline(t: string, [x, y]: Tile, problem: string | null): Ghost {
    const [w, h] = CATALOG[t]?.size ?? [1, 1];
    return { rect: [x, y, w, h], tone: problem ? 'bad' : 'ok' };
  }

  say(text: string, bad = false): void {
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

/** How to move the map while drawing. */
const HAND_HINT = ' Hold Space and drag to move the map.';

const GROUND_HINTS = {
  road: 'Drag to draw a road: it follows you along the grid and turns where you turn. Trees and the like in the way are cleared. Draw pavement beside it with Pavement.',
  pavement: 'Drag to draw pavement along a road, for people to walk on (it stops at roads, and carries on the other side).',
  path: 'Drag to draw a path. Draw one to a front door so people keep to it.',
  forecourt: 'Drag to lay concrete: hard standing cars can drive and park on (a forecourt, a car park), or an airfield’s apron for a stand and a gate.',
  water: 'Drag to draw water: a river, a canal or a pond. Draw a road or path across it afterwards and it’s bridged.',
  shallows: 'Drag to draw shallows: water shallow enough to paddle in, off a beach.',
  sand: 'Drag to draw a beach, any shape you like.',
  runway: 'Drag to draw a runway, three tiles wide: the plane takes off and lands on the one nearest each gate.',
  crossing: 'Click a road to put in a zebra crossing, where you’d like people to cross.',
  grass: 'Drag over roads, paths, concrete, water, beach, pavements, crossings or bridges to lay grass.',
} as const;

