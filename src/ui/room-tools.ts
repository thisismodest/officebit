// The map editor's indoor tools (docs/BUILDER.md#rooms): build a room (or
// mark out an area, with no walls) by dragging a box, click one to rename it,
// change its floor or delete it, drag its walls to resize it; open and close
// doorways; and put in stairs to build a floor above. The edits themselves are worlds/rooms.ts
// and the floors in worlds/edit.ts; the editor (editor.ts) keeps them and
// undoes them.
import type { Item } from '../sim/sim.ts';
import type { LevelDef, Rect, RoomDef, Tile, WorldDef } from '../sim/world.ts';
import type { Ghost } from '../render/renderer.ts';
import { addFloor, floorToRemove, planFloor, removeFloor, type Floor } from '../worlds/edit.ts';
import { placementProblem } from '../worlds/placement.ts';
import { MIN_AREA, MIN_ROOM, addRoom, outerRoom, removeRoom, resizeRoom, restyleRoom, roomAt, roomProblem, snap, toggleDoor } from '../worlds/rooms.ts';
import type { Grab } from './controls.ts';
import type { EditorHost } from './editor.ts';
import { esc } from './html.ts';

export type RoomTool = 'room' | 'area' | 'door' | 'stairs';

export const ROOM_HINTS: Record<RoomTool, string> = {
  room: 'Drag to build a room; click one to rename it, change its floor or delete it; drag its walls to move them.',
  area: 'Drag to mark out an area with a floor of its own and no walls, like a dining area; click one to change it; drag its edges to move them.',
  door: 'Click a wall to open a doorway in it, or a doorway to close it.',
  stairs: 'Click where the stairs go, and a floor gets built above.',
};

/** Floors a room can have, as they're called here (render/palette.ts FLOORS). */
const FLOORS: [id: string, name: string][] = [
  ['wood', 'Wood'],
  ['darkWood', 'Dark wood'],
  ['carpetGrey', 'Grey carpet'],
  ['carpetBlue', 'Blue carpet'],
  ['carpetGreen', 'Green carpet'],
  ['carpetPurple', 'Plum carpet'],
  ['tiles', 'Tiles'],
  ['checker', 'Chequered tiles'],
  ['stone', 'Stone'],
  ['concrete', 'Concrete'],
];

/** What the tools need of the editor: the town and the design, and how it keeps changes. */
export interface EditorCore {
  readonly host: EditorHost;
  reshape(level: string, change: (world: WorldDef) => string | null): boolean;
  remember(change: { kind: 'floor'; level: string; added?: Floor; removed?: Floor }): void;
  say(text: string, bad?: boolean): void;
  designed(level: string): boolean;
  /** Whether the toolbar's delete button deletes something (here, the selected room). */
  deletable(on: boolean): void;
}

export class RoomTools {
  private readonly core: EditorCore;
  private readonly card: HTMLElement;
  /** The room you've clicked, to change. */
  private selected: string | null = null;

  constructor(side: HTMLElement, core: EditorCore) {
    this.core = core;
    this.card = document.createElement('div');
    this.card.className = 'editor-room mdst-card mdst-card--compact';
    this.card.hidden = true;
    this.card.innerHTML = `
      <label>Name <input type="text" class="mdst-input" data-field="name" maxlength="40"></label>
      <label>Floor <select class="mdst-dropdown--sm" data-field="floor">${FLOORS.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}</select></label>`;
    side.append(this.card);
    this.card.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.card.addEventListener('change', (event) => {
      const field = (event.target as HTMLElement).dataset.field;
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (field === 'name') this.restyle({ name: value });
      if (field === 'floor') this.restyle({ floor: value });
    });
    this.card.addEventListener('keydown', (event) => event.stopPropagation());
  }

  contains(node: Node): boolean {
    return this.card.contains(node);
  }

  /** Forget the selected room (a new tool, a new place, or done). */
  clear(): void {
    if (this.selected) this.core.deletable(false);
    this.selected = null;
    this.card.hidden = true;
  }

