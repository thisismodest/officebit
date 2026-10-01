// The built-in world: a two-floor office in a small town, and everyone's home.
//
//   Ground floor — kitchen, big dining area with comfy seating, two meeting
//                  rooms, the production studio, customer service.
//   First floor  — brand, design, engineering, operations, the CEO's office,
//                  and a kitchenette round the stairs.
import type { CompanyDef, DepartmentDef, NpcDef, PersonDef, PortalDef, Tile, WorldDef } from "../sim/world.ts";
import { buildHome, buildNarrowboat, buildToLet, type HomeStyle } from "./homes.ts";
import { buildSchool } from "./school.ts";
import { buildDiner, buildShop } from "./venues.ts";
import { LevelBuilder, portal } from "./layout.ts";
import { DINER_DOOR, NARROWBOAT, OFFICE_DOOR, PLOTS, SCHOOL_DOOR, SHOP_DOOR, SPAWN, buildTown, type Plot } from "./town.ts";
import { resolveTraits } from "../sim/personality.ts";
import { VERSION } from "./upgrades.ts";

const COMPANIES: CompanyDef[] = [
  { id: "head", name: "Head office", levels: ["ground", "first"] },
  { id: "shop", name: "Corner Shop", icon: "cart", walkIn: true, levels: ["shop"] },
  // Background staff run these (Dot, Ray, Maggie); anyone looking for work can be taken on too.
  { id: "diner", name: "The Night Owl Diner", icon: "cup", walkIn: true, levels: ["diner"] },
  { id: "school", name: "Acacia Primary", icon: "school", walkIn: true, levels: ["school"] }
];

const DEPARTMENTS: DepartmentDef[] = [
  { id: "ceo", name: "CEO's office", color: "#e7aa2e", station: "executiveDesk" },
  { id: "film", name: "Film", color: "#c8453a", station: "editingDesk" },
  { id: "cs", name: "Customer service", color: "#1f9e95", station: "supportDesk" },
  { id: "brand", name: "Brand", color: "#7f4aa6", station: "laptopDesk" },
  { id: "eng", name: "Engineering", color: "#3f74b5", station: "computerDesk" },
  { id: "design", name: "Design", color: "#e4793a", station: "drawingDesk" },
  { id: "ops", name: "Operations", color: "#379463", station: "opsDesk" }
];

const PEOPLE: PersonDef[] = [
  { id: "rowan", name: "Rowan", dept: "ceo", look: [1, 4, 7, 0], preset: "magnet", traits: { diligence: 0.7 } },
  { id: "ines", name: "Ines", dept: "film", look: [2, 0, 1, 2], preset: "workhorse" },
  { id: "theo", name: "Theo", dept: "film", look: [0, 2, 5, 0], preset: "distractor" },
  { id: "mo", name: "Mo", dept: "film", look: [4, 0, 3, 0], preset: "founder" },
  { id: "priya", name: "Priya", dept: "cs", look: [3, 0, 6, 1], preset: "regular" },
  { id: "sam", name: "Sam", dept: "cs", look: [0, 1, 0, 0], preset: "introvert" },
  { id: "lou", name: "Lou", dept: "cs", look: [1, 6, 2, 1], preset: "magnet" },
  { id: "ada", name: "Ada", dept: "brand", look: [0, 1, 4, 2], preset: "regular" },
  { id: "bea", name: "Bea", dept: "brand", look: [2, 3, 1, 1], preset: "magnet" },
  { id: "cal", name: "Cal", dept: "brand", look: [1, 0, 2, 0], preset: "distractor" },
  { id: "dev", name: "Dev", dept: "eng", look: [3, 2, 3, 0], preset: "introvert" },
  { id: "hana", name: "Hana", dept: "eng", look: [0, 0, 7, 1], preset: "workhorse", traits: { ambition: 0.75 } },
  { id: "gus", name: "Gus", dept: "eng", look: [2, 4, 6, 0], preset: "introvert" },
  { id: "fay", name: "Fay", dept: "design", look: [1, 6, 5, 1], preset: "regular" },
  { id: "eli", name: "Eli", dept: "ops", look: [4, 4, 4, 0], preset: "workhorse" },
  { id: "nia", name: "Nia", dept: "ops", look: [3, 0, 0, 2], preset: "regular" },
  // Work at the Corner Shop, in shifts that cover its opening hours (07:00–22:00) and each other's lunch
  { id: "wes", name: "Wes", company: "shop", look: [2, 1, 3, 0], preset: "regular", traits: { ambition: 0.2 }, shift: [7, 15] },
  { id: "juno", name: "Juno", company: "shop", look: [0, 6, 6, 1], preset: "magnet", traits: { ambition: 0.25 }, shift: [12, 22] }
];

