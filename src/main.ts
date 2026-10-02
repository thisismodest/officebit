// Entry point: wires the sim, renderer, sidebar (overview, directory, news),
// profile and controls together, and runs the loop (the timekeeper decides how
// many steps each frame; rendering interpolates between them).
import { exposeLocalFeed } from './feeds/local.ts';
import { Renderer } from './render/renderer.ts';
import { TICKS_PER_DAY, formatClock, formatTime, weekdayOf } from './sim/clock.ts';
import { TILE } from './render/pixels.ts';
import { exitAt, insideDoor, interiorOf, type Exit } from './sim/places.ts';
import { Simulation, type Item } from './sim/sim.ts';
import { restore, snapshot } from './sim/snapshot.ts';
import { asleep, type Intent } from './sim/person.ts';
import type { Tile, WorldDef } from './sim/world.ts';
import { attachControls } from './ui/controls.ts';
import { Directory } from './ui/directory.ts';
import { TeamForm } from './ui/team-form.ts';
import { Tour } from './ui/tour.ts';
import { News } from './ui/news.ts';
import { Overview } from './ui/overview.ts';
import { TOWN_NAME_MOST, placeName, townName } from './ui/describe.ts';
import { PlaceCard } from './ui/place-card.ts';
import { Profile } from './ui/profile.ts';
import { Editor } from './ui/editor.ts';
import { icon } from './ui/icons.ts';
import { popover } from './ui/popover.ts';
import { ShareMenu } from './ui/share-menu.ts';
import { upgrade } from './worlds/upgrades.ts';
import { Welcome } from './ui/welcome.ts';
import { attachTabs } from './ui/tabs.ts';
import { checkWorld, fromHash, loadLocal, saveLocal } from './ui/world-io.ts';
import { fits, loadSnapshot, saveSnapshot, saved } from './ui/snapshots.ts';
import { validate } from './sim/validate.ts';
import { AudioMenu } from './ui/audio-menu.ts';
import { Soundscape } from './ui/soundscape.ts';
import { ViewHistory } from './ui/history.ts';
import { TimeJump } from './ui/time-jump.ts';
import { TICK_MS, Timekeeper, liveTick, type Mode } from './ui/timekeeper.ts';
import { narrow } from './ui/html.ts';
import { attachFullscreen, registerApp } from './ui/fullscreen.ts';
import { PersonEditor } from './ui/person-editor.ts';
import { STARTER } from './worlds/starter.ts';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const FIRST_LEVEL = 'town';
/** Phone-sized screens get the compact layout (style.css has the same breakpoint). */
const MODE_KEY = 'officebit:mode';
/** When live mode started in this browser (ms): the town has run since that morning. */
const SINCE_KEY = 'officebit:live-since';
/** This browser's story: the seed its town runs on, picked on the first visit, so everyone's town has a story of its own. */
const SEED_KEY = 'officebit:seed';

const time = new Timekeeper(localStorage.getItem(MODE_KEY) === 'sandbox' ? 'sandbox' : 'live');
time.since = Number(localStorage.getItem(SINCE_KEY)) || null;
// The design the town is built from: a shared link first, then this browser's save, then the starter town.
const loaded = await loadDesign();
let design: WorldDef = loaded.world;
// A shared link is someone else's story: it keeps their seed. Otherwise the town runs on this browser's own.
if (!loaded.fromLink) design.seed = storySeed();
// A town made before this release: what's new is on its way, with a crew to put it up (docs/UPGRADES.md).
const today = new Date();
const now = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate(), hour: today.getHours() };
if (upgrade(design, now) > 0 && !loaded.fromLink) saveLocal(design);
// The Live town as it was last time, so it only catches up from then (docs/TIME.md#snapshots).
let lastSaved = time.mode === 'live' ? await loadSnapshot(design) : null;
let sim = newSim();