  /** The outline under the pointer. */
  hover(tool: RoomTool, tile: Tile): Ghost[] {
    const level = this.level();
    if (!level) return [];
    const selected = this.selectedRoom();
    const around = selected ? [{ rect: selected.rect, tone: 'selected' as const }] : [];
    if (tool === 'door') return [...around, { rect: [tile[0], tile[1], 1, 1], tone: this.isWall(level, tile) ? 'ok' : 'bad' }];
    if (tool === 'stairs') return [{ rect: [tile[0], tile[1], 2, 2], tone: this.stairsProblem(tile) ? 'bad' : 'ok' }];
    const room = roomAt(level, tile);
    return [...around, ...(room && room !== selected ? [{ rect: room.rect, tone: 'ok' as const }] : [])];
  }

  click(tool: RoomTool, tile: Tile): void {
    if (tool === 'door') this.door(tile);
    else if (tool === 'stairs') this.stairs(tile);
    else this.select(roomAt(this.level()!, tile) ?? null);
  }

  /** Press with the Room or Area tool: on a selected room's wall (or area's edge), drag it; anywhere else, draw a new one. */
  grab(tool: 'room' | 'area', start: Tile, tileAt: (x: number, y: number) => Tile): Grab | null {
    const level = this.level();
    if (!level) return null;
    const room = this.selectedRoom();
    const edges = room && room !== outerRoom(level) ? edgesAt(room.rect, start) : null;
    const walled = room && edges ? !!room.walled : tool === 'room';
    const problem = (r: Rect) => (room && edges ? roomProblem(level, r, room) : roomProblem(level, r, undefined, walled));
    // Snapped onto the walls nearby if that works; otherwise just where you drew it.
    const rectFor = (to: Tile): Rect => {
      const drawn = room && edges ? moveEdges(room.rect, edges, start, to, walled ? MIN_ROOM : MIN_AREA) : box(start, to);
      const snapped = snap(level, drawn, room && edges ? room : undefined);
      return problem(snapped) && !problem(drawn) ? drawn : snapped;
    };
    let rect: Rect = rectFor(start);
    return {
      move: (cx, cy) => {
        rect = rectFor(tileAt(cx, cy));
        const bad = problem(rect);
        this.core.host.renderer.ghost = [{ rect, tone: bad ? 'bad' : 'ok' }];
        this.core.say(bad ?? (edges ? `Let go to move the ${walled ? 'wall' : 'edge'} here.` : `Let go to ${walled ? 'build the room' : 'mark out the area'}.`), !!bad);
      },
      drop: () => (room && edges ? this.resize(room.id, rect) : this.build(rect, walled)),
      release: () => {},
    };
  }

  /** Is this the stairs up to a floor you added? (Those can be deleted, taking the floor with them.) */
  leadsUp(item: Item): boolean {
    const floor = this.floorAbove(item);
    return !!floor && typeof floorToRemove(this.core.host.design(), floor) !== 'string';
  }

  /** Delete stairs: the floor above comes away with them (after asking). */
  removeFloorAbove(item: Item): void {
    const above = this.floorAbove(item);
    const floor = above ? floorToRemove(this.core.host.design(), above) : 'Those stairs stay: they go up to part of the building as it was built.';
    if (typeof floor === 'string') {
      this.core.say(floor, true);
      return;
    }
    if (!confirm(`Take away the ${floor.level.name.toLowerCase()}, and everything on it?`)) return;
    this.takeFloor(floor);
    this.core.remember({ kind: 'floor', level: floor.below, removed: floor });
    this.core.say(`Took the ${floor.level.name.toLowerCase()} away.`);
  }

