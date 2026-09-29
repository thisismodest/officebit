// Brains (docs/PERSONALITIES.md). Each scores every option open to a person
// right now and picks the best. Where they can choose from depends on the
// time of day: the office during work hours, their home otherwise.
import { TICKS_PER_DAY, TICKS_PER_HOUR, between, hourOf, isWeekend } from './clock.ts';
import { NEEDS, PANTRY_FULL, urgency, type Need } from './needs.ts';
import { asleep, type Intent, type Person, type UseMode } from './person.ts';
import { outsideDoor } from './places.ts';
import { roleOf } from './roles.ts';
import { DISLIKE } from './relationships.ts';
import type { Brain, Item, Simulation } from './sim.ts';
import type { Place } from './world.ts';

const NEED_WEIGHT: Record<Need, number> = { energy: 1, hunger: 1.1, social: 1, fun: 1 };
/** Score lost per tile of walking. */
const DISTANCE_COST = 0.006;
/** Roughly how much social need one conversation restores. */
const CHAT_SOCIAL = 0.5;
/** Hunger a takeaway restores, as the brain sees it. */
const TAKEAWAY_HUNGER = 0.55;
/** How takeaway-prone (low diligence, high chaos) someone must be to order in. */
const TAKEAWAY_THRESHOLD = 0.45;
/** Fun a gaming session is worth, as the brain sees it, and how keen someone must be. */
const GAMING_FUN = 0.35;
const GAMER_THRESHOLD = 0.35;
/** Meals left at home before the food shop comes on the list. */
const SHOP_WHEN = 4;
/** Waiting outside for the shop to open: the longest anyone will (ticks), how much less appealing it is than going in, and how long they won't bother again after giving up. */
const MOST_WAIT = 0.75 * TICKS_PER_HOUR;
const QUEUE_COST = 0.1;
const QUEUE_AGAIN = 3 * TICKS_PER_HOUR;
/** How often staff pick the till over a wander round the room. */
const STAFF_AT_TILL = 0.6;
/** The effort of going out to a venue, before sociability and chaos offset it. */
const OUTING_COST = 0.3;
/** How long an outing lasts before home starts calling. */
const OUTING_TICKS = 1.5 * TICKS_PER_HOUR;
/** School lunch, when pupils leave their desks for the canteen and the playground. */
const SCHOOL_LUNCH: [from: number, to: number] = [12, 13.25];
/** How keen pupils are on the lunch table while it's lunchtime. */
const LUNCH_BELL = 0.5;
/** How much friends pull, and how much a disliked person nearby puts people off a table or the cooler. */
const FRIEND_PULL = 0.35;
/** On a date night: the pull of the diner, and of their date once they're both there. */
const DATE_PULL = 0.9;
const AVOID_COST = 0.6;
/** The pull of a treat (a food truck, free pizza) beyond the food itself. */
const TREAT_BONUS = 0.12;
/** The pull of something to play on for a grown-up, at its most playful (chaotic, and short of fun), and how near (tiles) it has to be to tempt them. */
const PLAYFUL = 1;
const PLAY_NEAR = 12;

export interface Option {
  intent: Intent;
  score: number;
}

export class PersonalityBrain implements Brain {
  decide(p: Person, sim: Simulation): Intent {
    return best(this.options(p, sim)) ?? idle(p);
  }

