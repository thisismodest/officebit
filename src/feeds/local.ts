// In-page feed transports: the browser console, and postMessage from a page
// embedding the office in an iframe. Both accept the same messages as any
// other feed, and both go through the same validation.
import type { Simulation } from '../sim/sim.ts';
import { parseFeedMessage } from './protocol.ts';

export interface OfficebitApi {
  /** Apply one feed message or an array of them. Returns how many matched someone. */
  push(input: unknown): number;
  /** Select and follow someone by id (anyone, including family, pets and crews); null to stop. */
  follow(id: string | null): void;
  /** Look at a level: at a tile, or the whole place. */
  look(level: string, x?: number, y?: number): void;
  readonly sim: Simulation;
  /** Jump ahead some days, or to a date, and carry on from there. */
  travel?(when: number | string | Date): void;
}

/** What the page can do for the console, beyond feeds. */
export type ViewControls = Pick<OfficebitApi, 'follow' | 'look'>;

declare global {
  interface Window {
    officebit: OfficebitApi;
  }
}

export function exposeLocalFeed(getSim: () => Simulation, { follow, look }: ViewControls): OfficebitApi {
  const push = (input: unknown): number => {
    let applied = 0;
    for (const raw of Array.isArray(input) ? input : [input]) {
      const message = parseFeedMessage(raw);
      if (!message) console.warn('[officebit] ignored malformed feed message', raw);
      else if (getSim().applyFeed(message)) applied++;
      else console.warn(`[officebit] no one matches feed id "${message.id}"`);
    }
    return applied;
  };

  // Any embedding page may drive the office; messages are data only and validated.
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: unknown; messages?: unknown } | null;
    if (data?.type === 'officebit:feed') push(data.messages);
  });

  const api: OfficebitApi = {
    push,
    follow,
    look,
    get sim() {
      return getSim();
    },
  };
  window.officebit = api;
  return api;
}
