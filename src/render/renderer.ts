// Draws one level of the sim through a camera (docs/RENDERING.md). The canvas
// is device resolution; the world is scaled by an integer zoom with smoothing
// off, so pixel art stays crisp while text and emoji render sharp.
import { asleep, atDesk, seatedAtDesk, type Person, hasUmbrella } from '../sim/person.ts';
import { interiorOf, occupants } from '../sim/places.ts';
import type { Item, Simulation } from '../sim/sim.ts';
import { asideOffset } from '../sim/collision.ts';
import { AHEAD } from '../sim/movement.ts';
import { vehicleKind, type Car } from '../sim/traffic.ts';
import { Camera } from './camera.ts';
import { paintJob, paintVehicleLights, vehicleOrigin, vehicleSprite, type Colours } from './vehicles.ts';
import { truckColours } from './props/outdoor.ts';
import { characterSprite, type Facing, type Look, type Pose, SPRITE_H } from './characters.ts';
import { BACKGROUND, NIGHT, OUTLINE, PANTS, hashString } from './palette.ts';
import { PET_H, petSprite, type PetPose } from './pets.ts';
import { TILE, canvas, dot, rect, type Ctx } from './pixels.ts';
import { buildProps, type Prop } from './props/index.ts';
import { vehicleAt } from '../sim/food-trucks.ts';
import { paintStaticLayer } from './tiles.ts';
import { paintSeasonal } from './seasonal.ts';
import { paintSky, snowLayer } from './weather.ts';
import { paintGames, paintLaptop } from './play.ts';
import { Spotlights, type Spotlight } from './spotlights.ts';

/** Where feet sit within a person's tile. */
const FEET = 14;
/** Street lights that come on at dusk whoever's about. */
const ALWAYS_LIT = new Set(['lamppost', 'chargingCanopy', 'christmasTree', 'homeTree', 'billboard', 'busStop']);
/** Headlights: how far ahead of a car (tiles) they light the road, and how wide (pixels). */
const HEADLIGHT_REACH = 1.5;
/** How high the plane flies, in pixels up the screen at full height. */
const PLANE_HEIGHT = 40;
const HEADLIGHT_RADIUS = 26;
/** How dark (0–1) it must be for lights to come on. */
const DUSK = 0.4;

/** Part of the editor's outline: a tile rectangle, and what it means. */
export interface Ghost {
  rect: [x: number, y: number, w: number, h: number];
  tone: 'ok' | 'bad' | 'clear' | 'selected';
}

const GHOST_TONES: Record<Ghost['tone'], [line: string, fill: string]> = {
  ok: ['#ffffff', 'rgba(255,255,255,0.12)'],
  selected: ['#ffffff', 'rgba(255,255,255,0.12)'],
  bad: ['#ff5d5d', 'rgba(255,93,93,0.15)'],
  clear: ['#f3c969', 'rgba(243,201,105,0.25)'],
};

interface Light {
  x: number;
  y: number;
  r: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new Camera();
  selected: string | null = null;
  /** The level on screen. */
  level = '';
  /** Called when the level on screen changes (e.g. following someone upstairs). */
  onLevelChange: (level: string) => void = () => {};
  /** Called when the world itself changes (a new office opens). */
  onWorldChange: () => void = () => {};

  private readonly ctx: Ctx;
  private sim!: Simulation;
  private layers = new Map<string, HTMLCanvasElement>();
  /** Each level's grass under snow, for the days it's lying. */
  private snow = new Map<string, HTMLCanvasElement>();
  private props = new Map<string, Prop[]>();
  private looks = new Map<string, Look>();
  /** Pets only have side-on sprites: remember which way they last faced. */
  private petSides = new Map<string, Facing>();
  private light = canvas(1, 1);
  private dpr = 1;
  private time = 0;
  private unsubscribe = () => {};

  /** The spotlights on the billboards and posters (render/spotlights.ts). */
  readonly spotlights = new Spotlights(new URL('./', location.href));

  constructor(host: HTMLElement, sim: Simulation, level: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world';
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize(host);
    this.setSim(sim, level);
    new ResizeObserver(() => this.resize(host)).observe(host);
  }

  /** Tile rectangles to outline, for the editor. */
  ghost: Ghost[] | null = null;

  /** Look at a new sim. `keepView` keeps the camera where it is, for a town rebuilt by the builder. */
  setSim(sim: Simulation, level: string, keepView = false): void {
    const view = { x: this.camera.x, y: this.camera.y, level: this.level };
    this.sim = sim;
    this.layers.clear();
    this.snow.clear();
    this.props.clear();
    this.looks.clear();
    this.level = '';
    this.unsubscribe();
    this.unsubscribe = sim.onChange((levels) => {
      // Someone's look or department may have changed.
      this.looks.clear();
      for (const id of levels) {
        this.layers.delete(id);
        this.snow.delete(id);
        this.props.delete(id);
      }
      this.onWorldChange();
    });
    // First look at a world: pick a sensible zoom for it.
    this.showLevel(level, keepView);
    if (keepView && view.level === level) [this.camera.x, this.camera.y] = [view.x, view.y];
  }

