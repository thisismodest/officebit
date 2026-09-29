// Kinds of people (docs/PEOPLE.md#kinds): who drives each kind, what their day
// looks like, and what they take part in. Everything the sim needs to know
// about a new kind of person is one entry in ROLES.
import { CrewBrain, PetBrain, StaffBrain } from './brain.ts';
import type { Person } from './person.ts';
import type { Traits } from './personality.ts';
import { homebodyRoutine, routineFor, schoolRoutine, shiftRoutine, type Routine } from './schedule.ts';
import type { Brain } from './sim.ts';
import type { NpcRole, Species } from './world.ts';

/** Employees and family have no role in the world file; pets are family too, but with four legs. */
export type Kind = 'employee' | 'family' | 'pet' | NpcRole;

export interface Role {
  /** Makes their brain, if not the personality-driven one (the sim makes one per kind, when it first needs it, so brains can look things up here too). Riders and visitors are handed theirs when they arrive. */
  brain?: () => Brain;
  /** Their hours, from their traits and a per-person seed. Staff with a shift get it built round that instead. */
  routine(traits: Traits, seed: number): Routine;
  /**
   * How their routine turns into where they should be: `routine` as it
   * stands; `homebody` never goes to work; `errand` is always on the job;
   * `employee` also follows their feed status.
   */
  day: 'routine' | 'homebody' | 'errand' | 'employee';
  /** Weekends off (anyone attached to a school keeps school weeks too). */
  weekends: boolean;
  /** Out of work, they may go to public venues, not just home. */
  goesOut: boolean;
  /** When the periodic rethink may stop them: any time (wrong place, a crowd, a foe), only once their working day ends, or never. */
  rethink: 'always' | 'offShift' | 'never';
  /** Makes friends and enemies, and can fall in love. */
  relationships: boolean;
  romance: boolean;
  /** You can take control of them. */
  controllable: boolean;
  /** Venue staff come and serve them. */
  customer: boolean;
  /** Kept in the world file. Riders and visitors are just passing through: the sim brings them in and sees them off. */
  saved: boolean;
}

const PERSON: Role = {
  routine: routineFor,
  day: 'employee',
  weekends: true,
  goesOut: true,
  rethink: 'always',
  relationships: true,
  romance: true,
  controllable: true,
  customer: true,
  saved: true,
};

/** Someone who's in town to do one thing (drop off a pizza, stop for lunch) and then leaves again. */
const PASSING_THROUGH: Role = {
  routine: (_traits, seed) => homebodyRoutine(seed),
  day: 'errand',
  weekends: false,
  goesOut: false,
  rethink: 'never',
  relationships: false,
  romance: false,
  controllable: false,
  customer: false,
  saved: false,
};

export const ROLES: Record<Kind, Role> = {
  employee: PERSON,
  family: { ...PERSON, routine: (_traits, seed) => homebodyRoutine(seed), day: 'homebody', weekends: false, goesOut: false, customer: false },
  pet: { ...PERSON, brain: () => new PetBrain(), routine: (_traits, seed) => homebodyRoutine(seed), day: 'homebody', weekends: false, goesOut: false, rethink: 'never', romance: false, customer: false },
  staff: { ...PERSON, brain: () => new StaffBrain(), routine: (_traits, seed) => homebodyRoutine(seed), day: 'routine', weekends: false, customer: false },
  crew: { ...PERSON, brain: () => new CrewBrain(), day: 'routine', goesOut: false, rethink: 'offShift', romance: false, controllable: false, customer: false },
  child: { ...PERSON, routine: (_traits, seed) => schoolRoutine(seed), day: 'routine', weekends: false, goesOut: false, romance: false, customer: false },
  courier: PASSING_THROUGH,
  visitor: { ...PASSING_THROUGH, customer: true },
};

/** What kind of person someone is. */
export function kindOf(p: Pick<Person, 'role' | 'species' | 'npc'>): Kind {
  return p.role ?? (p.species !== 'human' ? 'pet' : p.npc ? 'family' : 'employee');
}

export function roleOf(p: Pick<Person, 'role' | 'species' | 'npc'>): Role {
  return ROLES[kindOf(p)];
}

/** Someone's hours: a shift if they have one, otherwise what their kind of person keeps. */
export function dailyRoutine(kind: { role?: NpcRole; species: Species; npc: boolean }, traits: Traits, seed: number, shift?: [number, number]): Routine {
  return shift ? shiftRoutine(shift) : roleOf(kind).routine(traits, seed);
}
