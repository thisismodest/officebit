import { formatClock } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';
const sim = new Simulation(structuredClone(STARTER));
let t0 = performance.now();
const plan = sim.buses.plan();
console.log('route planned in', Math.round(performance.now() - t0), 'ms:', plan?.stops.map((s) => s.def.label).join(' → '), '| in', plan?.in.edge, 'out', plan?.out.edge);
const news: string[] = [];
sim.onEvent((e) => { if (/bus/.test(e.text)) news.push(`${formatClock(e.tick)} ${e.text}`); });
let services = 0; const seen = new Set<string>(); let waits = 0, gaveUp = 0; const waiting = new Map<string, number>();
const trips = new Map<string, number>();
t0 = performance.now();
while (sim.tick < 14400) {
  sim.step();
  for (const s of sim.buses.services) if (!seen.has(s.car.id)) { seen.add(s.car.id); services++; trips.set(s.car.id, sim.tick); }
  for (const p of sim.people) {
    const w = p.intent?.kind === 'bus' && p.phase === 'doing';
    if (w && !waiting.has(p.id)) { waiting.set(p.id, sim.tick); waits++; }
    if (!w && waiting.has(p.id)) { if (!p.riding && p.intent?.kind !== 'bus') { if (sim.tick - waiting.get(p.id)! >= sim.buses.patience - 2) gaveUp++; } waiting.delete(p.id); }
  }
}
console.log('a day in', Math.round(performance.now() - t0), 'ms; services', services, 'waits', waits, 'gave up', gaveUp);
console.log(news.slice(0, 20).join('\n')); console.log('...', news.length, 'bus lines');
