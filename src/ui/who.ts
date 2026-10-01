// Who someone is, in plain English: their role, household and workplace.
// Shared by the directory, the profile and the overview.
import { formatTime, TICKS_PER_HOUR } from '../sim/clock.ts';
import type { Intent, Person } from '../sim/person.ts';
import type { Simulation } from '../sim/sim.ts';

const SPECIES: Record<string, string> = { cat: 'cat', dog: 'dog' };

/** "Brand · Head office", "Staff · The Night Owl Diner", "Rowan's dog", "Builder", "Rowan's child · Acacia Primary", "Visitor · passing through". */
export function describeRole(p: Person, sim: Simulation): string {
  if (p.species !== 'human') return `${ownerOf(p, sim)}'s ${SPECIES[p.species] ?? p.species}`;
  if (p.role === 'crew') return 'Builder';
  if (p.role === 'courier') return 'Pizza rider';
  if (p.role === 'visitor') return 'Visitor · passing through';
  const works = sim.levels.get(p.works ?? '');
  if (p.role === 'staff') return `${works?.kind === 'school' ? 'Teacher' : 'Staff'} · ${works?.name ?? 'somewhere'}`;
  if (p.role === 'child') return `${ownerOf(p, sim)}'s child · ${works?.name ?? 'school'}`;
  if (p.role === 'resident') return `Lives in ${sim.levels.get(p.home ?? '')?.name ?? 'town'}`;
  if (p.npc) return `Lives with ${ownerOf(p, sim)}`;
  const company = sim.companies.get(p.company ?? '');
  if (!company) return 'Between jobs';
  const dept = sim.world.departments.find((d) => d.id === p.dept);
  return dept && company === sim.world.companies[0] ? `${dept.name} · ${company.name}` : company.name;
}

/** Everyone who lives in the same home, apart from `p`. */
export function householdOf(p: Person, sim: Simulation): Person[] {
  return p.home ? sim.people.filter((q) => q !== p && q.home === p.home) : [];
}

/** Who a home belongs to (the employee who lives there), for "Rowan's dog". */
function ownerOf(p: Person, sim: Simulation): string {
  return sim.people.find((q) => !q.npc && q.home === p.home)?.name ?? sim.levels.get(p.home ?? '')?.name ?? 'someone';
}

/** The group someone belongs to in each directory view. */
export function groupOf(p: Person, sim: Simulation, by: 'place' | 'work' | 'home'): string {
  if (by === 'place') return p.hidden ? 'Out of town' : (sim.levels.get(p.level)?.name ?? 'Somewhere');
  if (by === 'home') return sim.levels.get(p.home ?? '')?.name ?? 'No fixed abode';
  if (p.role === 'crew') return 'Building crews';
  if (p.role === 'courier') return 'Deliveries';
  if (p.role === 'visitor') return 'Visitors';
  if (p.role === 'staff' || p.role === 'child') return sim.levels.get(p.works ?? '')?.name ?? 'Staff';
  if (p.npc) return 'Family and pets';
  return sim.companies.get(p.company ?? '')?.name ?? 'Between jobs';
}

/** Their day at a glance: "Up 07:12 · Work 08:10–17:40 · Bed 23:05". */
export function routineOf(p: Person): string {
  const { wake, commute, leave, bed } = p.routine;
  const at = (hour: number) => formatTime(Math.round(((hour - 6 + 24) % 24) * TICKS_PER_HOUR));
  if (p.species !== 'human') return 'Naps whenever they like';
  if (p.role === 'visitor') return 'Just passing through';
  const works = p.role === 'staff' || !!p.company || p.role === 'crew' || p.role === 'child';
  const day = p.role === 'child' ? 'School' : 'Work';
  return works && commute !== leave ? `Up ${at(wake)} · ${day} ${at(commute)}–${at(leave)} · Bed ${at(bed)}` : `Up ${at(wake)} · Bed ${at(bed)}`;
}

/** A brain option, as a reason: "Coffee machine", "Chat with Bea". */
export function optionLabel(intent: Intent, sim: Simulation, p?: Person): string {
  const name = (id: string) => sim.person(id)?.name ?? 'someone';
  switch (intent.kind) {
    case 'work':
      return p?.role === 'child' ? 'Schoolwork' : 'Get on with work';
    case 'use': {
      const item = sim.items[intent.item];
      if (intent.mode === 'takeaway') return 'A takeaway in front of the TV';
      if (intent.mode === 'games') return 'Video games';
      if (item?.type.groceries) return 'The food shop';
      return item?.def.label ?? item?.type.name ?? 'Something';
    }
    case 'hustle':
      return 'Their side project';
    case 'play':
      return 'Frisbee in the park';
    case 'bus':
      return 'The bus';
    case 'drive':
      return 'The car';
    case 'fly':
      return 'The plane';
    case 'chat':
      return `Chat with ${name(intent.with)}`;
    case 'wander':
      return 'A wander';
    case 'retreat':
      return 'Somewhere quiet';
    case 'swim':
      return 'The river';
    case 'meeting':
      return 'A meeting';
    case 'sleep':
      return 'Bed';
    case 'leave':
      return 'Head off';
    case 'queue':
      return `Wait for ${sim.levels.get(intent.level)?.name ?? 'somewhere'} to open`;
  }
}
