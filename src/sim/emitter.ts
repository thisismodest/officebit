// A list of listeners: subscribe with `on` (which returns an unsubscribe), notify with `emit`.
export class Emitter<Args extends unknown[]> {
  private listeners: ((...args: Args) => void)[] = [];

  on(listener: (...args: Args) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(...args: Args): void {
    for (const listener of this.listeners) listener(...args);
  }
}
