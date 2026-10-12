// "What is this?" (docs/UI.md): a short story over the town, a picture and a line at a time, to get the idea across at
// a glance: it's your town, it started when you arrived, and it carries on. The pictures are the starter town itself
// (public/story/, taken by `npm run story-shots`). Swipe, the arrows or Next; Esc or the ✕ to put it away. The About
// page shows it too, as a strip (storyStrip).
import { esc } from './html.ts';
import { icon } from './icons.ts';
import { SLIDES, type Slide } from './slides.ts';


/** A swipe across the picture this far (CSS px) turns the page; and the pictures' size (CSS px). */
const SWIPE = 40;
const PICTURE = { w: 960, h: 600 };

/** One slide's picture, from `base` (where public/story/ is, from the page). */
function picture(slide: Slide, base: string, lazy: boolean): string {
  return `<img src="${base}${slide.image}" alt="${esc(slide.alt)}" width="${PICTURE.w}" height="${PICTURE.h}" ${lazy ? 'loading="lazy"' : ''} draggable="false">`;
}

/** The story as a strip of pictures, each with its line (the About page). */
export function storyStrip(root: HTMLElement, base: string): void {
  root.innerHTML = SLIDES.map((s) => `<figure>${picture(s, base, true)}<figcaption><strong>${esc(s.title)}</strong> ${esc(s.text)}</figcaption></figure>`).join('');
}

export class Story {
  private readonly root: HTMLElement;
  private readonly onClose: () => void;
  private at = 0;
  private swipe: number | null = null;

  constructor(host: HTMLElement, onClose: () => void = () => {}) {
    this.onClose = onClose;
    this.root = document.createElement('div');
    this.root.className = 'story';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'What is officebit?');
    this.root.innerHTML = `
      <div class="story-card mdst-card">
        <button type="button" class="story-close icon-button mdst-button--sm" data-action="close" aria-label="Close" title="Close (Esc)">${icon('close')}</button>
        ${SLIDES.map(
          (s, i) => `
          <figure class="story-slide" data-slide="${i}" hidden>
            ${picture(s, './story/', i > 0)}
            <figcaption><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></figcaption>
          </figure>`,
        ).join('')}
        <div class="story-nav">
          <button type="button" class="mdst-button--sm mdst-button--ghost" data-action="back">Back</button>
          <span class="story-dots" aria-hidden="true">${SLIDES.map(() => '<span></span>').join('')}</span>
          <button type="button" class="mdst-button--sm mdst-button--inverted" data-action="next">Next</button>
        </div>
      </div>`;
    this.root.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'close' || event.target === this.root) this.close();
      if (action === 'back') this.show(this.at - 1);
      if (action === 'next') this.at === SLIDES.length - 1 ? this.close() : this.show(this.at + 1);
    });
    // Nothing reaches the town underneath; a swipe across turns the page.
    this.root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.swipe = (event.target as HTMLElement).closest('img') ? event.clientX : null;
    });
    this.root.addEventListener('pointerup', (event) => {
      if (this.swipe === null) return;
      const dx = event.clientX - this.swipe;
      this.swipe = null;
      if (Math.abs(dx) >= SWIPE) this.show(this.at + (dx < 0 ? 1 : -1));
    });
    this.root.addEventListener('wheel', (event) => event.stopPropagation());
    document.addEventListener('keydown', (event) => {
      if (this.root.hidden) return;
      if (event.key === 'Escape') this.close();
      else if (event.key === 'ArrowRight') this.show(this.at + 1);
      else if (event.key === 'ArrowLeft') this.show(this.at - 1);
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    host.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** From the start. */
  start(): void {
    this.root.hidden = false;
    this.show(0);
    this.root.querySelector<HTMLElement>('[data-action="next"]')!.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.onClose();
  }

  private show(i: number): void {
    this.at = Math.max(0, Math.min(SLIDES.length - 1, i));
    for (const slide of this.root.querySelectorAll<HTMLElement>('.story-slide')) slide.hidden = Number(slide.dataset.slide) !== this.at;
    for (const [k, dot] of [...this.root.querySelectorAll('.story-dots span')].entries()) dot.toggleAttribute('data-on', k === this.at);
    const last = this.at === SLIDES.length - 1;
    this.root.querySelector<HTMLButtonElement>('[data-action="back"]')!.disabled = this.at === 0;
    this.root.querySelector('[data-action="next"]')!.textContent = last ? 'Look around' : 'Next';
  }
}
