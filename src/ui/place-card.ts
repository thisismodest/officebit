// The card that pops up over a clicked building (its name, who's in, a Visit
// button per floor), a door or stairs (a button to go through), or a spotlight (what
// it is, and a link to it). Pinned to where you clicked as the camera moves,
// and kept inside the stage.
import { occupants, type Exit, type Interior } from '../sim/places.ts';
import type { Simulation } from '../sim/sim.ts';
import type { Tile } from '../sim/world.ts';
import type { Spotlight } from '../render/spotlights.ts';
import type { Camera } from '../render/camera.ts';

/** Gap between the card's tail and the clicked point, CSS px. */
const OFFSET = 14;
/** Keep this far from the stage edges, CSS px. */
const INSET = 8;

export class PlaceCard {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly who: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly host: HTMLElement;
  /** The clicked point, in world pixels. */
  private anchor: { x: number; y: number } | null = null;
  private interior: Interior | null = null;

  constructor(host: HTMLElement, onVisit: (level: string, at?: Tile) => void) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'mdst-card mdst-card--compact place-card';
    this.root.setAttribute('role', 'dialog');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="mdst-card-header">
        <strong></strong>
        <button type="button" class="mdst-button--ghost mdst-button--sm" aria-label="Close">✕</button>
      </div>
      <div class="mdst-card-body">
        <p class="mdst-p--sm mdst-p--muted"></p>
        <div class="actions"></div>
      </div>`;
    this.title = this.root.querySelector('strong')!;
    this.who = this.root.querySelector('p')!;
    this.actions = this.root.querySelector('.actions')!;
    this.root.querySelector('[aria-label="Close"]')!.addEventListener('click', () => this.close());
    this.actions.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-level]');
      const level = button?.dataset.level;
      if (!level) return;
      const { x, y } = button.dataset;
      this.close();
      onVisit(level, x && y ? [Number(x), Number(y)] : undefined);
    });
    // Clicks inside the card shouldn't reach the canvas underneath.
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    host.append(this.root);
  }

  /** Open for a building, pinned at a world point. */
  open(interior: Interior, at: { x: number; y: number }): void {
    this.interior = interior;
    const many = interior.levels.length > 1;
    this.show(interior.name, at, interior.levels.map((level, i) => button(many ? level.name : 'Visit', level.id, i === 0)));
  }

  /** Open for a spotlight: its picture, what it says, and a link to it (in a new tab). */
  openSpotlight(spot: Spotlight, art: HTMLCanvasElement | null, at: { x: number; y: number }): void {
    this.interior = null;
    const picture = document.createElement('canvas');
    picture.className = 'spotlight-art';
    if (art) {
      [picture.width, picture.height] = [art.width, art.height];
      picture.getContext('2d')!.drawImage(art, 0, 0);
    }
    const about = document.createElement('p');
    about.className = 'mdst-p--sm';
    about.textContent = spot.description;
    const link = document.createElement('a');
    link.className = 'mdst-button mdst-button--sm mdst-button--inverted';
    link.href = spot.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Visit ${spot.host} ↗`;
    this.show(spot.name, at, [...(art ? [picture] : []), about, link]);
    this.root.dataset.kind = 'spotlight';
  }

  /** Open for a door or stairs: one button, straight through to the other side. */
  openExit(exit: Exit, at: { x: number; y: number }, sim: Simulation): void {
    this.interior = null;
    this.who.textContent = '';
    const name = sim.levels.get(exit.to.level)?.name ?? 'somewhere';
    const go = button(`To ${name}`, exit.to.level, true);
    [go.dataset.x, go.dataset.y] = exit.to.p.map(String);
    this.show(exit.kind === 'stairs' ? 'Stairs' : 'Door', at, [go]);
  }

  private show(title: string, at: { x: number; y: number }, buttons: HTMLElement[]): void {
    this.anchor = at;
    delete this.root.dataset.kind;
    this.title.textContent = title;
    this.root.setAttribute('aria-label', title);
    this.actions.replaceChildren(...buttons);
    this.who.hidden = !this.interior;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.anchor = null;
    this.interior = null;
  }

  /** Keep the card by its building and its head-count current. Call every frame. */
  update(camera: Camera, sim: Simulation): void {
    if (!this.anchor) return;
    if (this.interior) this.who.textContent = whoIsIn(occupants(sim, this.interior.levels), this.interior);

    // Above the point if there's room, otherwise below; always inside the stage.
    const { x, y } = camera.toView(this.anchor.x, this.anchor.y);
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const above = y - OFFSET - h >= INSET;
    const left = clamp(x - w / 2, INSET, this.host.clientWidth - w - INSET);
    const top = clamp(above ? y - OFFSET - h : y + OFFSET, INSET, this.host.clientHeight - h - INSET);
    this.root.dataset.side = above ? 'above' : 'below';
    this.root.style.setProperty('--tail-x', `${clamp(x - left, 12, w - 12)}px`);
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
}

function button(label: string, level: string, primary: boolean): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `mdst-button--sm${primary ? ' mdst-button--inverted' : ''}`;
  el.dataset.level = level;
  el.textContent = label;
  return el;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function whoIsIn(people: { name: string }[], interior: Interior): string {
  const home = interior.levels[0]?.kind === 'home';
  if (people.length === 0) return home ? 'Nobody’s home' : 'Nobody’s in';
  if (!home) return `${people.length} ${people.length === 1 ? 'person' : 'people'} inside`;
  const names = people.map((p) => p.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} home`;
}