  /** Switch the view to another level. The zoom stays wherever you left it, unless `keepZoom` is false. */
  showLevel(id: string, keepZoom = true): void {
    const level = this.sim.levels.get(id);
    if (!level || id === this.level) return;
    this.level = id;
    const [w, h] = level.size;
    this.camera.setWorld(w * TILE, h * TILE, keepZoom);
    if (level.view) this.camera.centerOn((level.view[0] + 0.5) * TILE, (level.view[1] + 0.5) * TILE);
    this.onLevelChange(id);
  }

  /** Person under a client-space point, if any. */
  pick(clientX: number, clientY: number): Person | null {
    const { x, y } = this.toWorld(clientX, clientY);
    const hits = this.visible()
      .filter((p) => {
        const left = p.x * TILE + 1;
        const feet = p.y * TILE + FEET;
        return x >= left && x <= left + 14 && y >= feet - 18 && y <= feet + 1;
      })
      .sort((a, b) => b.y - a.y);
    return hits[0] ?? null;
  }

  /** `alpha`: progress (0–1) from the previous tick to the current one. `dt`: ms since the last frame. */
  draw(alpha: number, dt: number): void {
    const { ctx, sim, camera } = this;
    this.time += dt;
    camera.update(dt);
    const at = (p: Person) => ({ x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha });

    const target = camera.following ? sim.person(camera.following) : undefined;
    // Someone on the bus is out of sight, but where the bus is: the camera rides along.
    if (target && (sim.present(target) || target.riding)) {
      const pos = at(target);
      const cx = pos.x * TILE + TILE / 2;
      const cy = pos.y * TILE + TILE / 2 - 4;
      if (target.level !== this.level) {
        this.showLevel(target.level);
        camera.centerOn(cx, cy);
      } else {
        camera.glideTo(cx, cy, dt);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    rect(ctx, 0, 0, this.canvas.width, this.canvas.height, BACKGROUND);
    const scale = camera.scale * this.dpr;
    ctx.setTransform(scale, 0, 0, scale, Math.round(-camera.x * scale), Math.round(-camera.y * scale));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.layerOf(this.level), 0, 0);
    const outside = sim.levels.get(this.level)?.kind === 'outside';
    // Snow lying on the grass, thawing away over half a day.
    const lying = outside ? sim.weather.snowLying() : 0;
    if (lying > 0) {
      ctx.globalAlpha = lying;
      ctx.drawImage(this.snowOf(this.level), 0, 0);
      ctx.globalAlpha = 1;
    }

    const night = 1 - sim.daylight();
    const props = this.propsOf(this.level);
    const visible = this.visible();
    const drawables: { sortY: number; draw: () => void }[] = props.map((prop) => {
      // Food trucks are wherever their drive has got to (and only on the map, not the dark beyond it).
      // Boats are on their moorings, out on the river, or (a rowing boat) put away in the club.
      const moving = prop.item.type.street
        ? vehicleAt(sim, prop.item)
        : prop.item.type.boat
          ? sim.boats.poseOf(prop.item)
          : prop.item.type.airfield === 'plane'
            ? sim.planes.poseOf(prop.item)
            : undefined;
      // Between steps, like the cars.
      const pose = moving && { ...moving, x: moving.px + (moving.x - moving.px) * alpha, y: moving.py + (moving.y - moving.py) * alpha };
      if (pose === null) return { sortY: 0, draw: () => {} };
      // On the move it's a van in its lane, hatch shut; it opens up into the stall once it's parked.
      if (pose?.moving) {
        const [mx, my] = [pose.x + pose.middle[0], pose.y + pose.middle[1]];
        const sprite = vehicleSprite('truck', pose.facing, truckLook(prop.item.def.label));
        return { sortY: my * TILE + TILE, draw: () => this.onMap(() => this.ctx.drawImage(sprite, ...vehicleOrigin(sprite, mx, my, pose.facing))) };
      }
      const sortY = pose ? (pose.y + prop.item.type.size[1]) * TILE : prop.sortY;
      if (pose && prop.item.type.boat) return { sortY, draw: () => this.onMap(() => this.paintBoat(prop, night, pose)) };
      // The plane in the air: over everything, its shadow on the ground below.
      const up = prop.item.type.airfield === 'plane' ? sim.planes.poseOf(prop.item)?.up : undefined;
      if (pose && up !== undefined) return { sortY: up > 0 ? Infinity : sortY, draw: () => this.onMap(() => this.paintFlying(prop, { ...pose, up })) };
      return { sortY, draw: pose ? () => this.onMap(() => this.paintProp(prop, night, pose)) : () => this.paintProp(prop, night, pose) };
    });
    for (const p of visible) {
      const pos = at(p);
      // Stepped aside, passing someone (collision.ts): drawn a little to their left.
      const [ax, ay] = asideOffset(p.facing, p.aside ?? 0);
      const drawn = { x: pos.x + ax, y: pos.y + ay };
      drawables.push({ sortY: pos.y * TILE + TILE, draw: () => this.paintPerson(p, drawn) });
    }
    // Cars, and their headlights, which light the road ahead at night.
    const headlights: Light[] = [];
    const cars = this.level === sim.traffic.level ? sim.traffic.cars.map((car) => ({ car, pos: { x: car.px + (car.x - car.px) * alpha, y: car.py + (car.y - car.py) * alpha } })) : [];
    for (const { car, pos } of cars) {
      // Food trucks are drawn as themselves (with the furniture above), lights and all.
      if (car.truck === undefined) drawables.push({ sortY: pos.y * TILE + TILE, draw: () => this.onMap(() => this.paintCar(car, pos)) });
      const [dx, dy] = AHEAD[car.facing];
      if (!car.parked) headlights.push({ x: (pos.x + 0.5 + dx * HEADLIGHT_REACH) * TILE, y: (pos.y + 0.5 + dy * HEADLIGHT_REACH) * TILE, r: HEADLIGHT_RADIUS });
    }
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.draw();

    this.paintLighting(props, night, headlights);
    // After dark, cars on the move show their lights, bright against the dark.
    if (night > DUSK) {
      for (const { car, pos } of cars) {
        if (car.parked) continue;
        const truck = car.truck === undefined ? undefined : sim.items[car.truck];
        if (truck && sim.foodTrucks.parked(truck)) continue;
        const sprite = this.spriteOf(car);
        this.onMap(() => paintVehicleLights(this.ctx, sprite, vehicleOrigin(sprite, pos.x, pos.y, car.facing), car.facing));
      }
    }

    // A frisbee thrown round a game in the park.
    paintGames(ctx, sim, this.level, this.time, at);

    // Fairy lights, pumpkins and fireworks, as the date has them.
    if (this.level === sim.traffic.level) paintSeasonal(ctx, sim, props, night, this.time, sim.tick + alpha);
    // Rain or snow falling, and the gloom under the cloud, out of doors.
    if (outside) paintSky(ctx, sim.weather.at(), this.time, camera.scale * this.dpr);

    // Speech bubbles and labels float above everything.
    for (const p of visible) this.paintBubble(p, at(p));
    const selected = this.selected ? sim.person(this.selected) : undefined;
    if (selected && selected.level === this.level && sim.present(selected)) this.paintLabel(selected, at(selected));
    for (const part of this.ghost ?? []) this.paintGhost(part);
  }

  /** The editor's cursor: a dashed outline, white where it'll work, red where it won't, amber on what'll be cleared away; solid round the selection. */
  private paintGhost({ rect: [x, y, w, h], tone }: Ghost): void {
    const { ctx } = this;
    const [line, fill] = GHOST_TONES[tone];
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash(tone === 'selected' ? [] : [2, 2]);
    ctx.strokeStyle = line;
    ctx.fillStyle = fill;
    ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
    ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, w * TILE - 1, h * TILE - 1);
    ctx.restore();
  }