async function loadDesign(): Promise<{ world: WorldDef; note: string; fromLink: boolean }> {
  for (const [source, read] of [['link', () => fromHash(location.hash)], ['save', async () => loadLocal()]] as const) {
    try {
      const value = await read();
      if (!value) continue;
      const { world, problems } = checkWorld(value);
      if (world) return { world, note: source === 'link' ? 'Opened the town from the link.' : 'Opened your saved town.', fromLink: source === 'link' };
      return { world: structuredClone(STARTER), note: `Couldn't open the ${source === 'link' ? 'linked' : 'saved'} town (${problems[0]}), so here's the starter town.`, fromLink: false };
    } catch {
      return { world: structuredClone(STARTER), note: `The ${source === 'link' ? 'link' : 'saved town'} was damaged, so here's the starter town.`, fromLink: false };
    }
  }
  return { world: structuredClone(STARTER), note: '', fromLink: false };
}

/** This browser's story seed, picked at random the first time (the sim's own randomness all flows from it). */
function storySeed(fresh = false): number {
  const stored = Number(localStorage.getItem(SEED_KEY));
  if (stored && !fresh) return stored;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]! || 1;
  localStorage.setItem(SEED_KEY, String(seed));
  return seed;
}

/**
 * A town from the design, set up for the current time mode. Live mode's first start is remembered, so the story
 * carries on between visits; it carries on from its last snapshot if there's one of this town.
 */
function newSim(): Simulation {
  if (time.mode === 'live' && fits(lastSaved, design, time.since)) {
    const next = restore(structuredClone(lastSaved.snap));
    time.resume(next);
    return next;
  }
  const next = new Simulation(structuredClone(design));
  if (time.mode === 'live' && !time.since) {
    time.since = Date.now();
    localStorage.setItem(SINCE_KEY, String(time.since));
  }
  time.start(next);
  return next;
}

/** Save the Live town as it is now (when it's caught up), for next time. */
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;
function saveTown(): void {
  if (time.mode !== 'live' || time.catchingUp || !time.since) return;
  lastSaved = saved(snapshot(sim), design, time.since);
  void saveSnapshot(lastSaved, design);
}
setInterval(saveTown, SNAPSHOT_EVERY_MS);

const placeLabel = $('#place');
const stage = $('#stage');
const renderer = new Renderer(stage, sim, FIRST_LEVEL);
const card = new PlaceCard(stage, visit);
const profile = new Profile(stage, renderer, {
  follow,
  // Closing the profile keeps following them: the chip over the map stops that; tap them for the profile again.
  close: () => {
    profile.close();
    updateCameraUi();
  },
  pick: (id) => select(id),
  control: steer,
}, new PersonEditor({ sim: () => sim, design: () => design, saved: () => saveSoon() }));
const directory = new Directory($('#directory'), renderer, (id) => select(renderer.selected === id ? null : id));
new TeamForm($('#directory'), { sim: () => sim, design: () => design, saved: saveSoon, pick: (id) => select(id) });
const overview = new Overview($('#overview'), visit, (company, event) => {
  const problem = event === 'pizza' ? sim.interactions.pizza(company) : sim.interactions.drill(company);
  if (problem) sim.log(problem);
});
const news = new News($('#news'));
// Narrow screens: the sidebar is a sheet along the bottom.
const sheet = $('aside.mdst-tabs');
attachTabs(sheet);

// Editing the map: the pencil opens a floating toolbar over the stage; the town carries on meanwhile.
const editButton = $('#edit');
const editor = new Editor(stage, { sim: () => sim, design: () => design, renderer, tileAt, saved: saveSoon }, () => setEditing(false));

/**
 * Edits save themselves, a moment after the last one (so a drag or a run of
 * quick edits saves once), and straight away on leaving the editor or the page.
 * A town opened from a link then lives here: the link comes off the address,
 * or reloading would open the link again over your edits.
 */