const home = (id: string) => `home-${id}`;

const NPCS: NpcDef[] = [
  { id: "jules", name: "Jules", species: "human", look: [0, 2, 3, 1], home: home("rowan"), preset: "magnet" },
  { id: "biscuit", name: "Biscuit", species: "dog", look: [0], home: home("rowan") },
  { id: "miso", name: "Miso", species: "cat", look: [1], home: home("ines") },
  { id: "arjun", name: "Arjun", species: "human", look: [3, 0, 7, 0], home: home("priya"), preset: "workhorse" },
  { id: "pepper", name: "Pepper", species: "cat", look: [2], home: home("priya") },
  { id: "kai", name: "Kai", species: "human", look: [1, 1, 2, 0], home: home("hana"), preset: "introvert" },
  { id: "waffles", name: "Waffles", species: "dog", look: [3], home: home("hana") },
  { id: "olive", name: "Olive", species: "cat", look: [0], home: home("eli") },
  { id: "tom", name: "Tom", species: "human", look: [4, 4, 5, 0], home: home("nia"), preset: "distractor" },
  // The children, who go to Acacia Primary on weekdays.
  { id: "isla", name: "Isla", species: "human", look: [1, 2, 2, 2], home: home("rowan"), preset: "magnet", role: "child", works: "school" },
  { id: "finn", name: "Finn", species: "human", look: [0, 4, 5, 0], home: home("rowan"), preset: "distractor", role: "child", works: "school" },
  { id: "omar", name: "Omar", species: "human", look: [3, 0, 3, 0], home: home("priya"), preset: "regular", role: "child", works: "school" },
  { id: "lina", name: "Lina", species: "human", look: [0, 1, 6, 2], home: home("hana"), preset: "introvert", role: "child", works: "school" },
  // Their teacher.
  {
    id: "maggie",
    name: "Maggie",
    species: "human",
    look: [2, 3, 4, 1],
    home: home("maggie"),
    preset: "workhorse",
    role: "staff",
    works: "school",
    shift: [8, 16]
  },
  // Fen lives on the narrowboat moored on the river, and is out on the water whenever it's fine.
  { id: "fen", name: "Fen", species: "human", look: [3, 2, 3, 1], home: home("fen"), preset: "regular", traits: { ambition: 0.8, chaos: 0.6, social: 0.5 }, role: "resident" },
  // The diner's staff: Dot on days, Ray on nights, so it never closes.
  {
    id: "dot",
    name: "Dot",
    species: "human",
    look: [1, 3, 1, 2],
    home: home("dot"),
    preset: "magnet",
    role: "staff",
    works: "diner",
    shift: [6, 18]
  },
  {
    id: "ray",
    name: "Ray",
    species: "human",
    look: [3, 5, 7, 0],
    home: home("ray"),
    preset: "introvert",
    role: "staff",
    works: "diner",
    shift: [18, 6]
  }
];

/** NPCs with homes of their own on the town map (the rest live with someone). */
const HOUSEHOLDERS: { id: string; name: string }[] = [
  { id: "dot", name: "Dot" },
  { id: "ray", name: "Ray" },
  { id: "maggie", name: "Maggie" }
];

const ofDept = (dept: string) => PEOPLE.filter((p) => p.dept === dept).map((p) => p.id);
const ofCompany = (company: string) => PEOPLE.filter((p) => p.company === company).map((p) => p.id);
const stationOf = (dept: string) => DEPARTMENTS.find((d) => d.id === dept)!.station;

/** Both floors share a footprint, with the stairs in the middle. */
const STAIRS: Tile = [19, 12];