  /** A client-space point in world pixels. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    return this.camera.toWorld(clientX - bounds.left, clientY - bounds.top);
  }

  /** Front-most furniture under a client-space point, among those `accept` allows. */
  pickItem(clientX: number, clientY: number, accept: (item: Item) => boolean): Prop | null {
    const { x, y } = this.toWorld(clientX, clientY);
    const hits = this.propsOf(this.level).filter(
      (prop) => accept(prop.item) && this.sim.isOpen(prop.item) && x >= prop.x && x < prop.x + prop.img.width && y >= prop.y && y < prop.y + prop.img.height,
    );
    return hits.sort((a, b) => b.sortY - a.sortY)[0] ?? null;
  }

  private visible(): Person[] {
    return this.sim.people.filter((p) => p.level === this.level && this.sim.present(p));
  }

  private snowOf(id: string): HTMLCanvasElement {
    let layer = this.snow.get(id);
    if (!layer) {
      layer = snowLayer(this.sim.levels.get(id)!, this.sim.grids.get(id)!);
      this.snow.set(id, layer);
    }
    return layer;
  }

  private layerOf(id: string): HTMLCanvasElement {
    let layer = this.layers.get(id);
    if (!layer) {
      layer = paintStaticLayer(this.sim.levels.get(id)!, this.sim.grids.get(id)!);
      this.layers.set(id, layer);
    }
    return layer;
  }

