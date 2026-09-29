// What you hear of the place you're looking at (docs/AUDIO.md#sounds): the
// sound effects, tied to what's happening there. Things being used (a till, the
// diner counter, the coffee machine), people at their desks typing in bursts,
// the murmur of conversations, the odd phone or shop announcement, a fire alarm
// during a drill, and food trucks tooting as they pull up. Quiet while paused
// or jumping ahead.
import type { Sounds, SoundName } from '../audio/sounds.ts';
import { hashString } from '../render/palette.ts';
import { atDesk, type Person } from '../sim/person.ts';
import type { Item, Simulation } from '../sim/sim.ts';
import { vehicleAt } from '../sim/food-trucks.ts';
import type { Renderer } from '../render/renderer.ts';
import { TILE } from '../render/pixels.ts';

/** What using a piece of furniture sounds like, and how long after starting (s): paying takes a moment. */
const ON_USE: Record<string, [SoundName, [number, number]]> = {
  shelf: ['till', [1.5, 3]],
  produce: ['till', [1.5, 3]],
  dinerCounter: ['bell', [1, 3]],
  booth: ['bell', [2, 4]],
  coffee: ['coffee', [0, 0.3]],
  cooler: ['cooler', [0, 0.2]],
  arcade: ['arcade', [0, 0.1]],
};
/** Typing comes in bursts: this many keys, this far apart (s), then a pause of this long (s). */
const BURST_KEYS: [number, number] = [3, 7];
const KEY_GAP: [number, number] = [0.08, 0.16];
const TYPING_PAUSE: [number, number] = [4, 12];
/** At most this many people typing at once, however full the office. */
const MOST_TYPISTS = 4;
/** A conversation's next phrase comes after a pause of this long (s); a phrase is this many syllables. */
const TALK_PAUSE: [number, number] = [0.8, 2.6];
const SYLLABLES: [number, number] = [3, 9];
/** Voices: a speaking pitch (Hz) somewhere in this range, fixed per person. */
const VOICE_PITCH: [number, number] = [105, 230];
/** The background hum of a busy room: a distant phrase every so often (s), from anyone there, quieter than a conversation nearby. */
const MURMUR_EVERY: [number, number] = [1.5, 4];
const MURMUR_VOLUME = 0.45;
/** Rooms need this many people in for a murmur. */
const MURMUR_CROWD = 3;
/** The alarm sounds every this-many seconds while the drill's on. */
const ALARM_EVERY = 1;
/** Now-and-then sounds: seconds between them, at random. */
const PHONE_EVERY: [number, number] = [45, 120];
const TANNOY_EVERY: [number, number] = [40, 90];
/** The same sound again within this long (ms) is dropped, so a busy moment doesn't pile up. */
const SPACING_MS = 150;

export interface SoundscapeHost {
  sounds(): Sounds | null;
  sim(): Simulation;
  renderer: Renderer;
  /** Nothing's playing out on screen (paused, or jumping ahead). */
  quiet(): boolean;
}

export class Soundscape {
  private readonly host: SoundscapeHost;
  private unsubscribe = () => {};
  private readonly last = new Map<SoundName, number>();
  private readonly parked = new Map<number, boolean>();
  private phoneIn = randomIn(PHONE_EVERY);
  private tannoyIn = randomIn(TANNOY_EVERY);
  private alarmIn = 0;
  private murmurIn = randomIn(MURMUR_EVERY);
  /** When each person at a desk types their next burst, and when each talker speaks again (s from now). */
  private readonly typing = new Map<string, number>();
  private readonly talking = new Map<string, number>();

  constructor(host: SoundscapeHost) {
    this.host = host;
  }

  /** Listen to a (new) town. */
  setSim(sim: Simulation): void {
    this.unsubscribe();
    this.parked.clear();
    this.unsubscribe = sim.onUse((_p, item) => this.used(item));
  }

  /** Every frame, with the real ms since the last. */
  update(elapsed: number): void {
    const { sim, renderer } = this.host;
    if (!this.host.sounds() || this.host.quiet()) return;
    const level = sim().levels.get(renderer.level);
    if (!level) return;
    const seconds = elapsed / 1000;

    const here = sim().people.filter((p) => p.level === level.id && sim().present(p));
    this.talk(here, seconds);
    if (level.kind !== 'outside' && level.kind !== 'home') this.murmur(here, seconds);
    this.alarm(level.id, level.kind === 'outside', seconds);

    if (level.kind === 'building') {
      const working = here.filter((p) => atDesk(p) && p.intent?.kind === 'work' && p.phase === 'doing');
      this.type(working, seconds);
      this.phoneIn -= seconds;
      if (this.phoneIn <= 0 && working.length > 0) {
        this.phoneIn = randomIn(PHONE_EVERY);
        const desk = working[Math.floor(Math.random() * working.length)]!;
        this.play('phone', this.panAt(desk.x));
      }
    }
    if (level.id === 'shop') {
      this.tannoyIn -= seconds;
      if (this.tannoyIn <= 0) {
        this.tannoyIn = randomIn(TANNOY_EVERY);
        this.play('tannoy');
      }
    }
    if (level.kind === 'outside') this.trucks(level.id);
  }