const ground = new LevelBuilder("ground", "Ground floor", "building", 40, 26)
  .room("ground-floor", "Ground floor", [0, 0, 40, 26], "wood", { walled: true })
  .room("dining", "Dining area", [0, 8, 17, 18], "darkWood")
  .room("lobby", "Lobby", [17, 8, 7, 18], "stone")
  .room("kitchen", "Kitchen", [0, 0, 12, 8], "tiles", { walled: true })
  .room("meeting", "Meeting room 1", [12, 0, 8, 8], "carpetGrey", { walled: true })
  .room("meeting-2", "Meeting room 2", [20, 0, 8, 8], "carpetGrey", { walled: true })
  .room("studio", "Production studio", [28, 0, 12, 12], "concrete", { walled: true, dept: "film" })
  .room("support", "Customer service", [24, 14, 16, 12], "carpetBlue", { walled: true, dept: "cs" })
  .door([6, 7], [10, 7], [15, 7], [23, 7], [33, 11], [31, 14], [24, 19], [19, 25], [20, 25])
  // Kitchen
  .put("counter", 1, 1)
  .put("coffee", 2, 1)
  .put("coffee", 3, 1)
  .put("sink", 4, 1)
  .put("counter", 5, 1)
  .put("fridge", 6, 1)
  .put("fridge", 7, 1)
  .put("counter", 8, 1)
  .put("plant", 10, 1)
  .put("table", 4, 4)
  // Dining area: long tables, then sofas and armchairs to sink into
  .row("table", [2, 7], 10)
  .row("table", [2, 7], 15)
  .put("cooler", 14, 10)
  .put("rug", 2, 21)
  .put("sofa", 2, 21)
  .put("sofa", 6, 21)
  .put("armchair", 10, 21)
  .put("armchair", 12, 21)
  .put("bookshelf", 14, 23)
  .put("arcade", 12, 23)
  .put("plant", 1, 24)
  .put("plant", 16, 24)
  // Meeting rooms
  .put("whiteboard", 14, 1)
  .put("meetingTable", 14, 3)
  .put("whiteboard", 22, 1)
  .put("meetingTable", 22, 3)
  // Production studio
  .put("backdrop", 32, 1)
  .put("studioLight", 30, 2)
  .put("studioLight", 37, 2)
  .put("cameraRig", 33, 5)
  .desks(
    stationOf("film"),
    [
      [29, 8],
      [32, 8],
      [35, 8]
    ],
    ofDept("film")
  )
  .put("plant", 38, 10)
  // Customer service
  .desks(
    stationOf("cs"),
    [
      [26, 17],
      [29, 17],
      [32, 17],
      [35, 17],
      [26, 21],
      [29, 21]
    ],
    ofDept("cs")
  )
  .put("plant", 38, 15)
  .put("plant", 38, 24)
  .put("bookshelf", 35, 21)
  // Lobby
  .put("stairs", ...STAIRS)
  .put("plant", 17, 23)
  .put("plant", 22, 23);

const first = new LevelBuilder("first", "First floor", "building", 40, 26)
  .room("first-floor", "First floor", [0, 0, 40, 26], "carpetGrey", { walled: true })
  .room("kitchenette", "Kitchenette", [16, 8, 8, 18], "tiles")
  .room("brand", "Brand", [0, 0, 16, 12], "carpetPurple", { walled: true, dept: "brand" })
  .room("design", "Design", [0, 14, 16, 12], "wood", { walled: true, dept: "design" })
  .room("ceo", "CEO's office", [16, 0, 8, 8], "darkWood", { walled: true, dept: "ceo" })
  .room("eng", "Engineering", [24, 0, 16, 12], "carpetBlue", { walled: true, dept: "eng" })
  .room("ops", "Operations", [24, 14, 16, 12], "carpetGreen", { walled: true, dept: "ops" })
  .door([15, 5], [8, 11], [15, 19], [8, 14], [19, 7], [24, 5], [31, 11], [24, 19], [31, 14])
  // Brand
  .desks(
    stationOf("brand"),
    [
      [2, 3],
      [6, 3],
      [10, 3],
      [2, 7],
      [6, 7]
    ],
    ofDept("brand")
  )
  .put("whiteboard", 10, 8)
  .put("bookshelf", 12, 1)
  .put("plant", 14, 1)
  .put("plant", 1, 10)
  // Design
  .desks(
    stationOf("design"),
    [
      [2, 17],
      [6, 17]
    ],
    ofDept("design")
  )
  .put("whiteboard", 10, 17)
  .put("bookshelf", 2, 22)
  .put("plant", 14, 15)
  .put("plant", 14, 24)
  // CEO's office
  .desks(stationOf("ceo"), [[18, 3]], ofDept("ceo"))
  .put("bookshelf", 17, 1)
  .put("plant", 22, 1)
  .put("armchair", 17, 5)
  .put("armchair", 22, 5)
  // Engineering
  .desks(
    stationOf("eng"),
    [
      [26, 3],
      [30, 3],
      [34, 3],
      [26, 7],
      [30, 7]
    ],
    ofDept("eng")
  )
  .put("bookshelf", 36, 8)
  .put("plant", 38, 1)
  .put("plant", 38, 10)
  // Operations
  .desks(
    stationOf("ops"),
    [
      [26, 17],
      [30, 17],
      [34, 17]
    ],
    ofDept("ops")
  )
  .put("bookshelf", 26, 22)
  .put("plant", 38, 15)
  .put("plant", 38, 24)
  // Kitchenette round the stairs
  .put("stairs", ...STAIRS)
  .put("counter", 17, 19)
  .put("coffee", 18, 19)
  .put("sink", 19, 19)
  .put("fridge", 20, 19)
  .put("counter", 21, 19)
  .put("cooler", 22, 15)
  .put("arcade", 22, 21)
  .put("smallTable", 18, 23)
  .put("plant", 17, 9)
  .put("plant", 22, 9);