  /** Everything they could do right now, scored. Forced choices come back alone. */
  options(p: Person, sim: Simulation): Option[] {
    const only = (intent: Intent | null): Option[] => (intent ? [{ intent, score: 1 }] : []);
    const phase = sim.phaseOf(p);
    const area = sim.areaOf(p, phase);
    // A fire drill: out to the muster point, and wait there.
    if (p.muster && sim.tick < p.muster.until) return only({ kind: 'wander', to: p.muster.to });
    if (area.length === 0) return only({ kind: 'leave' });
    if (phase === 'sleep') return only(sleep(p, sim) ?? stroll(p, sim, area));

    const status = p.status;
    if (phase === 'work') {
      if (status.activity === 'meeting') {
        const room = sim.findRoom(status.room) ?? sim.findRoom('meeting');
        if (room) return only({ kind: 'meeting', ...room });
      }
      if ((status.activity === 'focus' || status.activity === 'working') && p.desk >= 0) return only({ kind: 'work' });
    }

    const t = p.traits;
    const here = sim.placeOf(p);
    const noise = () => sim.rng.range(0, 0.08);
    const u = (need: Need) => urgency(p.needs, need);
    const cost = (place: Place) => sim.nav.estimate(here, place) * DISTANCE_COST;
    const benefit = (need: Need, amount: number, weight = weightOf(need, p)) =>
      Math.min(1 - p.needs[need], amount) * weight * (0.2 + 2.5 * u(need));
    const options: Option[] = [];

    const lunchtime = p.role === 'child' && between(hourOf(sim.tick), ...SCHOOL_LUNCH);
    if (phase === 'work' && p.desk >= 0 && status.activity !== 'break' && !lunchtime) {
      options.push({ intent: { kind: 'work' }, score: (0.25 + 0.45 * t.diligence) * (0.4 + 0.6 * p.needs.energy) + noise() });
    }

    // Furniture: what it restores, how far it is, and who's already there.
    // Some people cook, some order in; some reach for the controller.
    const ordersIn = p.role !== 'child' && (1 - t.diligence) * 0.6 + t.chaos * 0.6 > TAKEAWAY_THRESHOLD && sim.tick - p.lastTakeaway > TICKS_PER_DAY;
    const gamer = (t.chaos + (1 - t.diligence)) / 2 > GAMER_THRESHOLD;
    // Going out is a treat: once a day, for an hour or two.
    const isVenue = (level: string) => sim.levels.get(level)?.kind === 'venue';
    const outing = (level: string) => isVenue(level) && level !== p.level;
    const outFor = sim.tick - p.lastOuting;
    const wentOutToday = outFor < TICKS_PER_DAY;
    // A date night overrides the usual once-a-day outing.
    const date = p.date && sim.tick < p.date.until ? sim.person(p.date.with) : undefined;
    const timeToGo = isVenue(p.level) && outFor > OUTING_TICKS && !date;
    for (const item of sim.activeItems()) {
      const { type } = item;
      if (!type.offers || type.desk || !sim.canUse(p, item, phase) || sim.freeSpots(item.index) === 0) continue;
      // Children raid the fridge rather than cook.
      if (p.role === 'child' && (type.usesPantry ?? 0) >= 1) continue;
      if ((outing(item.level) && wentOutToday && !date) || (isVenue(item.level) && timeToGo)) continue;
      let score = 0;
      for (const need of NEEDS) score += benefit(need, type.offers[need] ?? 0);
      const [x, y] = item.def.p;
      const crowd = sim.crowdAt(item.level, x, y, 2.5, p);
      score -= crowd * (1 - t.social) * 0.18;
      // And they'd rather not sit next to someone they don't get on with.
      score -= sim.dislikeNear(p, item.level, x, y, 2.5) * AVOID_COST;
      // Company is a draw only while they actually want some.
      const lonely = 0.2 + (1 - p.needs.social);
      if (type.hangout) score += (crowd * 0.08 + sim.pullAt(item.level, x, y, 2.5, p) * 0.35) * t.social * lonely;
      if (type.treat) score += TREAT_BONUS + t.chaos * 0.1;
      // Swings and hopscotch: a go on them, if they're feeling playful and it's just there.
      if (type.play && p.role !== 'child' && item.level === p.level && Math.hypot(x - p.x, y - p.y) < PLAY_NEAR) {
        score += PLAYFUL * (0.2 + t.chaos) * (1 - p.needs.fun);
      }
      if (date && phase === 'home' && isVenue(item.level) && (type.seat || type.hangout)) score += DATE_PULL;
      if (lunchtime && item.def.t === 'canteenTable') score += LUNCH_BELL;
      if (outing(item.level)) score -= OUTING_COST - t.social * 0.15 - t.chaos * 0.1;
      // At home, the sofa in front of the TV is for takeaways and games.
      let mode: UseMode | undefined;
      if (phase === 'home' && type.seat && inRoomWith(sim, item, 'tv')) {
        if (ordersIn && p.needs.hunger < 0.6) {
          mode = 'takeaway';
          score += benefit('hunger', TAKEAWAY_HUNGER);
        } else if (gamer && inRoomWith(sim, item, 'console')) {
          mode = 'games';
          score += benefit('fun', GAMING_FUN);
        }
      }
      const place = { level: item.level, p: item.def.p };
      options.push({ intent: { kind: 'use', item: item.index, mode }, score: score - cost(place) + noise() });
    }

    // Running low at home: time for the food shop.
    const pantry = p.home ? sim.pantry(p.home) : PANTRY_FULL;
    if (phase === 'home' && pantry < SHOP_WHEN) {
      const need = 0.2 + (1 - pantry / PANTRY_FULL) * 0.9;
      const queues = new Set<string>();
      for (const item of sim.activeItems()) {
        if (!item.type.groceries) continue;
        if (sim.canUse(p, item, phase) && sim.freeSpots(item.index) > 0) {
          options.push({ intent: { kind: 'use', item: item.index }, score: need - cost({ level: item.level, p: item.def.p }) + noise() });
        } else if (worthWaitingFor(p, item, sim)) {
          queues.add(item.level);
        }
      }
      // It should be open by now, but nobody's in yet: wait outside.
      for (const level of queues) {
        const door = outsideDoor(sim, new Set([level]));
        if (door) options.push({ intent: { kind: 'queue', level, wait: MOST_WAIT }, score: need - QUEUE_COST - cost(door) + noise() });
      }
    }

    // Evenings and weekends: the side project.
    if (phase === 'home' && sim.ventures.wantsToHustle(p)) {
      const desk = sim.activeItems().find((item) => item.type.study && sim.floorsOf(p.home!).includes(item.level) && sim.freeSpots(item.index) > 0);
      const keen = (0.25 + 0.6 * t.ambition) * (0.3 + 0.7 * p.needs.energy) * (isWeekend(sim.tick) ? 1.2 : 1);
      if (desk) options.push({ intent: { kind: 'hustle', item: desk.index }, score: keen + noise() });
    }

    // Other people (and pets): company, charisma, and for some, the thrill of interrupting.
    for (const q of sim.people) {
      if (q === p || !sim.present(q) || !area.includes(q.level) || asleep(q)) continue;
      if (q.intent?.kind === 'meeting' || q.intent?.kind === 'retreat') continue;
      // People out at a venue are only company for those already there, and only while the outing lasts.
      if (isVenue(q.level) && (q.level !== p.level || timeToGo)) continue;
      let score = benefit('social', CHAT_SOCIAL, 0.3 + t.social);
      const working = q.intent?.kind === 'work' && q.phase === 'doing';
      // Charismatic people pull hardest when they're free to talk, and on those who want company.
      score += q.traits.charisma * t.social * (working ? 0.15 : 0.8) * (1 - p.needs.social) * 2;
      // Interrupting someone deep in work: rude for most, irresistible fun for the chaotic.
      if (working) score += t.chaos > 0.5 ? t.chaos * (0.1 + q.focus * 0.4) * (0.2 + 2.5 * u('fun')) : -0.25 * (1 - t.chaos);
      if (q.status.activity === 'focus') score -= 0.5 * (1 - t.chaos);
      if (q.species !== 'human') score += benefit('fun', 0.3);
      // Friends seek each other out (but leave them be at their desks), and nobody seeks out someone they can't stand; founders seek out people worth pitching.
      const affinity = q.species === 'human' ? sim.affinity(p, q) : 0;
      if (!working) score += Math.max(0, affinity) * FRIEND_PULL;
      if (affinity <= DISLIKE) score -= 1 - affinity;
      if (q === date && q.level === p.level) score += DATE_PULL;
      if (p.venture && !q.venture && !q.npc && phase === 'work') score += 0.1 + q.traits.ambition * 0.25;
      const crowd = sim.crowdAt(q.level, q.x, q.y, 2, p);
      score += crowd * (t.social * 0.05 - (1 - t.social) * 0.2);
      options.push({ intent: { kind: 'chat', with: q.id }, score: score - cost(sim.placeOf(q)) + noise() });
    }

    const wander = stroll(p, sim, area);
    if (wander) options.push({ intent: wander, score: 0.05 + t.chaos * 0.25 * (0.3 + 2 * u('fun')) + noise() });

    const crowd = sim.crowdAt(p.level, p.x, p.y, 2.5, p);
    if (crowd >= 2 && area.includes(p.level) && !isVenue(p.level)) {
      const quiet = quietest(p, sim);
      if (quiet) options.push({ intent: { kind: 'retreat', to: quiet }, score: (1 - t.social) * 0.2 * crowd + noise() });
    }
    return options;
  }
}

