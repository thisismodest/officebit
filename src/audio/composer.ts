// The ambient music's composer (docs/AUDIO.md): no sound, just notes. It writes
// one bar at a time over a four-chord loop in D major pentatonic, so nothing
// clashes, in one of two styles: a bright, bouncing day (with a soft kick and
// shaker) and a calm night. The melody walks in small steps, lands on chord
// tones on the strong beats, rests, sometimes echoes an earlier bar, and settles
// at the end of every four-bar phrase. Sections alternate sparse and fuller, so
// the loop never sounds like one. The style only changes at the start of a
// phrase. Pure and seeded, so it's testable.
import { Rng } from '../sim/rng.ts';

export const BEATS_PER_BAR = 4;
/** Eighth notes in a bar: the melody's grid. */
const STEPS = 8;
/** Bars per phrase, and phrases per section. */
export const PHRASE_BARS = 4;
const SECTION_PHRASES = 2;

/** MIDI note numbers. 62 is D4. */
const D = 62;
/** D major pentatonic: D E F# A B, as semitones above D. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Where the melody may go: B3 to D6. */
const LOW = D - 3;
const HIGH = D + 24;

interface Chord {
  root: number;
  tones: number[];
}

/** How the music goes at a time of day. Semitones are above D. */
interface Style {
  name: 'day' | 'night';
  tempo: number;
  /** How many bars each chord lasts. */
  barsPerChord: number;
  chords: Chord[];
  /** Rhythms for a bar of melody, as eighth-note steps. */
  rhythms: number[][];
  /** Each kind of section's chance of a bar's rest, and how strongly it favours busier rhythms. */
  sections: { rest: number; busy: number }[];
  /** Steps along the scale the melody may take from one note to the next. */
  moves: number[];
  /** The bass: held under the chord, or bouncing root and fifth. */
  bass: 'hold' | 'bounce';
  /** A soft kick and shaker. */
  drums: boolean;
  chime: number;
}

const DAY: Style = {
  name: 'day',
  tempo: 96,
  barsPerChord: 1,
  // D6, G6/9, Bm7, Asus: bright, and moving on every bar.
  chords: [
    { root: 0, tones: [0, 4, 7, 9] },
    { root: -7, tones: [-7, -3, 2, 4] },
    { root: -3, tones: [-3, 0, 4, 7] },
    { root: -5, tones: [-5, -3, 2, 4] },
  ],
  rhythms: [[0, 2, 3, 4, 6], [0, 2, 4, 6], [0, 1, 2, 4, 6], [0, 3, 4, 6, 7], [0, 2, 3, 5, 6], [0, 3, 6], [1, 2, 4, 6]],
  sections: [
    { rest: 0.1, busy: 0.6 },
    { rest: 0.04, busy: 0.9 },
  ],
  moves: [-2, -1, -1, 1, 1, 1, 2, 2, 3, -3, 0],
  bass: 'bounce',
  drums: true,
  chime: 0.15,
};

const NIGHT: Style = {
  name: 'night',
  tempo: 72,
  barsPerChord: 2,
  // Dmaj7, Bm7, Gmaj7, Asus2: soft, unresolved, taking its time.
  chords: [
    { root: 0, tones: [0, 4, 7, 11] },
    { root: -3, tones: [-3, 0, 4, 7] },
    { root: -7, tones: [-7, -3, 0, 4] },
    { root: -5, tones: [-5, -3, 2, 4] },
  ],
  rhythms: [[0, 3, 6], [0, 4], [2, 4, 6], [0, 2, 3, 6], [0, 6], [1, 4, 7], [0, 2, 4, 5]],
  sections: [
    { rest: 0.35, busy: 0.3 },
    { rest: 0.15, busy: 0.6 },
  ],
  moves: [-2, -1, -1, 1, 1, 2, 0],
  bass: 'hold',
  drums: false,
  chime: 0.22,
};

export interface Note {
  /** MIDI note number. */
  pitch: number;
  /** Start, in beats from the start of the bar. */
  at: number;
  /** Length in beats. */
  length: number;
  /** 0–1. */
  velocity: number;
}

export interface Bar {
  index: number;
  style: Style['name'];
  /** Beats per minute. */
  tempo: number;
  /** A new chord this bar (held for `bars` bars), or null while the last one carries on. */
  chord: { root: number; pad: number[]; bars: number } | null;
  /** The chord sounding this bar, whether it started here or not. */
  harmony: number[];
  melody: Note[];
  bass: Note[];
  /** Beats for the kick and the shaker, when there are drums. */
  drums: { kick: number[]; shaker: number[] } | null;
  /** A high chime this bar, or none. */
  chime: Note | null;
}

export interface Mood {
  /** After dark: the calm night style. */
  night: boolean;
}

export class Composer {
  private readonly rng: Rng;
  private bar = 0;
  private pitch = D + 12;
  private style: Style = DAY;
  /** Bars since the style last changed, which is where its chords and sections count from. */
  private since = 0;
  /** Rhythms of recent bars, so a phrase can echo an earlier one. */
  private readonly memory: number[][] = [];

  constructor(seed = Date.now()) {
    this.rng = new Rng(seed);
  }

