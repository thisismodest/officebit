// Runs the starter world headless and prints what everyone did, hour by hour
// (the last two days), plus how any ventures are going.
// Handy for tuning behaviour without a browser:  npm run probe -- [hours]
import { TICKS_PER_HOUR, formatClock } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import type { Person } from '../src/sim/person.ts';
import { STARTER } from '../src/worlds/starter.ts';

const hours = Number(process.argv[2] ?? 24);
const sim = new Simulation(structuredClone(STARTER));

/** One character per hour: where they mostly were. */
const CODES: Record<string, string> = { sleep: 'z', work: 'W', hustle: 'H', use: 'u', chat: 'c', wander: '.', retreat: 'r', meeting: 'M', leave: '-' };
const timeline = new Map<string, string>();
const notable: string[] = [];
sim.onEvent((e) => {
  if (/💡|🚀|🏢|🚧|🏗️|opened|joining|fizzled|pitched/.test(e.text)) notable.push(`  ${formatClock(e.tick)}  ${e.text}`);
});
const tally = new Map<string, Record<string, number>>();

function code(p: Person): string {
  if (p.hidden) return ' ';
  if (p.transit > 0 || p.phase === 'moving') return '>';
  const kind = p.intent?.kind ?? '?';
  return CODES[kind] ?? '?';
}

for (let hour = 0; hour < hours; hour++) {
  const counts = new Map<string, Record<string, number>>();
  for (let t = 0; t < TICKS_PER_HOUR; t++) {
    sim.step();
    for (const p of sim.people) {
      const c = code(p);
      const bucket = counts.get(p.id) ?? {};
      bucket[c] = (bucket[c] ?? 0) + 1;
      counts.set(p.id, bucket);
      const total = tally.get(p.id) ?? {};
      total[c] = (total[c] ?? 0) + 1;
      tally.set(p.id, total);
    }
  }
  for (const [id, bucket] of counts) {
    const top = Object.entries(bucket).sort((a, b) => b[1] - a[1])[0]![0];
    timeline.set(id, (timeline.get(id) ?? '') + top);
  }
}

// The ruler marks 00, 06, 12 and 18 over the last 48 hours shown.
const shown = Math.min(hours, 48);
const ruler = Array.from({ length: shown }, (_, i) => {
  const hour = (6 + hours - shown + i) % 24;
  return hour % 6 === 0 ? String(hour / 6) : '·';
}).join('');
console.log(`${'hour (0/6/12/18 = 0-3)'.padEnd(18)} ${ruler}   (z sleep · W work · H side project · u using · c chat · M meeting · > moving)`);
for (const p of sim.people) {
  const label = `${p.name}${p.npc ? ` (${p.species})` : ''}`.padEnd(18);
  const t = tally.get(p.id)!;
  const pct = (c: string) => `${c}${Math.round(((t[c] ?? 0) / (hours * TICKS_PER_HOUR)) * 100)}%`;
  console.log(`${label} ${timeline.get(p.id)!.slice(-48)}   ${['W', 'H', 'u', 'c', '>'].map(pct).join(' ')}  int ${p.stats.interruptions}/${p.stats.interrupted}`);
}

console.log('\nVentures:');
for (const v of sim.ventures.list) {
  const team = v.members.map((id) => sim.person(id)!.name).join(', ');
  console.log(`  ${v.name.padEnd(22)} ${v.stage.padEnd(9)} ${v.progress.toFixed(1).padStart(6)}h  ${team}`);
}
console.log(notable.join('\n'));
console.log(`\n${formatClock(sim.tick)} — ${sim.events.length} recent events:`);
for (const e of sim.events.slice(-15)) console.log(`  ${formatClock(e.tick)}  ${e.text}`);