  private propsOf(id: string): Prop[] {
    let props = this.props.get(id);
    if (!props) {
      props = buildProps(this.sim.activeItems().filter((item) => item.level === id));
      this.props.set(id, props);
    }
    return props;
  }

  private resize(host: HTMLElement): void {
    this.dpr = window.devicePixelRatio || 1;
    this.camera.pixelRatio = Math.max(1, Math.round(this.dpr));
    const w = host.clientWidth;
    const h = host.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h);
    // Resizing a canvas clears it: paint straight away rather than flash black until the next frame.
    if (this.level) this.draw(1, 0);
  }

  // ── Furniture ─────────────────────────────────────────────────────────────

  private paintProp(prop: Prop, night: number, pose?: { x: number; y: number; facing: string }): void {
    const { ctx } = this;
    if (pose) {
      // A vehicle on the move: drawn where it's got to, facing the way it's going.
      const x = Math.round(pose.x * TILE);
      const y = Math.round(pose.y * TILE) - (prop.item.def.p[1] * TILE - prop.y);
      if (pose.facing === 'left') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(prop.img, -x - prop.img.width, y);
        ctx.restore();
      } else {
        ctx.drawImage(prop.img, x, y);
      }
      return;
    }
    const stage = prop.stages?.[Math.min(prop.stages.length - 1, Math.floor((prop.item.def.progress ?? 0) * prop.stages.length))];
    ctx.drawImage(stage ?? (prop.lit && night > DUSK && this.lightsOn(prop.item) ? prop.lit : prop.img), prop.x, prop.y);
    if (prop.poster) {
      const [x, y, w, h] = prop.poster;
      const art = this.spotlights.pixels(this.spotlightOn(prop.item), w, h);
      if (art) ctx.drawImage(art, x, y);
    }
    if (prop.screen && this.screenOn(prop.item)) {
      const [x, y, w, h] = prop.screen;
      // TVs flicker; monitors just brighten.
      const tv = prop.item.def.t === 'tv';
      const flicker = Math.floor(this.time / 400) % 4;
      ctx.fillStyle = tv ? ['#5b8fd1', '#7fd1ff', '#e98fb3', '#9be38a'][flicker]! : 'rgba(160,220,255,0.28)';
      ctx.globalAlpha = tv ? 0.55 : 1;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /** The spotlight a billboard or poster shows right now: the panels take turns, each a step behind the one before (in the order they were put up). */
  spotlightOn(item: Item): Spotlight {
    const panels = this.sim.activeItems().filter((i) => i.type.spotlight);
    return this.spotlights.at(Math.max(0, panels.indexOf(item)), this.sim.tick);
  }

  /** Street lights (lampposts, the charging canopy) at night; buildings when someone inside is awake. */
  private lightsOn(item: Item): boolean {
    const { sim } = this;
    if (ALWAYS_LIT.has(item.def.t)) return true;
    // The bonfire burns in its hours.
    if (item.def.t === 'bonfire') return sim.withinHours(item);
    const inside = interiorOf(sim, item);
    return !!inside && occupants(sim, inside.levels).some((p) => p.species === 'human' && !asleep(p));
  }

  private screenOn(item: Item): boolean {
    const { sim } = this;
    if (item.type.desk) {
      const owner = item.def.owner ? sim.person(item.def.owner) : undefined;
      return !!owner && owner.desk === item.index && atDesk(owner);
    }
    // Home desks, arcade machines and the jukebox: on while someone's at them.
    if (item.type.study || item.def.t === 'arcade' || item.def.t === 'jukebox') {
      return sim.usersOf(item.index).some((id) => sim.person(id)?.phase === 'doing');
    }
    // A TV is on while someone's on a seat in the same room.
    const room = sim.roomOf(item);
    return sim.people.some((p) => {
      if (p.level !== item.level || p.intent?.kind !== 'use' || p.phase !== 'doing') return false;
      const seat = sim.items[p.intent.item]!;
      return !!seat.type.seat && sim.roomOf(seat) === room;
    });
  }

  // ── Night ─────────────────────────────────────────────────────────────────

  private paintLighting(props: Prop[], night: number, extra: Light[]): void {
    const { sim } = this;
    const level = sim.levels.get(this.level)!;
    const awake = this.visible().some((p) => p.species === 'human' && !asleep(p));
    const indoorsAtWork = level.kind === 'building' || level.kind === 'venue' || level.kind === 'school';
    const depth = level.kind === 'outside' ? 0.62 : indoorsAtWork ? (awake ? 0.15 : 0.5) : awake ? 0.25 : 0.6;
    const darkness = night * depth;
    if (darkness < 0.02) return;

    const lights: Light[] = [...extra];
    for (const prop of props) {
      if (prop.screen && this.screenOn(prop.item)) {
        const [x, y, w, h] = prop.screen;
        lights.push({ x: x + w / 2, y: y + h / 2, r: prop.item.def.t === 'tv' ? 40 : 18 });
      }
      if (prop.poster && night > DUSK) {
        const [x, y, w, h] = prop.poster;
        lights.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 0.8 });
      }
      if (prop.lit && night > DUSK && this.lightsOn(prop.item)) {
        const bulb = prop.item.def.t === 'lamppost';
        // The Green's tree glows all the way up, star and all.
        const tree = prop.item.def.t === 'christmasTree';
        lights.push({ x: prop.x + prop.img.width / 2, y: prop.y + (bulb ? 6 : prop.img.height * (tree ? 0.45 : 0.7)), r: bulb ? 44 : tree ? 44 : prop.img.width * 0.6 });
      }
    }

    // The dark covers the whole view, not just the level, so roofs, treetops and
    // people poking past its edges are in the dark too. Sized in world pixels.
    const { camera } = this;
    const ox = Math.floor(camera.x);
    const oy = Math.floor(camera.y);
    const w = Math.ceil(camera.width) + 2;
    const h = Math.ceil(camera.height) + 2;
    if (this.light.canvas.width !== w || this.light.canvas.height !== h) this.light = canvas(w, h);
    const { canvas: layer, ctx } = this.light;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = NIGHT;
    ctx.globalAlpha = darkness;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    for (const { x, y, r } of lights) {
      const glow = ctx.createRadialGradient(x - ox, y - oy, 0, x - ox, y - oy, r);
      glow.addColorStop(0, 'rgba(0,0,0,0.85)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - ox - r, y - oy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(layer, ox, oy);
  }

  // ── People and pets ───────────────────────────────────────────────────────

  /** A standing, front-facing sprite of someone, for profiles and lists. */
  portrait(p: Person): HTMLCanvasElement {
    if (p.species !== 'human') return petSprite(p.species, p.look[0] ?? 0, 'right', 'stand');
    return characterSprite(this.lookOf(p), 'down', 'stand', p.status.activity === 'focus');
  }

  private lookOf(p: Person): Look {
    let look = this.looks.get(p.id);
    if (!look) {
      const [skin = 0, hair = 0, shirt = 0, style = 0] = p.look;
      const badge = this.sim.world.departments.find((d) => d.id === p.dept)?.color;
      look = { skin, hair, shirt, style, badge, hiVis: p.role === 'crew', child: p.role === 'child', pants: Math.floor(hashString(p.id) * PANTS.length) };
      this.looks.set(p.id, look);
    }
    return look;
  }

  private poseOf(p: Person, pos: { x: number; y: number }): Pose {
    if (p.crawling) return p.phase === 'moving' && Math.floor((pos.x + pos.y) * 3) % 2 ? 'crawlB' : 'crawlA';
    if (p.phase === 'moving') return (['stand', 'walkA', 'stand', 'walkB'] as const)[Math.floor((pos.x + pos.y) * 4) % 4]!;
    if (asleep(p)) return 'sleep';
    // At work, sat down (or stood, at the diner's grill).
    if (seatedAtDesk(p)) return p.intent?.kind === 'work' && this.sim.items[p.desk]?.type.standing ? 'stand' : 'sitDesk';
    // Seated facing away (the far side of a booth) looks like sitting at a desk.
    if (p.intent?.kind === 'use' && this.sim.items[p.intent.item]?.type.seat) return p.facing === 'up' ? 'sitDesk' : 'sitSofa';
    return 'stand';
  }

  /** Draw only within the level's bounds: vehicles drive on from its edge, not out of the dark beyond it. */
  private onMap(draw: () => void): void {
    const { ctx } = this;
    const [w, h] = this.sim.levels.get(this.level)?.size ?? [0, 0];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w * TILE, h * TILE);
    ctx.clip();
    draw();
    ctx.restore();
  }

  /** How a vehicle looks right now, by its kind (vehicles.ts): a car in its paint job, a food truck in its own colours, the bus. */
  private spriteOf(car: Car): HTMLCanvasElement {
    const kind = vehicleKind(car);
    const truck = car.truck === undefined ? undefined : this.sim.items[car.truck];
    const colours: Partial<Colours> | undefined = kind === 'car' ? paintJob(car.look) : truck ? truckLook(truck.def.label) : undefined;
    return vehicleSprite(kind, car.facing, colours);
  }

  /** A car where it's got to; one on charge shows a blinking bolt. */
  private paintCar(car: Car, pos: { x: number; y: number }): void {
    const sprite = this.spriteOf(car);
    const [x, y] = vehicleOrigin(sprite, pos.x, pos.y, car.facing);
    this.ctx.drawImage(sprite, x, y);
    if (car.chargedAt && this.sim.tick < car.chargedAt && Math.floor(this.time / 600) % 2 === 0) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [0, 2]] as const) dot(this.ctx, x + sprite.width / 2 - 1 + dx, y - 4 + dy, '#9be38a');
    }
    // A delivery lorry unloading: hazard lights blinking at its corners.
    if (car.lorry && this.sim.deliveries.unloading(car) && Math.floor(this.time / 450) % 2 === 0) {
      for (const cx of [x + 1, x + sprite.width - 3]) rect(this.ctx, cx, y + sprite.height - 7, 2, 2, '#ffb43a');
    }
  }

  private paintPerson(p: Person, pos: { x: number; y: number }): void {
    const { ctx } = this;
    const x = Math.round(pos.x * TILE) + 2;
    const feet = Math.round(pos.y * TILE) + FEET;
    if (this.selected === p.id) selectionRing(ctx, x + 6, feet);

    if (p.species !== 'human') {
      if (p.facing === 'left' || p.facing === 'right') this.petSides.set(p.id, p.facing);
      const pose: PetPose = asleep(p) ? 'sleep' : p.phase === 'moving' && Math.floor((pos.x + pos.y) * 4) % 2 ? 'walk' : 'stand';
      const sprite = petSprite(p.species, p.look[0] ?? 0, this.petSides.get(p.id) ?? 'right', pose);
      rect(ctx, x + 1, feet - 1, 10, 2, 'rgba(20,14,30,0.2)');
      ctx.drawImage(sprite, x - 1, feet - PET_H + 1);
      if (this.sim.birthdays.is(p)) paintPartyHat(ctx, x + (this.petSides.get(p.id) === 'left' ? 2 : 8), feet - PET_H + 2);
      return;
    }

    // In the water: head and shoulders, at the waterline, with ripples round them.
    if (this.inWater(p, pos)) {
      // Face on (or side on), so you can see who it is: nobody's seen swimming away.
      const sprite = characterSprite(this.lookOf(p), p.facing === 'up' ? 'down' : p.facing, 'stand', false);
      const cut = headTop(sprite) + SWIM_SHOWS;
      ctx.drawImage(sprite, 0, 0, sprite.width, cut, x, feet - 1 - cut, sprite.width, cut);
      const ripple = Math.floor(this.time / 400) % 2;
      rect(ctx, x + 1 - ripple, feet - 2, 10 + ripple * 2, 1, 'rgba(255,255,255,0.7)');
      rect(ctx, x + 3, feet - 1, 6, 1, 'rgba(255,255,255,0.35)');
      return;
    }
    const pose = this.poseOf(p, pos);
    const facing: Facing = pose === 'sitDesk' ? 'up' : pose === 'sitSofa' || pose === 'sleep' ? 'down' : p.facing;
    if (pose !== 'sitDesk' && pose !== 'sitSofa' && pose !== 'sleep') {
      rect(ctx, x + 2, feet - 1, 8, 2, 'rgba(20,14,30,0.22)');
      rect(ctx, x + 3, feet + 1, 6, 1, 'rgba(20,14,30,0.12)');
    }
    const sprite = characterSprite(this.lookOf(p), facing, pose, p.status.activity === 'focus');
    ctx.drawImage(sprite, x, feet - SPRITE_H + 1);
    // Out in the rain: an umbrella up, for those who carry one.
    if (this.sim.weather.wet() > 0 && hasUmbrella(p, this.sim.world.seed) && this.sim.levels.get(p.level)?.kind === 'outside') {
      paintUmbrella(ctx, x + 6, feet - SPRITE_H + 1 + headTop(sprite), hashString(p.id));
    }
    // Their birthday: a party hat, all day.
    if (this.sim.birthdays.is(p)) paintPartyHat(ctx, x + 6, feet - SPRITE_H + 1 + headTop(sprite));
    // Working on a project away from a desk (a booth, a bench): a laptop out (docs/PLANS.md).
    const at = p.intent?.kind === 'hustle' && p.phase === 'doing' ? this.sim.items[p.intent.item] : undefined;
    if (at && !at.type.study) paintLaptop(ctx, x, feet);
  }

  /** The plane where it's got to: lifted off the ground as high as it's flying, facing the way it's going, its shadow beneath. */
  private paintFlying(prop: Prop, pose: { x: number; y: number; facing: string; up: number }): void {
    const { ctx } = this;
    const [w, h] = [prop.item.type.size[0] * TILE, prop.item.type.size[1] * TILE];
    const [x, y] = [Math.round(pose.x * TILE), Math.round(pose.y * TILE)];
    const lift = Math.round(pose.up * PLANE_HEIGHT);
    ctx.fillStyle = `rgba(20,14,30,${0.25 - pose.up * 0.1})`;
    ctx.fillRect(x + 8, y + h - 4, w - 16, 4);
    // The image starts above the footprint (its tail fin), as it does standing.
    const top = y - lift + (prop.y - prop.item.def.p[1] * TILE);
    ctx.save();
    ctx.translate(pose.facing === 'left' ? x + w : x, top);
    if (pose.facing === 'left') ctx.scale(-1, 1);
    ctx.drawImage(prop.img, 0, 0);
    ctx.restore();
  }

  /** A boat out on the river, with whoever's aboard sitting in it (head and shoulders, along it). */
  private paintBoat(prop: Prop, night: number, pose: { x: number; y: number; facing: string }): void {
    this.paintProp(prop, night, pose);
    const aboard = this.sim.boats.aboard(prop.item);
    const length = prop.item.type.size[0] * TILE;
    aboard.forEach((p, i) => {
      const sprite = characterSprite(this.lookOf(p), 'down', 'stand', false);
      const cut = headTop(sprite) + SWIM_SHOWS - 2;
      const x = Math.round(pose.x * TILE + ((i + 1) * length) / (aboard.length + 1) - sprite.width / 2);
      const y = Math.round(pose.y * TILE) + 8 - cut;
      this.ctx.drawImage(sprite, 0, 0, sprite.width, cut, x, y, sprite.width, cut);
    });
  }

  /** Is someone standing in water (the shallows, for a swim), or in a pool? */
  private inWater(p: Person, pos: { x: number; y: number }): boolean {
    if (p.phase === 'doing' && p.intent?.kind === 'use' && this.sim.items[p.intent.item]?.type.pool) return true;
    const level = this.sim.levels.get(p.level);
    const grid = this.sim.grids.get(p.level);
    if (level?.kind !== 'outside' || !grid) return false;
    const floor = level.rooms[grid.roomAt(Math.round(pos.x), Math.round(pos.y))]?.floor;
    return floor === 'shallows' || floor === 'water';
  }

  private paintBubble(p: Person, pos: { x: number; y: number }): void {
    const emoji = bubbleFor(p, this.sim);
    if (!emoji) return;
    const { ctx } = this;
    const cx = Math.round(pos.x * TILE) + 8;
    const lift = p.species === 'human' ? (asleep(p) ? 12 : 21) : 10;
    const by = Math.round(pos.y * TILE) + FEET - lift - 12;
    const bx = cx - 7;
    rect(ctx, bx + 1, by, 13, 11, OUTLINE);
    rect(ctx, bx, by + 1, 15, 9, OUTLINE);
    rect(ctx, bx + 1, by + 1, 13, 9, '#fdfbf6');
    rect(ctx, bx + 2, by + 1, 11, 1, '#ffffff');
    rect(ctx, bx + 1, by + 9, 13, 1, '#e3ddd0');
    rect(ctx, cx - 1, by + 10, 3, 1, '#fdfbf6');
    dot(ctx, cx - 2, by + 10, OUTLINE);
    dot(ctx, cx + 2, by + 10, OUTLINE);
    rect(ctx, cx - 1, by + 11, 2, 1, OUTLINE);
    ctx.font = '8px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = OUTLINE;
    ctx.fillText(emoji, cx + 0.5, by + 5.5);
  }

  private paintLabel(p: Person, pos: { x: number; y: number }): void {
    const { ctx } = this;
    ctx.font = '600 5px ui-monospace, "SF Mono", Menlo, monospace';
    const width = Math.ceil(ctx.measureText(p.name).width) + 4;
    const cx = Math.round(pos.x * TILE) + 8;
    const y = Math.round(pos.y * TILE) + FEET + 3;
    rect(ctx, cx - width / 2, y, width, 7, 'rgba(27,20,34,0.85)');
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, cx, y + 3.75);
  }
}