/** Staff: on shift, serve whoever hasn't been served (customers: see roles.ts), tidy up, mind the till. Off shift, a life like anyone's. */
export class StaffBrain implements Brain {
  private readonly offShift = new PersonalityBrain();

  decide(p: Person, sim: Simulation): Intent {
    const venue = p.works;
    if (!venue || sim.phaseOf(p) !== 'work') return this.offShift.decide(p, sim);
    const till = sim.activeItems().find((item) => item.level === venue && item.type.staff && sim.freeSpots(item.index) > 0);
    if (p.level !== venue) return till ? { kind: 'use', item: till.index } : idle(p);

    const waiting = sim.people.filter(
      (q) => q !== p && q.level === venue && q.phase === 'doing' && q.intent?.kind === 'use' && q.lastServed < q.lastOuting,
    );
    const next = waiting.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (next) return { kind: 'chat', with: next.id };
    if (till && sim.rng.next() < STAFF_AT_TILL) return { kind: 'use', item: till.index };
    // A wipe-down round the room.
    const spot = sim.randomWalkable(venue);
    return spot ? { kind: 'wander', to: spot } : idle(p);
  }
}

/** Crews: head to the site, work it while it's open, go home at the end of the day. */
export class CrewBrain implements Brain {
  decide(p: Person, sim: Simulation): Intent {
    const job = sim.construction.jobFor(p);
    if (!job || sim.phaseOf(p) !== 'work') return { kind: 'leave' };
    const site = job.siteItem;
    if (site && sim.freeSpots(site.index) > 0) return { kind: 'use', item: site.index };
    return { kind: 'wander', to: { level: job.level, p: job.door } };
  }
}

