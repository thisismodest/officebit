// Save and share (docs/BUILDER.md#save-and-share): a small menu from the
// toolbar. Save the town in this browser, copy a link with it inside, download
// or open it as a file, or start again from the starter town.
import type { WorldDef } from '../sim/world.ts';
import { popover, type Toggle } from './popover.ts';
import { STARTER } from '../worlds/starter.ts';
import { HASH_KEY, checkWorld, clearLocal, encodeWorld, saveLocal } from './world-io.ts';

export interface ShareHost {
  design(): WorldDef;
  /** Rebuild the town from a world. Returns validate() problems; throws if it can't run. */
  apply(world: WorldDef): string[];
}

export class ShareMenu {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly link: HTMLInputElement;
  private readonly host: ShareHost;
  private readonly toggle: Toggle;

  constructor(button: HTMLElement, host: ShareHost) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'share-menu popover mdst-card mdst-card--compact';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button type="button" class="mdst-button--ghost mdst-button--sm" data-action="save">Save in this browser</button>
      <button type="button" class="mdst-button--ghost mdst-button--sm" data-action="link">Copy a link to this town</button>
      <button type="button" class="mdst-button--ghost mdst-button--sm" data-action="download">Download it</button>
      <label class="mdst-button mdst-button--ghost mdst-button--sm">Open a file…<input type="file" accept="application/json,.json" hidden></label>
      <hr>
      <button type="button" class="mdst-button--ghost mdst-button--sm" data-action="reset">Start again from the starter town</button>
      <input class="link" readonly hidden aria-label="Link to this town">
      <p class="status mdst-p--sm" role="status"></p>`;
    this.status = this.root.querySelector('.status')!;
    this.link = this.root.querySelector('.link')!;
    button.after(this.root);
    this.toggle = popover(button, this.root, () => {
      this.link.hidden = true;
      this.say('');
    });
    this.root.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) void this.act(action);
    });
    this.root.querySelector<HTMLInputElement>('input[type=file]')!.addEventListener('change', (event) => void this.open(event.target as HTMLInputElement));
  }

  private async act(action: string): Promise<void> {
    const world = this.host.design();
    switch (action) {
      case 'save':
        saveLocal(world);
        return this.say('Saved. This browser will open it next time.');
      case 'link': {
        const url = `${location.origin}${location.pathname}#${HASH_KEY}=${await encodeWorld(world)}`;
        history.replaceState(null, '', url);
        this.link.value = url;
        this.link.hidden = false;
        this.link.select();
        const copied = await navigator.clipboard?.writeText(url).then(
          () => true,
          () => false,
        );
        return this.say(copied ? 'Copied. Anyone who opens the link gets this town.' : 'Copy the link above: anyone who opens it gets this town.');
      }
      case 'download': {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' }));
        a.download = `${world.name.toLowerCase().replace(/\W+/g, '-') || 'officebit'}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      case 'reset':
        if (!confirm('Start again from the starter town? Anything you haven’t saved is lost.')) return;
        clearLocal();
        history.replaceState(null, '', location.pathname + location.search);
        this.apply(structuredClone(STARTER), 'Back to the starter town.');
        return;
    }
  }

  private async open(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const { world, problems } = checkWorld(JSON.parse(await file.text()));
      if (!world) return this.say(`That world can't be opened: ${problems[0]}`, true);
      this.apply(world, `Opened ${file.name}.`);
    } catch {
      this.say("That file isn't a world.", true);
    }
  }

  private apply(world: WorldDef, done: string): void {
    try {
      const problems = this.host.apply(world);
      if (problems.length) {
        this.say(`${done} Worth fixing: ${problems[0]}`);
        return;
      }
      this.toggle(false);
    } catch (error) {
      this.say(`That world won't run: ${(error as Error).message}`, true);
    }
  }

  private say(text: string, bad = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('bad', bad);
  }
}