  /** People at their desks type in bursts, a few keys at a time, then stop to think. */
  private type(working: Person[], seconds: number): void {
    const typists = working.slice(0, MOST_TYPISTS);
    for (const p of typists) {
      const due = (this.typing.get(p.id) ?? randomIn(TYPING_PAUSE) * Math.random()) - seconds;
      if (due > 0) {
        this.typing.set(p.id, due);
        continue;
      }
      let at = 0;
      for (let n = Math.round(randomIn(BURST_KEYS)); n > 0; n--) {
        this.play('key', this.panAt(p.x), at, true);
        at += randomIn(KEY_GAP);
      }
      this.typing.set(p.id, at + randomIn(TYPING_PAUSE));
    }
    for (const id of this.typing.keys()) if (!typists.some((p) => p.id === id)) this.typing.delete(id);
  }

  /** Conversations as a murmur: each pair takes turns, a phrase at a time, in their own voices. */
  private talk(here: Person[], seconds: number): void {
    const sounds = this.host.sounds();
    const talkers = here.filter((p) => p.species === 'human' && p.talkingTo && p.phase === 'doing');
    for (const p of talkers) {
      const due = (this.talking.get(p.id) ?? randomIn(TALK_PAUSE)) - seconds;
      if (due > 0) {
        this.talking.set(p.id, due);
        continue;
      }
      const syllables = Math.round(randomIn(SYLLABLES));
      sounds?.speak(voiceOf(p), syllables, this.panAt(p.x));
      // Their turn lasts about as long as they spoke; the other person answers after it.
      const spoke = syllables * 0.18;
      this.talking.set(p.id, spoke * 2 + randomIn(TALK_PAUSE));
      const partner = p.talkingTo ? this.talking.get(p.talkingTo) : undefined;
      if (p.talkingTo && (partner === undefined || partner < spoke)) this.talking.set(p.talkingTo, spoke + 0.3);
    }
    for (const id of this.talking.keys()) if (!talkers.some((p) => p.id === id)) this.talking.delete(id);
  }

  /** A busy room hums: now and then a distant phrase from someone there, as if across the room. */
  private murmur(here: Person[], seconds: number): void {
    this.murmurIn -= seconds;
    if (this.murmurIn > 0) return;
    this.murmurIn = randomIn(MURMUR_EVERY);
    const people = here.filter((p) => p.species === 'human' && !p.hidden);
    if (people.length < MURMUR_CROWD) return;
    const p = people[Math.floor(Math.random() * people.length)]!;
    this.host.sounds()?.speak(voiceOf(p), Math.round(randomIn(SYLLABLES)), this.panAt(p.x) * 0.5, 0, MURMUR_VOLUME);
  }

  /** During a fire drill, the alarm: loud inside the building, muffled from the street. */
  private alarm(level: string, outside: boolean, seconds: number): void {
    const interactions = this.host.sim().interactions;
    const inside = interactions.drillAt(level);
    if (!inside && !(outside && interactions.drilling)) return;
    this.alarmIn -= seconds;
    if (this.alarmIn > 0) return;
    this.alarmIn = ALARM_EVERY;
    this.play(inside ? 'alarm' : 'alarmMuffled', 0, 0, true);
  }

  /** Food trucks toot as they pull up to their pitch. */
  private trucks(level: string): void {
    const { sim } = this.host;
    for (const item of sim().activeItems()) {
      if (!item.type.street || item.level !== level) continue;
      const pose = vehicleAt(sim(), item);
      const parked = !!pose && !pose.moving;
      if (parked && this.parked.get(item.index) === false) this.play('horn', this.panAt(pose.x));
      this.parked.set(item.index, parked);
    }
  }

  private used(item: Item): void {
    if (this.host.quiet() || item.level !== this.host.renderer.level) return;
    const sound = ON_USE[item.def.t];
    if (!sound) return;
    const [name, [from, to]] = sound;
    this.play(name, this.panAt(item.def.p[0]), from + Math.random() * (to - from));
  }

  private play(name: SoundName, pan = 0, delay = 0, many = false): void {
    const sounds = this.host.sounds();
    if (!sounds) return;
    const now = performance.now() + delay * 1000;
    if (!many && now - (this.last.get(name) ?? -Infinity) < SPACING_MS) return;
    this.last.set(name, now);
    sounds.play(name, pan, delay);
  }

  /** Stereo position for a tile column: where it is across the view, softened. */
  private panAt(tileX: number): number {
    const { camera } = this.host.renderer;
    const x = (tileX * TILE - camera.x) / Math.max(1, camera.width);
    return (x * 2 - 1) * 0.6;
  }
}

function randomIn([from, to]: [number, number]): number {
  return from + Math.random() * (to - from);
}

/** Someone's speaking voice: a pitch that's always theirs. */
function voiceOf(p: Person): number {
  const [low, high] = VOICE_PITCH;
  return low + hashString(p.id) * (high - low);
}