function selectionRing(ctx: Ctx, cx: number, feet: number): void {
  const color = '#ffd166';
  rect(ctx, cx - 4, feet - 2, 8, 1, color);
  rect(ctx, cx - 4, feet + 2, 8, 1, color);
  for (const dy of [-1, 1]) {
    rect(ctx, cx - 6, feet + dy, 2, 1, color);
    rect(ctx, cx + 4, feet + dy, 2, 1, color);
  }
  rect(ctx, cx - 7, feet, 1, 1, color);
  rect(ctx, cx + 6, feet, 1, 1, color);
}

const USE_BUBBLES: Record<string, string> = {
  arcade: '🕹️',
  dinerCounter: '☕',
  booth: '🥞',
  jukebox: '🎵',
  shelf: '🛒',
  produce: '🛒',
  siteSmall: '🔨',
  siteLarge: '🔨',
  coffee: '☕',
  fridge: '🥪',
  stove: '🍳',
  table: '🍽️',
  smallTable: '🍵',
  cooler: '💧',
  sofa: '🛋️',
  armchair: '📖',
  teacherDesk: '📚',
  canteenTable: '🍎',
  swings: '🎈',
  hopscotch: '⭐',
  pizza: '🍕',
};

const TRUCK_BUBBLES: [string, string][] = [['Taco', '🌮'], ['Noodle', '🍜'], ['Pizza', '🍕']];