const SAVE_AFTER_MS = 300;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_AFTER_MS);
}
function saveNow(): void {
  if (saveTimer === undefined) return;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  saveLocal(design);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
addEventListener('pagehide', () => {
  saveNow();
  saveTown();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  saveNow();
  saveTown();
});
editButton.addEventListener('click', () => setEditing(!editor.active));
function setEditing(on: boolean): void {
  if (on) {
    steer(null);
    card.close();
    // Nobody's selected while you edit; on a phone, the sheet folds away to leave the map.
    select(null);
    sheet.removeAttribute('data-open');
    editor.open();
  } else {
    editor.close();
    saveNow();
  }
  editButton.setAttribute('aria-pressed', String(on));
  // The editor's toolbar takes the tool rail's place.
  stage.toggleAttribute('data-editing', on);
}
// Using any other part of the interface (the sidebar, the menu bar) puts the editor away; the map and the editor itself don't.
document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (editor.active && target !== renderer.canvas && !editor.contains(target) && !editButton.contains(target)) setEditing(false);
});
const tour = new Tour(stage, {
  sim: () => sim,
  renderer,
  /** Someone of the team who's about (on screen if possible), followed so they stay in view. */
  meet() {
    const about = sim.people.filter((p) => !p.npc && sim.present(p) && !p.hidden && !p.riding && !asleep(p));
    const p = about.find((q) => q.level === renderer.level) ?? about[0];
    if (!p) return null;
    setEditing(false);
    select(null);
    follow(p.id);
    return p.id;
  },
  steering: () => !!steering,
  editing: () => editor.active,
  pause(on) {
    // Paused for the tour, and back to the speed it was going at after.
    if (on && speedBeforeTour === null) {
      speedBeforeTour = time.speed;
      setSpeed(0);
    } else if (!on && speedBeforeTour !== null) {
      setSpeed(speedBeforeTour);
      speedBeforeTour = null;
    }
  },
});
/** The speed the town was going at before the tour paused it (null: the tour hasn't). */
let speedBeforeTour: number | null = null;
new Welcome(stage, $('#help'), () => tour.start());
new ShareMenu($('#share'), {
  design: () => design,
  starter: () => ({ ...structuredClone(STARTER), seed: storySeed() }),
  apply: applyDesign,
  rename(name) {
    // A blank name is no name: the town's called what the starter town is.
    design.name = sim.world.name = name.trim().slice(0, TOWN_NAME_MOST) || STARTER.name;
    saveSoon();
    showPlace();
    overview.update(sim);
  },
});

// Music and sounds (docs/AUDIO.md): opt-in, from the speaker in the menu bar.
const audio = new AudioMenu($('#music'));
const soundscape = new Soundscape({
  sounds: () => audio.sounds(),
  sim: () => sim,
  renderer,
  quiet: () => time.paused || !!time.travelling || time.catchingUp,
});
soundscape.setSim(sim);

// Live or Sandbox, and the speed: a small menu from ▸▸ in the menu bar.
popover($('#speed'), $('#speed-menu'));

// Tapping a tab opens the sheet; tapping the open tab again folds it away.
sheet.querySelector('[role="tablist"]')!.addEventListener(
  'click',
  (event) => {
    if (!narrow.matches) return;
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    const open = sheet.dataset.open !== undefined;
    sheet.toggleAttribute('data-open', !(open && tab.dataset.state === 'active'));
  },
  true,
);

// Wide screens: fold the sidebar away to enjoy the town (remembered). Narrow screens have the sheet instead.
const SIDEBAR_KEY = 'officebit:sidebar';
const sidebarToggle = $('#sidebar-toggle');
const showSidebar = (shown: boolean) => {
  document.body.toggleAttribute('data-sidebar-hidden', !shown);
  localStorage.setItem(SIDEBAR_KEY, shown ? 'shown' : 'hidden');
  const label = shown ? 'Hide the sidebar' : 'Show the sidebar';
  sidebarToggle.setAttribute('aria-pressed', String(shown));
  sidebarToggle.setAttribute('aria-label', label);
  sidebarToggle.title = label;
};
showSidebar(localStorage.getItem(SIDEBAR_KEY) !== 'hidden');
sidebarToggle.addEventListener('click', () => showSidebar(document.body.hasAttribute('data-sidebar-hidden')));

