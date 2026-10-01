// The welcome card (docs/UI.md): on a first visit, and from the ? on the tool
// rail. A sentence on what this is, the tour if you'd like it, and the way to
// the About page.

/** Remembered once someone's seen it, so it only opens by itself the once. */
const SEEN_KEY = 'officebit:welcomed';

export class Welcome {
  private readonly root: HTMLElement;

  constructor(host: HTMLElement, button: HTMLElement, onTour: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'welcome mdst-card';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Welcome to officebit.town');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="mdst-card-body">
        <h2>Welcome to officebit.town</h2>
        <p>An 8-bit office town that gets on with its day. Everyone here has a life of their own, which carries on whilst you're away.</p>
        <p class="actions">
          <button type="button" class="mdst-button--sm mdst-button--inverted" data-close>Look around</button>
          <button type="button" class="mdst-button--sm" data-tour>Take a tour</button>
          <a class="mdst-button mdst-button--sm" href="./about/">What is this?</a>
        </p>
        <p class="mdst-p--sm"><a href="./changelog/">What's new</a></p>
      </div>`;
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-tour]')!.addEventListener('click', () => {
      this.close();
      onTour();
    });
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    host.append(this.root);
    button.addEventListener('click', () => (this.root.hidden ? this.open() : this.close()));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.hidden) this.close();
    });
    // Tapping anywhere else puts it away (the ? toggles it itself).
    document.addEventListener('pointerdown', (event) => {
      if (!this.root.hidden && !button.contains(event.target as Node)) this.close();
    });
    if (!localStorage.getItem(SEEN_KEY)) this.open();
  }

  open(): void {
    this.root.hidden = false;
    this.root.querySelector<HTMLElement>('[data-close]')!.focus();
  }

  close(): void {
    this.root.hidden = true;
    localStorage.setItem(SEEN_KEY, '1');
  }
}