/** What floats above someone's head. Feed bubbles win over behaviour. */
export function bubbleFor(p: Person, sim: Simulation): string | null {
  if (p.status.bubble) return p.status.bubble;
  if (asleep(p)) return '💤';
  if (p.distracted > 0) return '💢';
  if (p.muster) return '🔔';
  if (p.role === 'courier') return '🍕';
  if (p.phase !== 'doing' || !p.intent) return null;
  // Staff on shift: serving, or giving the tables a wipe; teachers going round the class.
  if (p.role === 'staff' && p.level === p.works && sim.levels.get(p.level)?.kind === 'school') {
    if (p.intent.kind === 'wander') return '✏️';
  } else if (p.role === 'staff' && p.level === p.works) {
    if (p.talkingTo || p.intent.kind === 'chat') return '☕';
    if (p.intent.kind === 'wander') return '🧽';
  }
  if (p.talkingTo) {
    const other = sim.person(p.talkingTo);
    return p.species !== 'human' ? '❤️' : other && other.species !== 'human' ? '🐾' : '💬';
  }
  switch (p.intent.kind) {
    case 'hustle':
      return sim.ventures.of(p) ? '🚀' : '💡';
    case 'use': {
      const item = sim.items[p.intent.item];
      if (!item) return null;
      if (p.intent.mode === 'takeaway') return '🥡';
      if (p.intent.mode === 'games') return '🎮';
      if (item.type.street) return TRUCK_BUBBLES.find(([word]) => item.def.label?.includes(word))?.[1] ?? '🍴';
      if (item.type.seat && sim.levels.get(item.level)?.kind === 'home') return '📺';
      // Eating together is social: show the chatter.
      if (item.type.hangout && sim.crowdAt(item.level, p.x, p.y, 1.6, p) > 0 && Math.floor(sim.steps / 40) % 2) return '💬';
      return USE_BUBBLES[item.def.t] ?? null;
    }
    case 'chat':
      return '😶';
    case 'retreat':
      return '🌿';
    case 'meeting':
      return '📋';
    default:
      return null;
  }
}