  /** Put a floor into the town and the design. */
  buildFloor(floor: Floor): void {
    const { host } = this.core;
    const sim = host.sim();
    addFloor(host.design(), floor);
    sim.addItem(floor.below, structuredClone(floor.stairs));
    sim.addLevel(structuredClone(floor.level));
    sim.addPortal(structuredClone(floor.portal));
    for (const company of sim.world.companies) if (floor.companies.includes(company.id)) company.levels.push(floor.level.id);
  }

  /** Take a floor out of the town and the design. You're taken downstairs first if you're on it. */
  takeFloor(floor: Floor): void {
    const { host } = this.core;
    const sim = host.sim();
    if (host.renderer.level === floor.level.id) host.renderer.showLevel(floor.below);
    removeFloor(host.design(), floor);
    const stairs = sim.activeItems().find((i) => i.level === floor.below && i.def.t === 'stairs' && i.def.p[0] === floor.stairs.p[0] && i.def.p[1] === floor.stairs.p[1]);
    if (stairs) sim.removeItem(stairs);
    sim.removeLevel(floor.level.id, { level: floor.below, p: floor.stairs.p });
  }

  // ── The tools ─────────────────────────────────────────────────────────────

  private build(rect: Rect, walled: boolean): void {
    const id = this.core.host.renderer.level;
    let made: RoomDef | null = null;
    const done = this.core.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      if (!level) return null;
      const room = addRoom(level, world.portals, rect, undefined, walled);
      if (typeof room === 'string') return room;
      if (world === this.core.host.sim().world) made = room;
      return null;
    });
    if (!done || !made) return;
    this.select(this.level()!.rooms.find((r) => r.id === (made as RoomDef).id) ?? null);
    this.core.say(walled ? 'Built a room. Name it and pick its floor here; drag its walls to move them.' : 'Marked out an area. Name it and pick its floor here; drag its edges to move them.');
  }

  private resize(room: string, rect: Rect): void {
    const id = this.core.host.renderer.level;
    const done = this.core.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      return level ? resizeRoom(level, world.portals, room, rect) : null;
    });
    if (done) {
      const moved = this.level()!.rooms.find((r) => r.id === room) ?? null;
      this.select(moved);
      this.core.say(moved?.walled ? 'Moved the wall.' : 'Moved the edge.');
    }
  }

  /** Delete the selected room: a room's walls come down (and their doorways); an area's floor goes. What's in it stays. Did it? */
  remove(): boolean {
    const room = this.selectedRoom();
    if (!room) return false;
    const id = this.core.host.renderer.level;
    const done = this.core.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      return level ? removeRoom(level, world.portals, room.id) : null;
    });
    if (done) {
      this.clear();
      this.core.say(room.walled ? `Knocked the ${room.name.toLowerCase()} through: its walls are gone, and what was in it stays.` : `Took away the ${room.name.toLowerCase()}.`);
    }
    return true;
  }

  private restyle(changes: { name?: string; floor?: string }): void {
    const room = this.selectedRoom();
    if (!room) return;
    const id = this.core.host.renderer.level;
    this.core.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      return level ? restyleRoom(level, room.id, changes) : null;
    });
    this.select(this.selectedRoom() ?? null);
  }

  private door(tile: Tile): void {
    const id = this.core.host.renderer.level;
    const open = this.level()?.doors.some(([x, y]) => x === tile[0] && y === tile[1]);
    const done = this.core.reshape(id, (world) => {
      const level = world.levels.find((l) => l.id === id);
      return level ? toggleDoor(level, world.portals, tile) : null;
    });
    if (done) this.core.say(open ? 'Closed the doorway.' : 'Opened a doorway.');
  }

  private stairs(tile: Tile): void {
    const { host } = this.core;
    const below = host.renderer.level;
    const problem = this.stairsProblem(tile);
    if (problem) {
      this.core.say(problem, true);
      return;
    }
    const floor = planFloor(host.design(), below, tile);
    if (typeof floor === 'string') {
      this.core.say(floor, true);
      return;
    }
    this.buildFloor(floor);
    this.core.remember({ kind: 'floor', level: below, added: floor });
    this.core.say(`Built a ${floor.level.name.toLowerCase()}: click the stairs to go up and lay it out.`);
  }

  private stairsProblem(tile: Tile): string | null {
    const { host } = this.core;
    const level = this.level();
    if (!level || level.kind === 'outside') return 'Stairs go indoors.';
    if (!this.core.designed(level.id)) return 'Floors can only be built in places that are part of the town’s design.';
    const floor = planFloor(host.design(), level.id, tile);
    return typeof floor === 'string' ? floor : placementProblem(level, host.sim().world.portals, 'stairs', tile);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private select(room: RoomDef | null): void {
    const level = this.level();
    this.selected = room?.id ?? null;
    this.card.hidden = !room;
    this.core.deletable(!!room && !!level && room !== outerRoom(level));
    if (!room || !level) return;
    this.card.querySelector<HTMLInputElement>('[data-field="name"]')!.value = room.name;
    const floor = this.card.querySelector<HTMLSelectElement>('[data-field="floor"]')!;
    if (!FLOORS.some(([id]) => id === room.floor)) floor.insertAdjacentHTML('beforeend', `<option value="${esc(room.floor)}">${esc(room.floor)}</option>`);
    floor.value = room.floor;
    this.core.host.renderer.ghost = [{ rect: room.rect, tone: 'selected' }];
  }

  private selectedRoom(): RoomDef | undefined {
    return this.selected ? this.level()?.rooms.find((r) => r.id === this.selected) : undefined;
  }

  private level(): LevelDef | undefined {
    const { host } = this.core;
    return host.sim().levels.get(host.renderer.level);
  }

  private isWall(level: LevelDef, [x, y]: Tile): boolean {
    return level.rooms.some((r) => r.walled && onEdge(r.rect, x, y));
  }

  /** The floor you added that these stairs go up to, if any. */
  private floorAbove(item: Item): string | undefined {
    const design = this.core.host.design();
    const portal = design.portals.find((p) => p.kind === 'stairs' && p.a.level === item.level && p.a.p[0] === item.def.p[0] && p.a.p[1] === item.def.p[1]);
    return portal && design.levels.find((l) => l.id === portal.b.level)?.floorOf ? portal.b.level : undefined;
  }
}