// Resizing (or turning a phone) shouldn't animate the switch between layouts.
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
addEventListener('resize', () => {
  document.body.classList.add('resizing');
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => document.body.classList.remove('resizing'), 200);
});
// Crossing the breakpoint: labels that depend on the layout change with it.
narrow.addEventListener('change', () => updateCameraUi());

// Toolbar buttons are icons, labelled for screen readers and tooltips.
for (const button of document.querySelectorAll<HTMLElement>('[data-icon]')) button.insertAdjacentHTML('afterbegin', icon(button.dataset.icon as Parameters<typeof icon>[0]));
attachFullscreen($<HTMLButtonElement>('#fullscreen'));
registerApp();
/** Where you're looking, by name. Getting about is by the map, the Town button and the sidebar. */
function showPlace(): void {
  placeLabel.textContent = placeName(sim.world, sim.levels.get(renderer.level));
  // The tab says whose town it is, once it's named.
  document.title = `${townName(sim.world) ?? 'Your town'} · officebit`;
}
renderer.onLevelChange = () => {
  showPlace();
  card.close();
};
// A home renamed (someone moved in) is a new name to show.
renderer.onWorldChange = showPlace;
showPlace();
news.setSim(sim);
if (loaded.note) sim.log(loaded.note);
const api = exposeLocalFeed(() => sim, { follow: (id) => select(id), look: (level, x, y) => visit(level, x === undefined || y === undefined ? undefined : [x, y]) });

/** Selecting someone opens their profile and follows them, across floors; dragging the view lets go. */
function select(id: string | null): void {
  const person = id ? sim.person(id) : undefined;
  if (person && person.id !== renderer.selected) remember();
  renderer.selected = person?.id ?? null;
  renderer.camera.following = person?.id ?? null;
  if (person) profile.open(person, sim);
  else profile.close();
  // On a phone the profile needs the room: fold the sheet away.
  if (person && narrow.matches) sheet.removeAttribute('data-open');
  news.select(person ?? null);
  updateCameraUi();
}

function follow(id: string | null): void {
  renderer.camera.following = id;
  updateCameraUi();
}


/** Buildings you can click: anything with a door leading inside. */
const enterable = (item: Item) => interiorOf(sim, item) !== null;

attachControls(renderer, {
  click(x, y) {
    if (editor.active) return editor.click(x, y);
    if (steering && command(x, y)) return;
    const person = renderer.pick(x, y);
    if (person) {
      card.close();
      return select(person.id);
    }
    const panel = renderer.pickItem(x, y, (item) => !!item.type.spotlight);
    if (panel) {
      // The card shows its picture as it is, whatever the panel (a poster shows the icon).
      const spot = renderer.spotlightOn(panel.item);
      return card.openSpotlight(spot, renderer.toWorld(x, y));
    }
    const building = renderer.pickItem(x, y, enterable);
    const inside = building && interiorOf(sim, building.item);
    if (building && inside) return card.open(inside, renderer.toWorld(x, y));
    const exit = exitUnder(x, y);
    if (exit) return card.openExit(exit, renderer.toWorld(x, y), sim);
    card.close();
    select(null);
  },
  hover(x, y) {
    if (editor.active) return editor.hover(x, y);
    return !!renderer.pick(x, y) || !!renderer.pickItem(x, y, (item) => enterable(item) || !!item.type.spotlight) || !!exitUnder(x, y);
  },
  grab: (x, y) => (editor.active ? editor.grab(x, y) : null),
  changed: updateCameraUi,
});

// ── Steering someone (docs/INTERACTIONS.md) ───────────────────────────────────

let steering: string | null = null;
const steerBar = $('#steer');
steerBar.querySelector('[data-action="let-go"]')!.addEventListener('click', () => steer(null));
steerBar.addEventListener('pointerdown', (event) => event.stopPropagation());

