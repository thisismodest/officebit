# People

```jsonc
{ "id": "bea", "name": "Bea", "dept": "brand", "look": [2, 3, 1, 1], "preset": "magnet", "home": "home-bea" }
```

| Field | Meaning |
|---|---|
| `company` | Employer id; defaults to the first company. Changes if they're let go, quit, or start a venture (see [CAREERS](CAREERS.md)). |
| `dept` | Department id. Their lanyard badge takes its colour; the panel groups by it. |
| `look` | `[skin, hair, shirt, hairstyle]`: indices into `SKIN`, `HAIR`, `SHIRT` in `render/palette.ts`. Hairstyle: 0 short · 1 long · 2 bun. |
| `preset`, `traits` | Personality (see [PERSONALITIES](PERSONALITIES.md)) |
| `home` | Their home level. Without one, they arrive and leave via the world's `spawn`. |
| `shift` | `[start, end]` hours worked every day, weekends too, instead of office hours from their traits (the shop's Wes 7–15 and Juno 12–22). They set off 1¼ hours before it starts. |
| `romance` | `false` keeps them out of love stories (see [LOVE](LOVE.md)). |

Their desk is whichever workstation lists them as `owner`.

## Companies

```jsonc
{ "id": "head", "name": "Head office", "levels": ["ground", "first"] }
```

During work hours people choose from their company's floors (offices, or a
venue like the shop, the diner or the school). `icon` (an icon name from `ui/icons.ts`, like `cart`) shows in the panel. Every
company with a free desk hires people looking for work (see [CAREERS](CAREERS.md));
`walkIn` marks the simpler jobs (the shop, the diner, the school) that the unambitious
sometimes leave the office for. Background staff (Dot, Ray, Maggie) run the diner and
the school alongside anyone they take on. New companies appear as ventures launch
(see [VENTURES](VENTURES.md)).

## Departments

```jsonc
{ "id": "film", "name": "Film", "color": "#c8453a", "station": "editingDesk" }
```

`station` is the workstation type for the team's desks.

## Family and pets

`npcs` are everyone who isn't in `people`: family and pets, who live at
someone's home and never go to work, and the roles below. The People panel
lists them too.

```jsonc
{ "id": "jules", "name": "Jules", "species": "human", "look": [0, 2, 3, 1], "home": "home-rowan", "preset": "magnet" }
{ "id": "biscuit", "name": "Biscuit", "species": "dog", "look": [0], "home": "home-rowan" }
```

- **Family** (`human`) use the regular brain with home hours: they cook,
  watch TV, chat, and sleep in the spare beds.
