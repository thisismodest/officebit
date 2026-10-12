// The tour (docs/UI.md): taken from the welcome card, when you want it. A few
// steps, each lighting up one thing (someone in town, a button) with the rest
// greyed out. Do it yourself, or press Next and it's done for you; the ✕ (or
// Esc) ends it whenever you like, and ending it puts everything away.
import type { Renderer } from '../render/renderer.ts';
import { TILE } from '../render/pixels.ts';
import type { Simulation } from '../sim/sim.ts';
import { townName } from './describe.ts';
import { esc } from './html.ts';
import { icon } from './icons.ts';

export interface TourHost {
  sim(): Simulation;
  readonly renderer: Renderer;
  /** Someone to meet first, kept in view; null if there's nobody about. */
  meet(): string | null;
  steering(): boolean;
  editing(): boolean;
  /** Whose profile is open, if anyone's; and what Next does for you on a step that asks you to do something. */
  profileOf(): string | null;
  select(id: string): void;
  steer(id: string | null): void;
  edit(on: boolean): void;
  /** Back to the town (the house on the tool rail), and are we there. */
  toTown(): void;
  inTown(): boolean;
  /** A building in town worth a look inside (the head office): its footprint (tiles); the map moved to show it; its card
   * opened for you; and whether a building's card is open. */
  building(): { x: number; y: number; w: number; h: number } | null;
  showBuilding(): void;
  openBuilding(): void;
  cardOpen(): boolean;
  /** Everything put away: nobody selected or walked about, no editor, no card. */
  reset(): void;
  /** Stop the clock while the tour's showing you something (so nobody walks off from under it), or start it again. */
  pause(on: boolean): void;
}

interface Step {
  /** What to do, in bold (a step that waits for you to do something); then a line on what it is. */
  action?: (name: string) => string;
  text: (name: string) => string;
  /** What's lit up, in client pixels; null for nothing (the whole town, ungreyed). */
  target: () => DOMRect | null;
  /** Done when this is true (it moves on by itself, once you've done it); and Next doing it for you. */
  done?: () => boolean;
  act?: () => void;
  /** The town carries on meanwhile (walking someone about); every other step, it waits. */
  live?: boolean;
  /** Set up as it starts (the camera on what it's about); and kept so while it's on (their profile, open). */
  enter?: () => void;
  keep?: () => void;
}

/** Room round what's lit up, in CSS pixels; and the gap to the bubble. */
const PAD = 6;
const GAP = 10;
/** How much of someone (tiles) to light up: across, and up from their feet; and how far a building's roof rises above its footprint. */
const PERSON: [w: number, h: number] = [2, 2.5];
const ROOF = 1.5;

export class Tour {
  private readonly host: TourHost;
  private readonly hole: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly steps: Step[];
  private step = -1;
  private who: string | null = null;

