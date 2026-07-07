# THE EXPERIENCE
### How the survey should feel — the feature vision

The survey is an instrument. This document is about making it a companion: the
features that turn one more visit into a habit, and a viewer into a co-surveyor.
Each entry carries **NEEDS** (data or engine), **EFFORT** (S/M/L), **IMPACT** (1–5).

---

## 1. Star Bios — the dead get a sentence
Hover Voltaire and get more than a name: one Wikidata description line, dates,
occupation, and a link out. Baked at pack time for the 5,000 stars (~200KB budget);
no runtime calls. The tooltip becomes a tiny obituary; the plate for Memory gains a
"who is this?" answer everywhere.
**NEEDS** one pack-time Wikidata fetch · **EFFORT** M · **IMPACT** 4

## 2. Entity Lenses — "show me the others"
The maintainer's seed, generalized: click a Meta data center → *"See all Meta
facilities (41)?"* Click Walmart → all thrones in retail. Click a triangle sighting →
all triangles. Implemented as registry-declared **filters** per layer (operator,
sector, shape, decade, dark/light, status), rendered as chips in the plate and the
tooltip. The engine stays generic; lenses are data.
**NEEDS** `filters` block in registry + chip UI + filtered bake path · **EFFORT** M · **IMPACT** 5

## 3. Constellations — the network made visible
With a lens active, draw faint arcs linking the filtered set: Meta's grid, Amazon's
bloodstream as an actual vascular drawing, a company's HQ tethered to its facilities.
One render primitive (arcs), many stories. Pairs with the flows form the migration
layer needs anyway.
**NEEDS** arc renderer (shared with flows) · **EFFORT** M · **IMPACT** 4

## 4. Citizen Readings — the trail builder
Readings stop being author-only. A RECORD mode captures a sequence of views (camera +
layers + era + caption per stop) and encodes it into a shareable permalink string —
no server, no accounts, pure hash. Teachers build tours; readers argue back with
counter-readings. The survey becomes a medium.
**NEEDS** recorder UI + hash codec v2 · **EFFORT** M/L · **IMPACT** 5

## 5. Dossier Diff — two places, face to face
The dossier, doubled: *Cincinnati vs. Denver*, every field side by side, deltas
marked. The natural follow-up to every dossier ever opened, and the feature that
makes the survey an argument-settler.
**NEEDS** dossier engine (exists) + layout · **EFFORT** S/M · **IMPACT** 4

## 6. Time Everywhere — the era scrubber, generalized
Memory has eras; nothing else does. Crashes carry months, sightings carry decades,
NPL sites carry listing years, migrations carry filing years. A registry-declared
`time` field gives any layer the scrubber for free.
**NEEDS** registry `time` spec + per-bucket bake filter (era machinery exists) · **EFFORT** M · **IMPACT** 4

## 7. Pins & Field Notes
Drop a benchmark marker, write a note, get a permalink. No backend: the note lives in
the link. The lightest possible annotation layer, entirely in the survey's idiom.
**NEEDS** hash codec v2 · **EFFORT** S · **IMPACT** 3

## 8. The Embed Kit
A one-click generator: iframe snippet for any permalink view, sized presets, with
attribution baked in. Newsrooms and classrooms embed living views, not screenshots.
**NEEDS** docs page + copy affordance · **EFFORT** S · **IMPACT** 3

## 9. The Data API (that already exists)
Document the raw GitHub endpoints for every staging file as a stable, versioned data
API. A page of `curl` one-liners. Zero infrastructure; total legitimacy.
**NEEDS** repo public + one docs page · **EFFORT** S · **IMPACT** 4

## 10. The Print Atlas
A multi-sheet PDF export: cover manifesto, Sheet 1 US, Sheet 2 World, one plate per
layer with its essay, the findings page with methods. The survey as a physical object
— the thing a stranger keeps.
**NEEDS** print composition pass · **EFFORT** L · **IMPACT** 4

## 11. Sound Solos & The Score
AUDIO gains a solo affordance per layer (listen to grief alone) and a "play the
reading" mode where camera flights carry the mix. The era scrubber with sound on is
already 5,000 years of music; name it and let people find it.
**NEEDS** small audio UI pass · **EFFORT** S · **IMPACT** 3

## 12. Random Plunge
One key (`?`): teleport to a high-signal somewhere — a Superfund town, the densest
UFO county, a devil-named canyon — with its tooltip pinned. Serendipity as a feature;
the survey's slot machine.
**NEEDS** curated target pool (auto from data) · **EFFORT** S · **IMPACT** 3

## 13. Classroom Packet
A teacher-facing page: three guided readings, five dossier prompts, the methods sheet,
and worksheet questions keyed to findings (including *why the spurious card exists* —
the epistemics lesson is the best lesson in the survey).
**NEEDS** one docs page · **EFFORT** S · **IMPACT** 3

## 14. The Living Log
Surface the survey log as a first-class page fed by git history: every refresh, every
retired finding, every correction — the survey's memory of itself, in public.
**NEEDS** log generator at build · **EFFORT** S · **IMPACT** 3

---

## PRIORITY MATRIX

| Feature | Effort | Impact | Depends on |
|---|---|---|---|
| Entity Lenses | M | 5 | registry filters |
| Citizen Readings | M/L | 5 | hash codec v2 |
| Star Bios | M | 4 | one Wikidata pass |
| Dossier Diff | S/M | 4 | — |
| Time Everywhere | M | 4 | era machinery (exists) |
| Constellations | M | 4 | arc renderer (shared w/ flows) |
| Data API page | S | 4 | repo public |
| Print Atlas | L | 4 | — |
| Pins & Notes | S | 3 | hash codec v2 |
| Embed Kit | S | 3 | — |
| Sound Solos | S | 3 | — |
| Random Plunge | S | 3 | — |
| Classroom Packet | S | 3 | — |
| Living Log | S | 3 | — |

Suggested v0.5 experience slate: **Entity Lenses + Star Bios + Dossier Diff**
(alongside the Next Five data acquisitions), with Citizen Readings as the v0.6 tentpole.

---

## THE EXPANDED CANON
*Readings and findings the wantlist unlocks — titles as promises.*

- **The Great Sorting** — migration flows; who leaves, who arrives, what it costs (with the U-Haul asymmetry as the price tag)
- **The Ledger of Betrayals** — a tour of the ten great municipal frauds, Dixon first
- **The Empty Chair** — living-alone density against the despair heat, handled gently
- **The Arsenal and the Altar** — gun dealers against adherence, county by county
- **The Watchtower** — surveillance tech against incarceration
- **The Long Checkout** — dollar-store density against grocery deserts
- **The Price of Staying** — evictions against medical debt
- **Twenty Years Apart** — USALEEP life expectancy: the finding that two tracts in one city can differ by two decades
- **Where the Wild Things Are Seen** — bigfoot country against the dark-sky map
- **The Quiet** — the soundscape raster against loneliness
- **Last Address** — the unclaimed dead, and who claims them
- **Company Town, Twice** — F500 thrones over abandoned mines and brownfields
- **The Youngest Wounds** — school shootings against child poverty, protocol-bound
- **Terminal Culture** — dead malls against the fulfillment bloodstream
- **The Kindness Ledger** — charitable giving against medical crowdfunding
- **The Nones and the Neons** — the unchurched belt against the casinos
- **What the State Sees** — the surveilled square, solo, at night
- **The Redemption of the Pending Slot** — WARN, finally live, and what it shows

Each canon entry, when built, follows the standing law: computed honestly, reviewed by
hand, disclaimed as *where, not why*, and retired visibly if a refresh unmakes it.