/** Take control of someone (and follow them), or let go with null. */
function steer(id: string | null): void {
  const current = steering ? sim.person(steering) : undefined;
  if (current) sim.interactions.control(current, false);
  steering = null;
  const p = id ? sim.person(id) : undefined;
  if (p) {
    sim.interactions.control(p, true);
    steering = p.id;
    if (renderer.selected !== p.id) select(p.id);
    follow(p.id);
  }
  steerBar.hidden = !p;
  if (p) steerBar.querySelector('strong')!.textContent = p.name;
}

/** A click while steering: talk to whoever's there, use whatever's there, or walk there. */
function command(x: number, y: number): boolean {
  const p = steering ? sim.person(steering) : undefined;
  if (!p) return false;
  const other = renderer.pick(x, y);
  // Tapping the person you're steering brings their profile back.
  if (other === p) {
    select(p.id);
    return true;
  }
  if (other) {
    sim.interactions.command(p, { kind: 'chat', with: other.id });
    return true;
  }
  const usable = (item: Item) => item.type.spots.length > 0 && (!item.type.desk || item.def.owner === p.id);
  const prop = renderer.pickItem(x, y, usable);
  if (prop) {
    const { item } = prop;
    const intent: Intent = item.type.bed
      ? { kind: 'sleep', item: item.index, until: sim.nextWake(p) }
      : item.type.desk
        ? { kind: 'work' }
        : { kind: 'use', item: item.index };
    sim.interactions.command(p, intent);
    return true;
  }
  // A door or stairs (outside, the building too): through it, to where it comes out.
  const building = renderer.pickItem(x, y, enterable);
  const through = exitUnder(x, y)?.to ?? (building && insideDoor(sim, building.item));
  if (through) {
    sim.interactions.command(p, { kind: 'wander', to: through });
    return true;
  }
  const tile = tileAt(x, y);
  if (!sim.grids.get(renderer.level)?.walkable(tile[0], tile[1])) return false;
  sim.interactions.command(p, { kind: 'wander', to: { level: renderer.level, p: tile } });
  return true;
}

/** The tile under a client-space point. */
function tileAt(x: number, y: number): Tile {
  const world = renderer.toWorld(x, y);
  return [Math.floor(world.x / TILE), Math.floor(world.y / TILE)];
}

/** Rebuild the town from a new design, keeping the view. Throws (and changes nothing) if it can't run. */
function applyDesign(next: WorldDef): string[] {
  const previous = design;
  design = next;
  let rebuilt: Simulation;
  try {
    rebuilt = newSim();
  } catch (error) {
    design = previous;
    throw error;
  }
  useSim(rebuilt);
  showPlace();
  return validate(design);
}

/** The door or stairs under a client-space point. */
function exitUnder(x: number, y: number): Exit | null {
  const world = renderer.toWorld(x, y);
  return exitAt(sim, renderer.level, Math.floor(world.x / TILE), Math.floor(world.y / TILE));
}

/** Look at another level; through a door, look at where it comes out. */
function visit(level: string, at?: Tile): void {
  if (level !== renderer.level || at) remember();
  renderer.camera.following = null;
  renderer.showLevel(level);
  if (at) renderer.camera.centerOn((at[0] + 0.5) * TILE, (at[1] + 0.5) * TILE);
  updateCameraUi();
}

// ── Going back ──────────────────────────────────────────────────────────────
// Opening someone or going somewhere remembers the view you're leaving; Back returns to it.

const trail = new ViewHistory();
const backButton = $<HTMLButtonElement>('#back');
/** True while Back is putting a view back, so that doesn't count as going somewhere new. */
let goingBack = false;

function remember(): void {
  if (goingBack || !renderer.level) return;
  const person = renderer.camera.following ?? renderer.selected;
  trail.push({ person, level: renderer.level, ...renderer.camera.snapshot() });
  backButton.disabled = false;
}

function goBack(): void {
  const view = trail.back();
  backButton.disabled = !trail.canGoBack;
  if (!view) return;
  goingBack = true;
  const person = view.person ? sim.person(view.person) : undefined;
  // Someone: selected and followed again, wherever they are now. Somewhere: just as you left it.
  if (person && sim.present(person)) select(person.id);
  else {
    select(null);
    renderer.camera.following = null;
    renderer.showLevel(view.level);
    renderer.camera.restore(view);
    updateCameraUi();
  }
  goingBack = false;
}
backButton.addEventListener('click', goBack);
addEventListener('keydown', (event) => {
  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault();
    goBack();
  }
});