  constructor(stage: HTMLElement, host: TourHost) {
    this.host = host;
    this.hole = document.createElement('div');
    this.hole.className = 'tour-hole';
    this.bubble = document.createElement('div');
    this.bubble.className = 'tour-bubble mdst-card mdst-card--compact';
    this.bubble.setAttribute('role', 'dialog');
    this.bubble.setAttribute('aria-label', 'Tour');
    this.hole.hidden = this.bubble.hidden = true;
    stage.append(this.hole, this.bubble);
    this.bubble.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.bubble.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'next') this.next();
      if (action === 'close') this.stop();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.active && !host.steering() && !host.editing()) this.stop();
    });

    const el = (selector: string) => () => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const sim = () => host.sim();
    this.steps = [
      {
        action: (name) => `👆 Tap ${name}`,
        text: () => 'Everyone here has a life of their own. Meet one of them.',
        target: () => this.personRect(),
        done: () => !!this.who && host.renderer.selected === this.who,
        act: () => {
          if (this.who) host.select(this.who);
        },
      },
      {
        text: (name) => `${name}’s profile: what they’re up to, how they’re feeling, their friends and their day.`,
        target: el('.profile'),
        keep: () => this.reselect(),
      },
      {
        action: (name) => `🚶 Walk ${name} about`,
        text: () => 'The walking figure lets you steer them yourself.',
        target: el('.profile [data-action="control"]'),
        done: () => host.steering(),
        act: () => {
          if (this.who) host.steer(this.who);
        },
        keep: () => this.reselect(),
      },
      {
        action: () => '👆 Tap somewhere to go',
        text: (name) => `${name} walks there: through a door, to a seat, or up to someone for a chat. Let go when you’re done.`,
        target: () => null,
        done: () => !host.steering(),
        act: () => host.steer(null),
        live: true,
      },
      {
        action: () => '✏️ Tap the pencil',
        text: () => 'It’s your town to shape.',
        target: el('#edit'),
        done: () => host.editing(),
        act: () => host.edit(true),
      },
      {
        text: () => 'Move things, lay roads and paths, and add furniture and bus stops. Edits save themselves; the tick closes it.',
        target: el('.editor'),
        // On, the editor's closed (it's where the house is).
        act: () => host.edit(false),
      },
      {
        action: () => '🏠 Tap the house',
        text: () => 'Back to the town, from wherever you are.',
        target: el('#to-town'),
        done: () => host.inTown(),
        act: () => host.toTown(),
      },
      {
        action: () => '👆 Tap a building',
        text: () => 'See who’s there, and look inside. Every home, shop and office has someone’s day going on in it.',
        target: () => this.buildingRect(),
        done: () => host.cardOpen(),
        act: () => host.openBuilding(),
        enter: () => host.showBuilding(),
      },
      {
        text: () => `That’s the tour: enjoy ${esc(townName(sim().world) ?? 'your town')}, and pop back whenever you like.`,
        target: el('.place-card'),
      },
    ];
  }

  get active(): boolean {
    return this.step >= 0;
  }

  start(): void {
    this.who = this.host.meet();
    this.go(this.who ? 0 : 4);
  }

  /** Over (done, or ended part way): everything put away, and the town back to its speed. */
  stop(): void {
    if (this.step < 0) return;
    this.step = -1;
    this.hole.hidden = this.bubble.hidden = true;
    this.host.reset();
    this.host.pause(false);
  }

  /** Every frame while it's on: moves on once a step's done, and keeps the light on its target (someone walking, a panel sliding out). */
  update(): void {
    const step = this.steps[this.step];
    if (!step) return;
    if (step.done?.()) this.go(this.step + 1);
    else {
      step.keep?.();
      this.place(step.target());
    }
  }

  /** Next: done for you, if it's a step that asks you to do something (it moves on once it's done); on, otherwise. */
  private next(): void {
    const step = this.steps[this.step];
    step?.act?.();
    if (!step?.done || step.done()) this.go(this.step + 1);
  }

  private go(i: number): void {
    const step = this.steps[i];
    if (!step) {
      this.stop();
      return;
    }
    this.step = i;
    this.host.pause(!step.live);
    step.enter?.();
    const name = esc((this.who && this.host.sim().person(this.who)?.name) || 'them');
    const last = i === this.steps.length - 1;
    this.bubble.innerHTML = `
      <button type="button" class="tour-close icon-button mdst-button--sm mdst-button--ghost" data-action="close" aria-label="End the tour" title="End the tour (Esc)">${icon('close')}</button>
      ${step.action ? `<p class="tour-do">${step.action(name)}</p>` : ''}
      <p>${step.text(name)}</p>
      <p class="tour-actions">
        <span class="mdst-p--sm">${i + 1} of ${this.steps.length}</span>
        <button type="button" class="mdst-button--sm mdst-button--inverted" data-action="next">${last ? 'Done' : 'Next'}</button>
      </p>`;
    this.bubble.hidden = false;
    // Something to do: the light round it pulses, to say so.
    this.hole.toggleAttribute('data-do', !!step.action);
    this.place(step.target());
  }

  /** The light round `rect` (or none), and the bubble beside it: below if there's room, otherwise above (or to the side of
   * something tall). Always all of it on screen; and with what it's about off screen (or gone), none, as for nothing. */
  private place(target: DOMRect | null): void {
    const box = this.bubble.getBoundingClientRect();
    const rect = target && onScreen(target) ? target : null;
    this.hole.hidden = !rect;
    const inView = (left: number, top: number) =>
      Object.assign(this.bubble.style, {
        left: `${Math.min(Math.max(GAP, left), innerWidth - box.width - GAP)}px`,
        top: `${Math.min(Math.max(GAP, top), innerHeight - box.height - GAP)}px`,
      });
    if (!rect) {
      inView((innerWidth - box.width) / 2, innerHeight - box.height - 5 * GAP);
      return;
    }
    Object.assign(this.hole.style, { left: `${rect.left - PAD}px`, top: `${rect.top - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` });
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - box.height;
    let [left, top] = [rect.left + rect.width / 2 - box.width / 2, below + box.height < innerHeight ? below : above];
    // Too tall for either (a panel the height of the screen): beside it, on whichever side has room.
    if (top < 0) [left, top] = [rect.right + PAD + GAP + box.width < innerWidth ? rect.right + PAD + GAP : rect.left - PAD - GAP - box.width, rect.top + GAP];
    inView(left, top);
  }

  /** Their profile open again, if it's been closed (it's what these steps are about). */
  private reselect(): void {
    if (this.who && this.host.profileOf() !== this.who) this.host.select(this.who);
  }

  /** Where the building to look at is on screen (its footprint, and its roof above), if the town's showing. */
  private buildingRect(): DOMRect | null {
    const { renderer } = this.host;
    const b = this.host.building();
    if (!b || !this.host.inTown()) return null;
    const canvas = renderer.canvas.getBoundingClientRect();
    const a = renderer.camera.toView(b.x * TILE, (b.y - ROOF) * TILE);
    const c = renderer.camera.toView((b.x + b.w) * TILE, (b.y + b.h) * TILE);
    return new DOMRect(canvas.left + a.x, canvas.top + a.y, c.x - a.x, c.y - a.y);
  }

  /** Where the person to meet is on screen, if they're on the level showing. */
  private personRect(): DOMRect | null {
    const { renderer } = this.host;
    const p = this.who ? this.host.sim().person(this.who) : undefined;
    if (!p || p.level !== renderer.level) return null;
    const canvas = renderer.canvas.getBoundingClientRect();
    const a = renderer.camera.toView((p.x + 0.5 - PERSON[0] / 2) * TILE, (p.y + 1 - PERSON[1]) * TILE);
    const b = renderer.camera.toView((p.x + 0.5 + PERSON[0] / 2) * TILE, (p.y + 1) * TILE);
    return new DOMRect(canvas.left + a.x, canvas.top + a.y, b.x - a.x, b.y - a.y);
  }
}

/** Is any of it on screen (and is it anything at all: a closed panel's button has no size)? */
function onScreen(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}
