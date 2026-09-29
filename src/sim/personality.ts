// Personality is a handful of 0–1 sliders. Presets are just named starting
// points, so new "types" never need new code.
export interface Traits {
  /** Wants company; low values are repelled by crowds. */
  social: number;
  /** Stays on task and resists interruption. */
  diligence: number;
  /** Wanders, and seeks out people who are concentrating. */
  chaos: number;
  /** Pulls other people towards them. */
  charisma: number;
  /** Works on side projects in the evenings; might start a company. */
  ambition: number;
}

export interface Preset {
  label: string;
  blurb: string;
  traits: Traits;
}

export const PRESETS = {
  regular: {
    label: 'Regular',
    blurb: 'Works, gets coffee, chats a bit.',
    traits: { social: 0.5, diligence: 0.55, chaos: 0.2, charisma: 0.3, ambition: 0.3 },
  },
  introvert: {
    label: 'Introvert',
    blurb: 'Drifts away from groups to somewhere quiet.',
    traits: { social: 0.1, diligence: 0.6, chaos: 0.1, charisma: 0.15, ambition: 0.35 },
  },
  magnet: {
    label: 'Magnet',
    blurb: 'Where they go, a crowd forms.',
    traits: { social: 0.9, diligence: 0.35, chaos: 0.2, charisma: 1, ambition: 0.45 },
  },
  distractor: {
    label: 'Distractor',
    blurb: 'Roams the floor, interrupting whoever is focused.',
    traits: { social: 0.75, diligence: 0.1, chaos: 0.95, charisma: 0.35, ambition: 0.5 },
  },
  workhorse: {
    label: 'Workhorse',
    blurb: 'Glued to the desk until hunger wins.',
    traits: { social: 0.25, diligence: 0.95, chaos: 0.05, charisma: 0.2, ambition: 0.55 },
  },
  founder: {
    label: 'Founder',
    blurb: 'Hustles on a side project every evening, and pitches it to anyone who’ll listen.',
    traits: { social: 0.6, diligence: 0.7, chaos: 0.3, charisma: 0.7, ambition: 0.95 },
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;

export function resolveTraits(preset: string | undefined, overrides: Partial<Traits> = {}): Traits {
  const base = PRESETS[(preset ?? 'regular') as PresetName]?.traits ?? PRESETS.regular.traits;
  const traits = { ...base, ...overrides };
  for (const key of Object.keys(traits) as (keyof Traits)[]) {
    traits[key] = Math.min(1, Math.max(0, traits[key]));
  }
  return traits;
}
