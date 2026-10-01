// The tour (docs/UI.md): taken from the welcome card, when you want it. A few
// steps, each lighting up one thing (someone in town, a button) with the rest
// greyed out, and waiting for you to do it. Skip it whenever you like.
import type { Renderer } from '../render/renderer.ts';
import { TILE } from '../render/pixels.ts';
import type { Simulation } from '../sim/sim.ts';
import { townName } from './describe.ts';
import { esc } from './html.ts';

export interface TourHost {
  sim(): Simulation;
  readonly renderer: Renderer;
  /** Someone to meet first, kept in view; null if there's nobody about. */
  meet(): string | null;
  steering(): boolean;
  editing(): boolean;
}

interface Step {
  text: (name: string) => string;
  /** What's lit up, in client pixels; null for nothing (the whole town, ungreyed). */
  target: () => DOMRect | null;
  /** Done when this is true (it moves on by itself); without it, a Next button. */
  done?: () => boolean;
}

/** Room round what's lit up, in CSS pixels; and the gap to the bubble. */
const PAD = 6;
const GAP = 10;
/** How much of someone (tiles) to light up: across, and up from their feet. */
const PERSON: [w: number, h: number] = [2, 2.5];

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
      if (action === 'next') this.go(this.step + 1);
      if (action === 'skip') this.stop();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.active && !host.steering() && !host.editing()) this.stop();
    });

    const el = (selector: string) => () => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const sim = () => host.sim();
    this.steps = [
      {
        text: (name) => `Everyone here has a life of their own. Click ${name} to meet them.`,
        target: () => this.personRect(),
        done: () => !!this.who && host.renderer.selected === this.who,
      },
      {
        text: (name) => `${name}’s profile: what they’re up to, how they’re feeling, their friends and their day.`,
        target: el('.profile'),
      },
      {
        text: (name) => `Take control of ${name}…`,
        target: el('.profile [data-action="control"]'),
        done: () => host.steering(),
      },
      {
        text: (name) => `…and click anywhere for ${name} to walk there, a door to go through, or someone to chat to. Let go (or Esc) when you’re done.`,
        target: () => null,
        done: () => !host.steering(),
      },
      {
        text: () => 'It’s your town to shape: the pencil opens the editor.',
        target: el('#edit'),
        done: () => host.editing(),
      },
      {
        text: () => `Move things, lay roads and paths, and add furniture and bus stops. Edits save themselves; the tick closes it. That’s the tour: enjoy ${esc(townName(sim().world) ?? 'your town')}!`,
        target: el('.editor'),
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

  stop(): void {
    this.step = -1;
    this.hole.hidden = this.bubble.hidden = true;
  }

  /** Every frame while it's on: moves on once a step's done, and keeps the light on its target (someone walking, a panel sliding out). */
  update(): void {
    const step = this.steps[this.step];
    if (!step) return;
    if (step.done?.()) return this.go(this.step + 1);
    this.place(step.target());
  }

  private go(i: number): void {
    const step = this.steps[i];
    if (!step) return this.stop();
    this.step = i;
    const name = esc((this.who && this.host.sim().person(this.who)?.name) || 'them');
    const last = i === this.steps.length - 1;
    this.bubble.innerHTML = `
      <p>${step.text(name)}</p>
      <p class="tour-actions">
        <span class="mdst-p--sm">${i + 1} of ${this.steps.length}</span>
        <button type="button" class="mdst-button--sm mdst-button--ghost" data-action="skip">${last ? 'Close' : 'Skip tour'}</button>
        ${step.done || last ? '' : '<button type="button" class="mdst-button--sm mdst-button--inverted" data-action="next">Next</button>'}
      </p>`;
    this.bubble.hidden = false;
    this.place(step.target());
  }

  /** The light round `rect` (or none), and the bubble beside it: below if there's room, otherwise above (or to the side of something tall). */
  private place(rect: DOMRect | null): void {
    const box = this.bubble.getBoundingClientRect();
    this.hole.hidden = !rect;
    if (!rect) {
      Object.assign(this.bubble.style, { left: `${(innerWidth - box.width) / 2}px`, top: `${innerHeight - box.height - 5 * GAP}px` });
      return;
    }
    Object.assign(this.hole.style, { left: `${rect.left - PAD}px`, top: `${rect.top - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` });
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - box.height;
    let [left, top] = [rect.left + rect.width / 2 - box.width / 2, below + box.height < innerHeight ? below : above];
    // Too tall for either (a panel the height of the screen): beside it, on whichever side has room.
    if (top < 0) [left, top] = [rect.right + PAD + GAP + box.width < innerWidth ? rect.right + PAD + GAP : rect.left - PAD - GAP - box.width, rect.top + GAP];
    left = Math.min(Math.max(GAP, left), innerWidth - box.width - GAP);
    Object.assign(this.bubble.style, { left: `${left}px`, top: `${Math.max(GAP, top)}px` });
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
