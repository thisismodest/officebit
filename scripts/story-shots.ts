// The pictures in "What is this?" (src/ui/story.ts, docs/UI.md): the starter town at the moments the story tells, taken
// in headless Chrome from the dev server and saved to public/story/. Retake them when the town's look changes.
//   npm run dev   (in another terminal), then   npm run story-shots -- [yyyy-mm-dd: the first summer Monday to try]
// Chrome is found where macOS keeps it, or wherever CHROME says.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:6060/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
/** The first day to try (a later weekday if it'd rain when a picture's taken outdoors), how many days to try, the hours
 * pictures are taken outdoors, and how big a picture is (CSS px, at 1×: the town's pixels at its zoom). */
const FIRST_DAY = process.argv[2] ?? '2026-06-15';
const DAYS = 60;
const OUTDOORS = [9, 12.5, 18.5, 22.25];
const SHOT = { w: 960, h: 600 };
const OUT = join(import.meta.dirname, '..', 'public', 'story');

const profile = mkdtempSync(join(tmpdir(), 'officebit-shots-'));
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  await shoot();
} finally {
  chrome.kill();
  await wait(500);
  rmSync(profile, { recursive: true, force: true });
}

async function shoot(): Promise<void> {
  const page = await connect();
  const { ev, send } = page;
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: SITE });
  for (let i = 0; i < 120 && !(await ev(`!document.getElementById('loading')`)); i++) await wait(500);
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Look around')?.click()`);
  // A Sandbox town from a dry Monday, held still while each moment's set up and taken.
  await ev(`document.querySelector('#clock').click()`);
  await ev(`document.querySelector('[data-mode=sandbox]').click()`);
  const startOn = async (day: string) => {
    await ev(`(() => { document.querySelector('#clock').click(); const f = document.querySelector('.another-day'); f.querySelector('[name=date]').value = '${day}'; f.requestSubmit(); })()`);
    await wait(1500);
    await ev(`document.querySelector('#play-pause[aria-label="Pause"]')?.click()`);
  };
  // Dry whenever a picture's taken outdoors, by the town's own forecast (its weather for any time, from its seed and date).
  const dry = () => ev(`(() => { const sim = officebit.sim; return ${JSON.stringify(OUTDOORS)}.every((h) => sim.weather.wet(sim.tick + (h - 6) * 600) === 0); })()`);
  const weekday = (day: string) => [1, 2, 3, 4].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  let day = FIRST_DAY;
  let found = false;
  for (let i = 0; i < DAYS && !found; i++, day = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)) {
    if (!weekday(day)) continue;
    await startOn(day);
    found = await dry();
    if (found) break;
  }
  console.log(found ? `a dry day: ${day}` : `no dry day in ${DAYS} from ${FIRST_DAY}: pictures may show rain`);
  // Nothing but the town: no bars, buttons, cards or sidebar.
  await ev(`(() => {
    document.querySelector('#sidebar-toggle[aria-pressed="true"]')?.click();
    const style = document.createElement('style');
    style.textContent = '#stage > :not(canvas) { display: none !important; }';
    document.head.append(style);
  })()`);
  await wait(500);

  /** On to an hour (of the town's first day, or a later one), stepping the town; then on till `ready` is true (a JS expression), or a few hours. */
  const until = (hour: number, ready = 'true', day = 0) =>
    ev(`(() => {
      const sim = officebit.sim;
      const at = (sim.firstDay + ${day}) * 14400 + (${hour} - 6) * 600;
      while (sim.tick < at) sim.step();
      for (let i = 0; i < 1800 && !(${ready}); i++) sim.step();
      return ${ready};
    })()`);
  const zoom = async (to: number) => {
    for (let i = 0; i < 12; i++) {
      const now = Number.parseFloat(await ev(`document.querySelector('#zoom-level').textContent`));
      if (now === to) return;
      await ev(`document.querySelector('${now < to ? '#zoom-in' : '#zoom-out'}').click()`);
      await wait(250);
    }
  };
  const take = async (name: string) => {
    await wait(1500);
    const box = await ev(`(() => { const r = document.querySelector('#stage canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const clip = { x: box.x + (box.w - SHOT.w) / 2, y: box.y + (box.h - SHOT.h) / 2, width: SHOT.w, height: SHOT.h, scale: 1 };
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`story/${name}.png`, (await ev('officebit.sim.weather.wet()')) > 0 ? '(wet: try another day)' : '');
  };
  const look = (level: string, x: number, y: number) => ev(`officebit.look(${JSON.stringify(level)}, ${x}, ${y})`);

  // This is your town: the morning, from above.
  await until(9);
  await zoom(1);
  await look('town', 70, 60);
  await take('town');

  // Nia at her desk.
  await zoom(3);
  await until(10, `(() => { const p = officebit.sim.person('nia'); return p.intent?.kind === 'work' && p.phase === 'doing'; })()`);
  await ev(`officebit.follow('nia')`);
  await take('work');

  // Lunch from the trucks: one parked on its pitch, with a queue.
  const queue = `(() => { const sim = officebit.sim; const i = sim.activeItems().find((i) => i.type.street && sim.foodTrucks.parked(i) && sim.people.filter((p) => p.level === i.level && Math.hypot(p.x - i.def.p[0], p.y - i.def.p[1]) < 4).length >= 3); return i && i.def.p; })()`;
  await until(12.4, `!!${queue}`);
  const truck = await ev(queue);
  if (truck) await look('town', truck[0] + 1, truck[1] + 2);
  await take('lunch');

  // Friends make plans: a picnic on the Green (or failing that, frisbee), a little after work, once they're there.
  await zoom(4);
  await until(17.5);
  console.log('plan:', await ev(`(() => {
    const sim = officebit.sim;
    for (const activity of ['picnic', 'catch'])
      for (const p of sim.people) {
        if (p.npc || p.plan !== undefined) continue;
        const plan = sim.plans.suggest(p, activity, sim.tick + 300);
        if (plan) return activity + ' by ' + p.id + ' with ' + plan.members.join();
      }
    return 'none';
  })()`));
  const gathered = `(() => {
    const sim = officebit.sim;
    const plan = sim.plans.list.find((plan) => plan.activity === 'picnic' || plan.activity === 'catch');
    if (!plan) return null;
    const there = plan.members.filter((id) => { const p = sim.person(id); return p.level === plan.level && Math.hypot(p.x - plan.at[0], p.y - plan.at[1]) < 3 && p.phase === 'doing'; });
    return there.length >= Math.min(3, plan.members.length) && (plan.activity !== 'picnic' || plan.item !== undefined) ? [plan.level, ...plan.at] : null;
  })()`;
  await until(18.5, `!!${gathered}`);
  const game = await ev(gathered);
  if (game) await look(game[0], game[1], game[2]);
  await take('friends');

  // And it carries on: after dark, outside a home where they're still up, the lamps on and the windows lit.
  await zoom(2);
  await until(22.25);
  const home = await ev(`(() => {
    const sim = officebit.sim;
    const town = sim.traffic.level;
    const up = (home) => sim.people.filter((p) => sim.baseOf(p.level) === home && p.intent?.kind !== 'sleep').length;
    const homes = sim.world.levels.filter((l) => l.kind === 'home').sort((a, b) => up(b.id) - up(a.id));
    const door = homes.length && sim.world.portals.find((pt) => pt.b.level === homes[0].id && pt.a.level === town);
    return door && door.a.p;
  })()`);
  if (home) await look('town', home[0], home[1] + 2);
  await take('evening');

  // Big ideas: Mo's side project launched as a startup, and a crew building its office.
  await zoom(3);
  await ev(`(() => {
    const sim = officebit.sim;
    const mo = sim.person('mo');
    mo.traits.ambition = 0.9;
    mo.ideas = 10;
    sim.ventures.hustled(mo);
    sim.ventures.of(mo).progress = 60;
  })()`);
  const building = `officebit.sim.people.some((p) => p.role === 'crew' && p.level === officebit.sim.traffic.level && p.phase === 'doing')`;
  for (let day = 1; day < 6 && !(await until(11, building, day)); day++);
  // The middle of the site they're working on.
  const site = await ev(`(() => { const i = officebit.sim.activeItems().find((i) => i.type.worksite && i.level === officebit.sim.traffic.level); return i && [i.def.p[0] + Math.floor(i.type.size[0] / 2), i.def.p[1] + i.type.size[1]]; })()`);
  if (site) await look('town', site[0], site[1]);
  await take('startup');
}

/** The page, over the DevTools protocol. */
async function connect() {
  let tabs: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 40 && !tabs.some((t) => t.type === 'page'); i++) {
    await wait(250);
    tabs = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json(), () => []);
  }
  const ws = new WebSocket(tabs.find((t) => t.type === 'page')!.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  // biome-ignore lint/suspicious/noExplicitAny: the protocol's replies, and whatever the page hands back, as they come
  type Reply = any;
  const pending = new Map<number, (result: Reply) => void>();
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id) pending.get(d.id)?.(d.result);
  });
  const send = (method: string, params = {}): Promise<Reply> =>
    new Promise((r) => {
      pending.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression: string): Promise<Reply> => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  return { send, ev };
}