/** Which of a room's walls a tile's on: its left, right, top and bottom. */
function edgesAt([x, y, w, h]: Rect, [tx, ty]: Tile): { left: boolean; right: boolean; top: boolean; bottom: boolean } | null {
  if (tx < x || ty < y || tx >= x + w || ty >= y + h) return null;
  const edges = { left: tx === x, right: tx === x + w - 1, top: ty === y, bottom: ty === y + h - 1 };
  return edges.left || edges.right || edges.top || edges.bottom ? edges : null;
}

/** A room with the walls you've grabbed moved by how far you've dragged, never smaller than a room can be. */
function moveEdges([x, y, w, h]: Rect, edges: { left: boolean; right: boolean; top: boolean; bottom: boolean }, [sx, sy]: Tile, [tx, ty]: Tile, min: number): Rect {
  const [dx, dy] = [tx - sx, ty - sy];
  let [left, top, right, bottom] = [x, y, x + w - 1, y + h - 1];
  if (edges.left) left = Math.min(left + dx, right - min + 1);
  if (edges.right) right = Math.max(right + dx, left + min - 1);
  if (edges.top) top = Math.min(top + dy, bottom - min + 1);
  if (edges.bottom) bottom = Math.max(bottom + dy, top + min - 1);
  return [left, top, right - left + 1, bottom - top + 1];
}

/** The box between two corners, whichever way you dragged. */
function box([ax, ay]: Tile, [bx, by]: Tile): Rect {
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) + 1, Math.abs(by - ay) + 1];
}

function onEdge([x, y, w, h]: Rect, tx: number, ty: number): boolean {
  return tx >= x && ty >= y && tx < x + w && ty < y + h && (tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1);
}