- **Staff** (`"role": "staff"`, `"works": "diner"`, `"shift": [6, 18]`) have
  homes like anyone and work a shift every day. On shift, `StaffBrain` serves
  anyone who hasn't been served (☕), wipes down tables (🧽), and minds the till.
  Off shift they live as their preset says, including going out and shopping.
  Dot does days and Ray does nights. A venue with staff is only open while one
  is in and on shift (see [BUILDINGS](BUILDINGS.md#venues)).
- **Children** (`"role": "child"`, `"works": "school"`) walk to school on
  weekdays (07:45, home at 15:15), sit at their own desk, eat school lunch
  (12:00–13:15) and play outside. At home they raid the fridge rather than cook, never order in,
  and are in bed by about 20:00. They're drawn three pixels shorter. Teachers
  are `staff` whose `works` is a school.
- **Family members** have presets too (`"preset": "magnet"`). Jules, Arjun,
  Kai and Tom are all different people.
- **Crews** (`"role": "crew"`) are hired by construction jobs: they arrive
  from the edge of town in working hours, build, go home at night, and leave
  for good when the job's done (see [VENTURES](VENTURES.md#construction)).
- **Pets** (`cat`, `dog`) nap in their basket or on the sofa, and pester
  whoever's home. Playing with a pet is good for social and fun.
  `look` is `[fur]`, an index into `FUR`.
- **Riders and visitors** (`courier`, `visitor`) pass through: the sim brings
  them in (a pizza delivery, a car off the highway: see
  [TRAFFIC](TRAFFIC.md#visitors)) and sees them off. They're never saved.

## Birthdays

`sim/birthdays.ts`. Everyone who lives here has a birthday: `birthday: [month,
day]` on their definition, or one worked out from their id (never 29
February); **Edit** on a profile changes it. On the day (from 06:00) it's in the
News, they wake up a bit more cheerful (fun and company topped up), and wear a
party hat all day. On a working day they bring a cake in to work when they get
there, put by the kitchen table (`kitchenIn`, as pizza is); family have theirs at
home from 17:00; pets get the hat and the fuss. A cake is a treat people go out
of their way for, eight slices, cleared away once it's eaten or after six hours.

## Editing

**Edit** on a profile (`ui/person-editor.ts`), for the team and their families
and pets (not staff, crews or passers-by), changes someone in the running town
(`sim.editPerson`) and in the design (`updatePerson` in `worlds/edit.ts`) at once:

- **Birthday**: a day and a month.
- **Name, look and personality.** A look is skin, hair, top and hair style
  (pets: fur). A new personality starts from its preset and shows in what they
  do from then on. The team also have a department (type a new one to make it).
- **Household.** **+ Add to household** asks who (a baby, a partner, a cat or a dog) and their name (`planFamily`): a person
  needs a free bed at home, a baby a free desk at school, a pet somewhere to curl
  up. They arrive like anyone new (`sim/arrivals.ts`): a baby is dropped off by
  car at the nearest road to the house and crawls in through the front door
  (slowly, low down); anyone else walks in from the edge of town. **Move out**
  sees one of them off, for good; if that's the last person whose home it is, the
  family and pets go with them, so a house to let is always empty.
- **Works at**: any workplace (a free desk there, or it says there isn't one:
  `giveJob`), or **Out of work**, and they look for work elsewhere (see
  [CAREERS](CAREERS.md)). Someone let go never applies back to where they were
  let go, so this is how to take them back. **Leave town**, and they and their household walk off the edge of town and
  are gone; their home goes up to let.

**+ Add someone to the team**, at the top of the People tab (`ui/team-form.ts`):
a name, where they work, a department (type a new one to make it) and a
personality. They get a free desk there (their department's kind first) and a
house to let, named for them (`addPerson`, and the same desk and house in the
running town where they're free there too). They walk in from the edge of town
(`arrivals.newStarter`), go home to settle in, and get on with their days. No
free desk, or no house to let, and it says so.

## Kinds

`src/sim/roles.ts` says what each kind of person is. There's one entry per
kind (employee, family, pet, and each role):

| Field | Means |
|---|---|
| `brain` | What decides for them, if not their personality |
| `routine` | Their hours (a `shift` overrides it) |
| `day` | `routine` as is, `homebody` (never works), `errand` (always on the job), `employee` (follows feeds too) |
| `weekends` | Weekends off (a `shift` is worked every day; anyone at a school keeps school weeks) |
| `goesOut` | Off work, may go to public venues |
| `rethink` | When the sim may stop them: `always`, `offShift` (crews), `never` |
| `relationships`, `romance` | Makes friends and enemies; can fall in love |
| `controllable`, `customer`, `saved` | Can be steered; staff serve them; kept in the world file |

A new kind of person is a new role and one entry here.

## Intents

`src/sim/intents.ts` says what each intent does. For every kind there's
where to go (`to`), what happens on arrival (`start`), each step while doing
it (`doing`), and whether it still suits the time of day (`fits`). The kinds:
`work`, `use`, `hustle`, `chat`, `wander`, `retreat`, `meeting`, `sleep`,
`queue` (waiting outside a venue for its staff) and `leave`. A new activity is
a new `Intent` in `person.ts` and one entry here.

## At runtime

`src/sim/person.ts` holds the live state: position and level, needs, current
intent, route, conversation, feed status. `ui/describe.ts` turns it into
plain English ("Eating a takeaway in front of the TV").