/** A food truck's colours on the move: its own body, its stripe as the band. */
function truckLook(label: string | undefined): Colours {
  const { body, stripe } = truckColours(label);
  return { body, band: stripe };
}

/** How much of a swimmer shows above the water, from the top of their head (sprite rows). */
const SWIM_SHOWS = 11;

/** Where the top of a sprite's head is (its first row with anything in it), worked out once per sprite: sitting, it's lower. */
const heads = new WeakMap<HTMLCanvasElement, number>();
function headTop(sprite: HTMLCanvasElement): number {
  let top = heads.get(sprite);
  if (top === undefined) {
    const { data, width } = sprite.getContext('2d')!.getImageData(0, 0, sprite.width, sprite.height);
    top = 0;
    while (top < sprite.height && !Array.from({ length: width }, (_, x) => data[(top! * width + x) * 4 + 3]).some((a) => a! > 0)) top++;
    heads.set(sprite, top);
  }
  return top;
}

/** A party hat, its brim's middle at (x, y): a striped cone with a bobble on top. */
function paintPartyHat(ctx: Ctx, x: number, y: number): void {
  for (let row = 0; row < 5; row++) {
    const half = Math.floor(row / 2);
    rect(ctx, x - half - 1, y - 5 + row, half * 2 + 2, 1, row % 2 ? '#3f74b5' : '#e7aa2e');
  }
  rect(ctx, x - 1, y - 7, 2, 2, '#c8453a');
}

/** The dark edge round an umbrella. */
const OUTLINE_DARK = '#2a2433';
/** Umbrella canopies, one picked for each person. */
const UMBRELLA_COLOURS = ['#c8453a', '#3f74b5', '#2f2b36', '#e7aa2e', '#379463', '#7f4aa6'];

/** An umbrella held up over someone, its handle at (x, y) (the top of their head): a canopy with ribs, and the shaft. */
function paintUmbrella(ctx: Ctx, x: number, y: number, seed: number): void {
  const colour = UMBRELLA_COLOURS[(seed >>> 0) % UMBRELLA_COLOURS.length]!;
  rect(ctx, x, y - 6, 1, 6, OUTLINE_DARK);
  for (let row = 0; row < 4; row++) {
    const half = 3 + row * 2;
    rect(ctx, x - half, y - 10 + row, half * 2 + 1, 1, row === 0 ? OUTLINE_DARK : colour);
  }
  rect(ctx, x - 9, y - 6, 19, 1, OUTLINE_DARK);
  for (const dx of [-6, 0, 6]) rect(ctx, x + dx, y - 9, 1, 3, 'rgba(255,255,255,0.25)');
}
