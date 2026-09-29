// A small builder for authoring levels in code (docs/BUILDINGS.md):
//
//   new LevelBuilder('ground', 'Ground floor', 'building', 40, 26)
//     .room('kitchen', 'Kitchen', [0, 0, 12, 8], 'tiles', { walled: true })
//     .door([6, 7])
//     .put('coffee', 2, 1)
//     .build();
import type { FurnitureDef, LevelDef, LevelKind, Place, PortalDef, Rect, RoomDef, Tile } from '../sim/world.ts';

export class LevelBuilder {
  private readonly level: LevelDef;

  constructor(id: string, name: string, kind: LevelKind, w: number, h: number) {
    this.level = { id, name, kind, size: [w, h], rooms: [], doors: [], furniture: [] };
  }

  room(id: string, name: string, rect: Rect, floor: string, options: Pick<RoomDef, 'walled' | 'dept'> = {}): this {
    this.level.rooms.push({ id, name, rect, floor, ...options });
    return this;
  }

  door(...tiles: Tile[]): this {
    this.level.doors.push(...tiles);
    return this;
  }

  put(t: string, x: number, y: number, owner?: string): this {
    const item: FurnitureDef = { t, p: [x, y] };
    if (owner) item.owner = owner;
    this.level.furniture.push(item);
    return this;
  }

  /** Any item, fully specified. */
  item(def: FurnitureDef): this {
    this.level.furniture.push(def);
    return this;
  }

  /** An item with a display name (a building, a food truck). */
  named(t: string, x: number, y: number, label: string): this {
    this.level.furniture.push({ t, p: [x, y], label });
    return this;
  }

  /** The same item at several x positions on one row. */
  row(t: string, xs: number[], y: number): this {
    for (const x of xs) this.put(t, x, y);
    return this;
  }

  /** Desks at each position, handed to `owners` in order; any left over stay free. */
  desks(t: string, positions: Tile[], owners: string[]): this {
    for (const [i, [x, y]] of positions.entries()) this.put(t, x, y, owners[i]);
    return this;
  }

  /** Start the camera here when this level is shown. */
  lookAt(p: Tile): this {
    this.level.view = p;
    return this;
  }

  at(p: Tile): Place {
    return { level: this.level.id, p };
  }

  build(): LevelDef {
    return this.level;
  }
}

export function portal(kind: PortalDef['kind'], a: Place, b: Place): PortalDef {
  return { kind, a, b };
}
