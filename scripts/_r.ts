import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';
const sim = new Simulation(structuredClone(STARTER));
const plan = sim.buses.plan()!;
console.log(plan.stops.map((s) => s.def.label).join(' → '), '| in', plan.in.edge, plan.in.heading, 'out', plan.out.edge);
let firstCar = ''; const pts: string[] = []; let n = 0; let reversals = 0; const hist: string[] = [];
while (sim.tick < 14400) {
  sim.step();
  const s = sim.buses.services.find((x) => !firstCar || x.car.id === firstCar);
  if (!s) { if (firstCar) break; continue; }
  firstCar ||= s.car.id;
  if (hist.at(-1) !== s.car.facing) { hist.push(s.car.facing); const k = hist.length; if (k >= 3 && ((hist[k-1] === 'left' && hist[k-3] === 'right') || (hist[k-1] === 'right' && hist[k-3] === 'left') || (hist[k-1] === 'up' && hist[k-3] === 'down') || (hist[k-1] === 'down' && hist[k-3] === 'up'))) { reversals++; pts.push(`[turned back at ${Math.round(s.car.x)},${Math.round(s.car.y)}]`); } }
  if (n++ % 30 === 0) pts.push(`${Math.round(s.car.x)},${Math.round(s.car.y)}${s.car.facing[0]}`);
}
console.log(pts.join(' ')); console.log('turned back', reversals);
