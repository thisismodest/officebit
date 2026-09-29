// The officebit feed protocol: how any outside data source (a Slack bridge, an
// agent runner, a gist you edit by hand) tells the office what people are up
// to. Feeds describe *state*; the sim decides how each person acts it out.
//
// Feeds are data, never code — a shared world can point at a feed, but it can
// never make the page run someone else's script.

export const PRESENCES = ['here', 'away'] as const;
export const ACTIVITIES = ['working', 'focus', 'meeting', 'break', 'idle'] as const;

export type Presence = (typeof PRESENCES)[number];
export type Activity = (typeof ACTIVITIES)[number];

/** One update for one person. Omitted fields are unchanged; `null` clears. */
export interface FeedMessage {
  /** External id, mapped through world.feed.ids, or a person id directly. */
  id: string;
  presence?: Presence;
  /** working: at desk · focus: at desk, headphones on, won't be disturbed · meeting: in `room` · break: anything but work · idle: personality decides. */
  activity?: Activity | null;
  /** Room id, used with `meeting`. */
  room?: string | null;
  /** Short text or emoji shown above their head. */
  bubble?: string | null;
  /** Longer status shown in the inspector ("Running the test suite"). */
  label?: string | null;
}

export interface ExternalStatus {
  presence?: Presence;
  activity?: Activity;
  room?: string;
  bubble?: string;
  label?: string;
}

const MAX_TEXT = 80;

/** Validates untrusted input. Returns null for anything malformed. */
export function parseFeedMessage(input: unknown): FeedMessage | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > MAX_TEXT) return null;

  const message: FeedMessage = { id: raw.id };
  if ('presence' in raw) {
    if (!PRESENCES.includes(raw.presence as Presence)) return null;
    message.presence = raw.presence as Presence;
  }
  if ('activity' in raw) {
    if (raw.activity !== null && !ACTIVITIES.includes(raw.activity as Activity)) return null;
    message.activity = raw.activity as Activity | null;
  }
  for (const key of ['room', 'bubble', 'label'] as const) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value !== null && typeof value !== 'string') return null;
    message[key] = typeof value === 'string' ? value.slice(0, MAX_TEXT) : null;
  }
  return message;
}

export function mergeStatus(current: ExternalStatus, message: FeedMessage): ExternalStatus {
  const next = { ...current };
  if (message.presence) next.presence = message.presence;
  for (const key of ['activity', 'room', 'bubble', 'label'] as const) {
    const value = message[key];
    if (value === null) delete next[key];
    else if (value !== undefined) (next as Record<string, string>)[key] = value;
  }
  return next;
}
