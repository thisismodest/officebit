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
venue like the shop). `icon` (an icon name from `ui/icons.ts`, like `cart`) shows in the panel; `walkIn` companies hire
anyone looking for work. New companies appear as ventures launch
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
