// Going back (docs/UI.md): each time you open someone or go somewhere, the view
// you're leaving is remembered, so Back can return to it. A person comes back
// selected and followed, wherever they are now; a place as you left it.

/** How many steps back are kept. */
const KEEP = 30;

export interface View {
  /** Who you were looking at or following, if anyone. */
  person: string | null;
  level: string;
  /** The camera: top-left in world pixels, and zoom. */
  x: number;
  y: number;
  zoom: number;
}

export class ViewHistory {
  private readonly stack: View[] = [];

  get canGoBack(): boolean {
    return this.stack.length > 0;
  }

  /** Remember the view you're leaving. The same person twice running counts once. */
  push(view: View): void {
    const last = this.stack.at(-1);
    if (last && view.person && last.person === view.person) this.stack[this.stack.length - 1] = view;
    else this.stack.push(view);
    if (this.stack.length > KEEP) this.stack.shift();
  }

  back(): View | undefined {
    return this.stack.pop();
  }

  clear(): void {
    this.stack.length = 0;
  }
}
