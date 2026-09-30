// Plain-English summaries of what someone is up to, and where, for the panel.
import { PRESETS, type PresetName } from '../sim/personality.ts';
import { asleep, catchingUp, type Person } from '../sim/person.ts';
import type { Simulation } from '../sim/sim.ts';

export function describe(p: Person, sim: Simulation): string {
  if (p.hidden) return 'Out of the office';
  if (p.status.label) return p.status.label;
  if (p.transit > 0) return sim.levels.get(p.level)?.kind === 'building' ? 'On the stairs' : 'Through the door';
  const intent = p.intent;
  if (!intent) return 'Thinking…';
  const moving = p.phase === 'moving';
  const nameOf = (id: string) => sim.person(id)?.name ?? 'someone';

  // Long walks between places read better as a commute.
  const heading = moving && p.dest && p.dest.level !== p.level ? sim.levels.get(p.dest.level) : undefined;
  if (heading && p.home && sim.floorsOf(p.home).includes(heading.id)) return 'Heading home';
  if (heading?.kind === 'building' && sim.levels.get(p.level)?.kind !== 'building') return 'Heading to work';
  if (heading?.kind === 'school') return p.role === 'child' ? 'Walking to school 🎒' : 'Heading to work';

  if (asleep(p)) return 'Asleep';
  if (p.muster) return moving ? 'Filing out for the fire drill' : 'Waiting outside: fire drill 🔔';
  if (p.role === 'courier') return intent.kind === 'leave' ? 'Heading off' : 'Delivering pizza 🍕';
  if (p.role === 'visitor' && intent.kind === 'wander') {
    if (moving) return 'Heading back to the car 🚗';
    return sim.visitors.charging(p) ? 'Waiting for the car to charge 🔌' : 'Getting back in the car';
  }
  const atSchool = sim.levels.get(p.level)?.kind === 'school';
  if (p.role === 'staff' && p.level === p.works && atSchool) {
    if (intent.kind === 'wander') return moving ? 'Going round the class' : 'Helping a pupil';
    if (intent.kind === 'use') return 'Teaching';
  }
  if (p.role === 'staff' && p.level === p.works) {
    if (intent.kind === 'chat') return `Serving ${nameOf(intent.with)}`;
    if (intent.kind === 'wander') return 'Wiping down the tables';
    if (intent.kind === 'use') return 'Behind the till';
  }
  if (p.talkingTo && !moving) {
    const other = sim.person(p.talkingTo);
    return other && other.species !== 'human' ? `Playing with ${other.name}` : `Chatting with ${nameOf(p.talkingTo)}`;
  }
  if (p.distracted > 0) return 'Distracted';
  switch (intent.kind) {
    case 'work':
      if (p.role === 'child') return moving ? 'Heading to class' : 'In class ✏️';
      if (moving) return 'Heading to their desk';
      if (p.status.activity === 'focus') return 'Deep in focus 🎧';
      if (sim.items[p.desk]?.def.t === 'checkout') return 'On the checkout';
      return p.focus > 0.6 ? 'In the zone' : 'Working';
    case 'use': {
      const item = sim.items[intent.item];
      const name = item?.type.name.toLowerCase() ?? 'something';
      if (moving) return item?.type.street ? `Popping out to the ${item.def.label?.toLowerCase() ?? name}` : `Off to the ${name}`;
      if (intent.mode === 'takeaway') return 'Eating a takeaway in front of the TV';
      if (intent.mode === 'games') return 'Playing video games 🎮';
      if (item?.type.street) return `Lunch from the ${item.def.label?.toLowerCase() ?? name}`;
      if (item?.def.t === 'arcade') return 'On the arcade machine';
      if (item?.def.t === 'dinerCounter') return 'Coffee at the diner counter';
      if (item?.type.groceries) return 'Doing the food shop 🛒';
      if (item?.def.t === 'booth') return 'Eating in a diner booth';
      if (item?.def.t === 'jukebox') return 'Picking a song on the jukebox';
      if (item?.def.t === 'stove') return 'Cooking';
      if (item?.def.t === 'canteenTable') return 'School lunch';
      if (item?.def.t === 'swings') return 'On the swings';
      if (item?.def.t === 'hopscotch') return 'Playing hopscotch';
      if (item?.def.t === 'pizza') return 'Having pizza 🍕';
      if (item?.type.seat && sim.levels.get(item.level)?.kind === 'home') return 'Watching TV';
      return `At the ${name}`;
    }
    case 'chat':
    {
      if (!moving) return 'Waiting awkwardly';
      const other = sim.person(intent.with);
      return other && catchingUp(p, other) ? `Hurrying to catch up with ${nameOf(intent.with)}` : `Walking over to ${nameOf(intent.with)}`;
    }
    case 'wander':
      if (p.role === 'crew') return 'Heading to the building site';
      return moving ? 'Wandering' : 'Pottering about';
    case 'retreat':
      if (sim.levels.get(p.level)?.kind === 'home') return 'Having some time alone';
      return moving ? 'Escaping the crowd' : 'Hiding somewhere quiet';
    case 'meeting':
      return moving ? 'Heading to a meeting' : 'In a meeting';
    case 'hustle': {
      const venture = sim.ventures.of(p);
      const together = sim.plans.due(p);
      if (moving) return together ? 'Off to work on their projects with friends' : 'Off to work on their side project';
      if (together) return `Working on ${venture ? venture.name : 'their ideas'} with ${others(p, together.members, sim)} 💻`;
      return venture ? `Working on ${venture.name} 🚀` : 'Tinkering with a big idea 💡';
    }
    case 'play': {
      const plan = sim.plans.get(intent.plan);
      if (moving) return 'Off to the park for frisbee';
      return plan ? `Throwing a frisbee about with ${others(p, plan.members, sim)} 🥏` : 'Throwing a frisbee about 🥏';
    }
    case 'sleep':
      return 'Off to bed';
    case 'leave':
      return 'Heading out';
    case 'queue': {
      const name = sim.levels.get(intent.level)?.name ?? 'somewhere';
      return moving ? `Off to ${name}` : `Waiting for ${name} to open`;
    }
  }
}

/** "First floor · Engineering" */
export function whereIs(p: Person, sim: Simulation): string {
  if (p.hidden) return '';
  const level = sim.levels.get(p.level);
  const room = level?.rooms[sim.grids.get(p.level)!.roomAt(Math.round(p.x), Math.round(p.y))];
  if (!level) return '';
  if (level.kind === 'home') return level.name;
  return room && room.name !== level.name && room.name !== 'Pavement' ? `${level.name} · ${room.name}` : level.name;
}

export function presetLabel(preset: string): string {
  return PRESETS[preset as PresetName]?.label ?? preset;
}

/** The others in a plan, by name: "Lou", "Lou and Cal". */
function others(p: Person, members: readonly string[], sim: Simulation): string {
  const list = members.filter((id) => id !== p.id).map((id) => sim.person(id)?.name).filter((n): n is string => !!n);
  if (list.length === 0) return 'friends';
  return list.length === 1 ? list[0]! : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}