$('#to-town').addEventListener('click', () => {
  const town = sim.world.levels.find((l) => l.kind === 'outside');
  if (town) visit(town.id);
});

const followButton = $<HTMLButtonElement>('#follow');
followButton.addEventListener('click', () => {
  const { camera } = renderer;
  camera.following = camera.following ? null : renderer.selected;
  updateCameraUi();
});
for (const [id, direction] of [['#zoom-in', 1], ['#zoom-out', -1]] as const) {
  $(id).addEventListener('click', () => {
    renderer.camera.zoomBy(direction);
    updateCameraUi();
  });
}

function updateCameraUi(): void {
  const { camera, selected } = renderer;
  const person = selected ? sim.person(selected) : undefined;
  // A chip over the map while you're following someone; tap it to stop.
  const following = person && camera.following === person.id;
  followButton.hidden = !following;
  if (following) followButton.textContent = `Following ${person.name} ✕`;
  $('#zoom-level').textContent = `${Number(camera.zoom.toFixed(1))}×`;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
}
function setSpeed(next: number): void {
  time.speed = next;
  updateTimeUi();
}

const modeSelect = $<HTMLSelectElement>('#mode');
modeSelect.addEventListener('change', () => setMode(modeSelect.value as Mode));
/** Sandbox keeps the town you have. Live follows the real clock, so it goes back to the town that's been running since live mode started. */
function setMode(mode: Mode): void {
  // Leaving Live: the town as it is, for coming back to.
  if (time.mode === 'live') saveTown();
  localStorage.setItem(MODE_KEY, mode);
  time.mode = mode;
  if (mode === 'live') restart();
  time.speed = 1;
  updateTimeUi();
}

// A new beginning: the town starts again this morning, with a story of its own.
$('#start-afresh').addEventListener('click', () => {
  time.since = Date.now();
  localStorage.setItem(SINCE_KEY, String(time.since));
  design.seed = storySeed(true);
  restart();
  updateTimeUi();
});

const playPause = $('#play-pause');
playPause.addEventListener('click', () => setSpeed(time.paused ? 1 : 0));

function updateTimeUi(): void {
  const live = time.mode === 'live';
  modeSelect.value = time.mode;
  const label = time.paused ? 'Play' : 'Pause';
  playPause.innerHTML = icon(time.paused ? 'play' : 'pause');
  playPause.setAttribute('aria-label', label);
  playPause.title = label;
  // Live mode is pause and play only; the speeds are for Sandbox. Live says how long it's been running.
  $('#speed-menu .speeds').hidden = live;
  $('#since').hidden = !live || !time.since;
  if (time.since) $('#since-date').textContent = `Running since ${new Date(time.since).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}.`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === time.speed));
  }
}
updateTimeUi();
updateCameraUi();

/** A fresh town from the design (switching to Live does this), looking at the same place as before. */
function restart(): void {
  useSim(newSim());
}

/** Swap in another town, looking at the same place if it has it, with nothing open or selected. */
function useSim(next: Simulation): void {
  setEditing(false);
  steer(null);
  sim = next;
  trail.clear();
  backButton.disabled = true;
  card.close();
  renderer.setSim(sim, sim.levels.has(renderer.level) ? renderer.level : FIRST_LEVEL, true);
  news.setSim(sim);
  soundscape.setSim(sim);
  directory.reset();
  select(null);
}