/** Pets: nap, pester whoever's home, potter about. */
export class PetBrain implements Brain {
  decide(p: Person, sim: Simulation): Intent {
    if (!p.home) return idle(p);
    if (sim.phaseOf(p) === 'sleep') return sleep(p, sim) ?? idle(p);

    const noise = () => sim.rng.range(0, 0.1);
    const options: Option[] = [];
    const nap = sleep(p, sim, sim.tick + sim.rng.int(300, 900));
    if (nap) options.push({ intent: nap, score: 0.1 + urgency(p.needs, 'energy') * 1.5 + noise() });
    for (const q of sim.people) {
      if (q === p || q.species !== 'human' || q.level !== p.level || !sim.present(q) || asleep(q)) continue;
      options.push({ intent: { kind: 'chat', with: q.id }, score: 0.15 + urgency(p.needs, 'social') + urgency(p.needs, 'fun') + noise() });
    }
    const wander = stroll(p, sim, sim.floorsOf(p.home));
    if (wander) options.push({ intent: wander, score: 0.2 + noise() });
    return best(options) ?? idle(p);
  }
}

/** A shop that's shut only because its staff aren't in yet (in its hours, with someone due in later), if they go out to such places and haven't given up on it lately. */
function worthWaitingFor(p: Person, item: Item, sim: Simulation): boolean {
  return (
    sim.levels.get(item.level)?.kind === 'venue' &&
    !sim.venueOpen(item.level) &&
    sim.withinHours(item) &&
    roleOf(p).goesOut &&
    sim.staffDueSoon(item.level) &&
    sim.tick - p.lastGaveUp > QUEUE_AGAIN
  );
}

function weightOf(need: Need, p: Person): number {
  if (need === 'social') return 0.3 + p.traits.social;
  if (need === 'fun') return 0.3 + p.traits.chaos;
  return NEED_WEIGHT[need];
}

function best(options: Option[]): Intent | null {
  let top: Option | undefined;
  for (const option of options) if (!top || option.score > top.score) top = option;
  return top?.intent ?? null;
}

function idle(p: Person): Intent {
  return { kind: 'wander', to: { level: p.level, p: [Math.round(p.x), Math.round(p.y)] } };
}

/** A random spot to wander to: on their current level if it's allowed, otherwise the first allowed one. Nobody potters about a diner. */
function stroll(p: Person, sim: Simulation, area: string[]): Intent | null {
  const here = area.includes(p.level) && (p.role === 'staff' || sim.levels.get(p.level)?.kind !== 'venue');
  const to = sim.randomWalkable(here ? p.level : area[0]!);
  return to ? { kind: 'wander', to } : null;
}

/** Their bed at home (pets: a basket or the sofa), until `until` or their next wake-up. */
function sleep(p: Person, sim: Simulation, until = sim.nextWake(p)): Intent | null {
  const pet = p.species !== 'human';
  // Any floor of the house: a bedroom upstairs will do.
  const floors = p.home ? sim.floorsOf(p.home) : [];
  const beds = sim.activeItems().filter(
    (item) => floors.includes(item.level) && (pet ? item.type.petBed || item.type.seat : item.type.bed) && sim.freeSpots(item.index) > 0,
  );
  // Their own bed first, then unclaimed ones, then anyone's.
  const rank = (item: Item) => (item.def.owner === p.id ? 0 : item.def.owner ? 2 : 1);
  const bed = beds.sort((a, b) => rank(a) - rank(b))[0];
  return bed ? { kind: 'sleep', item: bed.index, until } : null;
}

/** Is there a `t` (a TV, a console) in the same room as `item`? */
function inRoomWith(sim: Simulation, item: Item, t: string): boolean {
  const room = sim.roomOf(item);
  return sim.activeItems().some((other) => other.level === item.level && other.def.t === t && sim.roomOf(other) === room);
}

function quietest(p: Person, sim: Simulation): Place | null {
  let top: Place | null = null;
  let topCrowd = Infinity;
  for (let i = 0; i < 10; i++) {
    const place = sim.randomWalkable(p.level);
    if (!place) continue;
    const crowd = sim.crowdAt(place.level, place.p[0], place.p[1], 4, p);
    if (crowd < topCrowd) [top, topCrowd] = [place, crowd];
  }
  return top;
}
