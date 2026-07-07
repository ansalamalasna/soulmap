# Contributing to THE SOUL SURVEY

The survey is built to grow. A layer is: **a real dataset with coordinates + an essay
about what it says about us.** If you can supply both, you can add an instrument.

## Propose a layer

Start with [docs/WANTLIST.md](docs/WANTLIST.md) — the survey's standing wishlist,
organized by soul question with an ethics protocol that binds every acquisition.
If your idea is on it, claim it in an issue; if it isn't, argue for the question
it answers.

Open an issue with the **Layer proposal** template. A good proposal answers:

1. **WHAT** — what is the dataset, plainly? What does one point/region represent?
2. **SOURCE** — a named, reachable, citable source with a license you can state.
   No scraped-and-laundered data; no fabricated records, ever. If the best source
   is gated, say so — gated layers ship as visible `PENDING` slots, not fakes.
3. **WHY** — one honest paragraph on what the layer reveals. If the answer is only
   "population density again," see the Findings page's spurious card and reconsider.

## Build a layer

1. Write `pipeline/layers/<id>.py` (or a scratch script) that emits
   `data/staging/<id>.json` and `data/staging/<id>.provenance.json`
   (see [docs/ADDING_A_LAYER.md](docs/ADDING_A_LAYER.md) for schemas).
2. Add a registry entry in `registry/registry.json`: id, title, theme, accent,
   scopes, forms, weight, unit, statline, caveat, and the what/how/why essay.
3. `python3 pipeline/build.py` — the engine picks it up automatically: rail chip,
   plate, terrain contribution, statline, audio voice (add one in `app.js` if you
   want it to sing), and eligibility for readings and findings.

## Rules that keep the survey honest

- **No fabricated records.** Every point traces to a named source with a retrieval date.
- **Provenance ships.** The `.provenance.json` is part of the layer, not optional.
- **Caveats are content.** Every plate carries a FIELD NOTE naming the layer's biases.
- **Findings are descriptive.** New correlations go through `pipeline/correlate.py`,
  get hand-reviewed, and carry the where-not-why disclaimer. The spurious exhibit stays.
- **Page-weight ceiling: 8 MB.** The built page must stay a single self-contained file
  under 8 MB with zero runtime network calls. Aggregate aggressively (cells, not rows)
  — the memory layer compresses 1.7M births into 41.5k cells; yours can too.