  /** The next bar of music. The style follows the mood, but only changes at the start of a phrase. */
  next(mood: Mood = { night: false }): Bar {
    const index = this.bar++;
    if (index % PHRASE_BARS === 0) {
      const wanted = mood.night ? NIGHT : DAY;
      if (wanted !== this.style || index === 0) {
        this.style = wanted;
        this.since = 0;
      }
    }
    const style = this.style;
    const local = this.since++;
    const chord = style.chords[Math.floor(local / style.barsPerChord) % style.chords.length]!;
    const section = style.sections[Math.floor(local / (PHRASE_BARS * SECTION_PHRASES)) % style.sections.length]!;
    const inPhrase = index % PHRASE_BARS;
    const ending = inPhrase === PHRASE_BARS - 1;
    const startsChord = local % style.barsPerChord === 0;
    const root = D - 24 + chord.root;

    return {
      index,
      style: style.name,
      tempo: style.tempo,
      chord: startsChord ? { root, pad: chord.tones.map((t) => D - 12 + t), bars: style.barsPerChord } : null,
      harmony: chord.tones.map((t) => D - 12 + t),
      melody: this.melodyFor(style, chord, section, inPhrase, ending),
      bass: style.bass === 'bounce' ? bounce(root) : [],
      drums: style.drums ? { kick: [0, 2], shaker: [0.5, 1.5, 2.5, 3.5] } : null,
      chime: !ending && this.rng.next() < style.chime ? this.chimeFor(chord) : null,
    };
  }

  private melodyFor(style: Style, chord: Chord, section: Style['sections'][number], inPhrase: number, ending: boolean): Note[] {
    const rng = this.rng;
    // The end of a phrase: a long, settled note on the chord (half a bar by day, most of it at night).
    if (ending) {
      this.pitch = this.nearest(this.pitch, chordTones(chord));
      this.memory.push([0]);
      return [{ pitch: this.pitch, at: 0, length: style.name === 'day' ? 2 : BEATS_PER_BAR - 0.5, velocity: 0.5 }];
    }
    const restChance = section.rest + (inPhrase === 0 ? -0.1 : 0);
    let rhythm: number[];
    if (rng.next() < restChance) rhythm = [];
    else if (this.memory.length >= PHRASE_BARS && rng.next() < 0.35) rhythm = this.memory[this.memory.length - PHRASE_BARS]!;
    else rhythm = this.pickRhythm(style, section.busy);
    this.memory.push(rhythm);
    if (this.memory.length > PHRASE_BARS * 2) this.memory.shift();

    return rhythm.map((step, i) => {
      const strong = step % 4 === 0;
      // Steps along the scale, landing on the chord on strong beats.
      this.pitch = this.stepAlong(this.pitch, rng.pick(style.moves));
      if (strong) this.pitch = this.nearest(this.pitch, chordTones(chord));
      const next = rhythm[i + 1] ?? STEPS;
      // By day, notes are short and bouncy; at night they ring on.
      const length = style.name === 'day' ? Math.min(1, (next - step) / 2) : Math.min(2, (next - step) / 2 + 0.25);
      return {
        pitch: this.pitch,
        at: step / 2 + rng.range(-0.02, 0.02),
        length,
        velocity: (strong ? 0.55 : 0.4) + rng.range(-0.05, 0.05),
      };
    });
  }

  private pickRhythm(style: Style, busy: number): number[] {
    // Busier sections favour the rhythms with more notes in them.
    const weighted = style.rhythms.flatMap((r) => Array.from({ length: 1 + Math.round(busy * r.length) }, () => r));
    return this.rng.pick(weighted);
  }

  private chimeFor(chord: Chord): Note {
    const tone = this.rng.pick(chord.tones.filter((t) => PENTATONIC.includes(pitchClass(t))));
    return { pitch: D + 24 + tone, at: this.rng.pick([1, 1.5, 2.5, 3]), length: 3, velocity: 0.25 };
  }

  /** Move `steps` notes along the pentatonic scale, staying in range. */
  private stepAlong(pitch: number, steps: number): number {
    const scale = scaleNotes();
    let i = scale.indexOf(this.nearest(pitch, scale));
    i = Math.max(0, Math.min(scale.length - 1, i + steps));
    // Drift back towards the middle rather than hug the edges.
    if (i === 0 || i === scale.length - 1) i += i === 0 ? 2 : -2;
    return scale[i]!;
  }

  private nearest(pitch: number, options: number[]): number {
    return options.reduce((best, p) => (Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best));
  }
}

/** The day's bass: root on the beat, fifth on beat three, and a little pickup back to the root. */
function bounce(root: number): Note[] {
  return [
    { pitch: root, at: 0, length: 0.9, velocity: 0.8 },
    { pitch: root + 7, at: 2, length: 0.9, velocity: 0.65 },
    { pitch: root + 12, at: 3.5, length: 0.4, velocity: 0.45 },
  ];
}

/** Every note of D major pentatonic in the melody's range. */
export function scaleNotes(): number[] {
  const notes: number[] = [];
  for (let p = LOW; p <= HIGH; p++) if (PENTATONIC.includes(pitchClass(p - D))) notes.push(p);
  return notes;
}

/** A chord's tones that are also in the scale, across the melody's range. */
function chordTones(chord: Chord): number[] {
  const classes = new Set(chord.tones.map(pitchClass));
  return scaleNotes().filter((p) => classes.has(pitchClass(p - D)));
}

/** Where a note (semitones above D) falls in the octave, 0–11. */
function pitchClass(semitones: number): number {
  return ((semitones % 12) + 12) % 12;
}

/** A MIDI note's frequency in Hz. */
export function frequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}