// Jumping ahead: tap the clock, or officebit.travel(3) for three days on, officebit.travel('2026-12-25T09:00') for a date.
const travelBar = $('#travel');
function jump(to: number): void {
  time.travel(sim, to);
  updateTimeUi();
}
new TimeJump($('#clock'), {
  sim: () => sim,
  time,
  jump,
  startOn: (day) => {
    // Another day is a sandbox: Live has to be today.
    localStorage.setItem(MODE_KEY, 'sandbox');
    time.mode = 'sandbox';
    time.sandboxDate = day;
    restart();
    updateTimeUi();
  },
});
api.travel = (when: number | string | Date) => jump(typeof when === 'number' ? sim.tick + when * TICKS_PER_DAY : sim.tick + (new Date(when).getTime() - Date.now()) / TICK_MS);
travelBar.querySelector('[data-action="stop"]')!.addEventListener('click', () => time.stopTravelling());
travelBar.addEventListener('pointerdown', (event) => event.stopPropagation());

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === ' ') {
    event.preventDefault();
    // Drawing in the editor, Space held moves the map instead (like Figma's hand); otherwise it pauses.
    if (editor.active && editor.drawsOnPress()) editor.holdHand(true);
    else if (!event.repeat) setSpeed(time.paused ? 1 : 0);
  }
  if (event.key === 'Escape') {
    card.close();
    if (steering) steer(null);
  }
});

document.addEventListener('keyup', (event) => {
  if (event.key !== ' ') return;
  // Not a press of whichever button has focus, either.
  event.preventDefault();
  editor.holdHand(false);
});
addEventListener('blur', () => editor.holdHand(false));

/** The loading screen (town/index.html), until the town's first frame is on screen, and a moment more so it doesn't just flash. */
const LOADING_LINGER_MS = 300;
let loading = document.getElementById('loading');
let last = performance.now();
let lastPanel = 0;
const clock = $('#clock');

function frame(now: number): void {
  const dt = now - last;
  last = now;
  const wasCatchingUp = time.catchingUp;
  const between = time.advance(sim, dt);
  const { travelling, catchingUp } = time;
  // Caught up: save it there, so coming straight back doesn't do it all again.
  if (wasCatchingUp && !catchingUp) saveTown();
  travelBar.hidden = !travelling && !catchingUp;
  travelBar.querySelector('span')!.textContent = travelling ? `Jumping ahead… ${formatClock(sim.tick, sim.firstDay)}` : 'Catching up with the clock…';
  travelBar.querySelector<HTMLElement>('[data-action="stop"]')!.hidden = !travelling;
  const progress = travelBar.querySelector('progress')!;
  if (travelling) progress.value = (sim.tick - travelling.from) / (travelling.to - travelling.from);
  else if (catchingUp && time.origin) progress.value = (sim.tick - time.origin.tick) / Math.max(1, liveTick(time.origin, Date.now()) - time.origin.tick);
  else progress.removeAttribute('value');
  // Coming back after a while: the loading screen says where the catching up has got to.
  if (loading && catchingUp) loading.querySelector('.loading-note')!.textContent = `Catching up on the town… ${formatClock(sim.tick, sim.firstDay)}`;

  // Jumping ahead plays out on screen, at speed. Live's catching up happens out of sight: the town just is where it should be.
  // On a phone the sheet and the profile slide up over the map: keep whoever's followed in the part still showing.
  renderer.camera.insetBottom = narrow.matches ? Math.max(profile.coveredHeight(), sheet.offsetHeight) : 0;
  if (!catchingUp) renderer.draw(between, dt);
  if (loading && !catchingUp) {
    const screen = loading;
    loading = null;
    setTimeout(() => screen.remove(), LOADING_LINGER_MS);
  }
  soundscape.update(dt);
  card.update(renderer.camera, sim);
  tour.update();
  if (now - lastPanel > 250) {
    lastPanel = now;
    profile.update(sim);
    directory.update(sim, renderer.selected);
    overview.update(sim);
    editor.update();
    // After dark the music turns to its calm night style.
    audio.night = sim.daylight() < 0.3;
    // Live and Sandbox alike: the day of the story, counted from the day it began (phones have room for just the time).
    clock.textContent = narrow.matches ? `${weekdayOf(sim.tick)} ${formatTime(sim.tick)}` : formatClock(sim.tick, sim.firstDay);
    if (time.mode !== modeSelect.value) updateTimeUi();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