// ── Town ────────────────────────────────────────────────────────────────────
// Laid out in town.ts. Families with children get a detached house near the
// school; couples and the CEO a semi; ambitious people a semi if there's one
// going; everyone else a terrace. Bigger households choose first.

const residents = [...PEOPLE, ...HOUSEHOLDERS].map((r) => {
  const household = NPCS.filter((n) => n.home === home(r.id) && n.species === "human" && n.id !== r.id);
  const kids = household.some((n) => n.role === "child");
  const senior = PEOPLE.find((p) => p.id === r.id)?.dept === "ceo";
  const ambitious = resolveTraits(NPCS.find((n) => n.id === r.id)?.preset ?? PEOPLE.find((p) => p.id === r.id)?.preset).ambition >= 0.6;
  const wants: HomeStyle[] = kids
    ? ["detached"]
    : household.length > 0 || senior
      ? ["house", "detached", "terrace"]
      : ambitious
        ? ["house", "terrace"]
        : ["terrace", "house"];
  return { ...r, wants, rank: household.length * 2 + (kids ? 4 : 0) + (senior ? 2 : 0) };
});
const free: Record<HomeStyle, Plot[]> = { detached: [...PLOTS.detached], house: [...PLOTS.house], terrace: [...PLOTS.terrace] };
const housed = [...residents]
  .sort((a, b) => b.rank - a.rank)
  .map((person) => {
    const style = person.wants.find((w) => free[w].length > 0);
    if (!style) throw new Error(`No house left for ${person.name}: add a plot in town.ts`);
    return { person, style, plot: free[style].shift()! };
  });
// Every plot left over gets a house too, empty and to let, for people moving and newcomers.
const toLet = (Object.entries(free) as [HomeStyle, Plot[]][]).flatMap(([style, plots]) => plots.map((plot) => ({ style, plot })));
const town = buildTown([...housed.map(({ person, plot }) => ({ plot, owner: person.id })), ...toLet.map(({ plot }) => ({ plot }))]);

const diner = buildDiner("diner", "The Night Owl Diner");
const shop = buildShop("shop", "Corner Shop", ofCompany("shop"));
const school = buildSchool("school", "Acacia Primary", NPCS.filter((n) => n.role === "child").map((n) => n.id));

const portals: PortalDef[] = [
  portal("door", town.at(OFFICE_DOOR), ground.at([19, 24])),
  portal("door", town.at(DINER_DOOR), { level: diner.level.id, p: diner.entry }),
  portal("door", town.at(SHOP_DOOR), { level: shop.level.id, p: shop.entry }),
  portal("door", town.at(SCHOOL_DOOR), { level: school.level.id, p: school.entry }),
  portal("stairs", ground.at(STAIRS), first.at(STAIRS))
];

const emptyHomes = toLet.map(({ style, plot }, i) => {
  const { level, entry } = buildToLet(style, i + 1, i);
  portals.push(portal("door", town.at(plot.door), { level: level.id, p: entry }));
  return level;
});

// The narrowboat on the river: Fen's home, its door onto the bank.
const narrowboat = buildNarrowboat("fen", "Fen");
town.item({ t: "narrowboat", p: NARROWBOAT, faces: "up", owner: "fen" });
portals.push(portal("door", town.at([NARROWBOAT[0] + 1, NARROWBOAT[1] - 1]), { level: narrowboat.level.id, p: narrowboat.entry }));

const homes = housed.map(({ person, style, plot }, i) => {
  const preset = NPCS.find((n) => n.id === person.id)?.preset ?? PEOPLE.find((p) => p.id === person.id)?.preset;
  const gamer = ["regular", "distractor", "magnet", "founder"].includes(preset ?? "regular");
  const { level, entry } = buildHome(style, person.id, person.name, i, { console: gamer });
  portals.push(portal("door", town.at(plot.door), { level: level.id, p: entry }));
  return level;
});

export const STARTER: WorldDef = {
  v: 2,
  name: "Starter town",
  version: VERSION,
  seed: 20260929,
  companies: COMPANIES,
  departments: DEPARTMENTS,
  levels: [town.build(), ground.build(), first.build(), diner.level, shop.level, school.level, ...homes, narrowboat.level, ...emptyHomes],
  portals,
  spawn: town.at(SPAWN),
  people: PEOPLE.map((person) => ({ ...person, home: home(person.id) })),
  npcs: NPCS
};
