# THE SOUL SURVEY

*A topographic survey of the collective soul, conducted in objective data.*

One map. Many layers. Where humanity puts its desire, its genius, its machines, and its
grief — rendered as terrain. Toggle layers on and off and watch society transform:
density becomes elevation, overlap becomes light.

## What this is

Every layer of the Survey is a strange-but-real dataset with coordinates:
where the notable dead were born, where the data centers hum, where desire points,
where the fulfillment network breathes, where the cars crashed, where the jobs vanished,
where America named its land after devils and angels.

Alone, each map is a curiosity. Stacked, they are a relief map of us.

## Architecture

```
registry/registry.json     ← the contract. every layer is one entry here.
pipeline/layers/<id>.py    ← one fetch/transform script per layer → data/staging/<id>.json
pipeline/build.py          ← packs staging → data/layers/*.json, injects everything
                             into site/index.html → dist/index.html (fully self-contained)
site/                      ← the map engine (vanilla JS + d3, canvas compositing)
data/staging/              ← clean, verified records + provenance (committed)
data/layers/               ← packed, quantized layer files (committed, build output)
dist/index.html            ← THE SURVEY. one file. zero runtime network calls.
```

Principles (do not reverse casually):

1. **Zero runtime network calls.** Basemaps, data, and libraries are baked into the
   built HTML. The map must render forever, offline, anywhere.
2. **No fabricated records.** Every point comes from a named source with a retrieval
   date. Provenance ships in `data/staging/<id>.provenance.json` and on the map itself.
3. **The registry is the only integration point.** The engine renders whatever the
   registry declares. Adding a layer never requires touching engine code.
4. **Density is elevation.** The composite terrain (hillshade + contours) is derived
   from the active layers' density fields. The map is topographic, not decorative.

## Adding a layer

See [docs/ADDING_A_LAYER.md](docs/ADDING_A_LAYER.md). Short version:
write a pipeline script that emits `data/staging/<id>.json` (points, or region values),
add a registry entry (accent color, theme, essay: what/how/why), run `python3 pipeline/build.py`.

## Provenance & licenses

See [DATA_LICENSES.md](DATA_LICENSES.md). Sources include NHTSA FARS, USGS GNIS,
OpenStreetMap (ODbL), the cross-verified database of notable people (Laouenan et al.,
*Scientific Data* 2022, CC-BY-SA), Pornhub Insights 2025 (archived official data,
press-verified), fba.wiki Amazon facility codes, Fortune's 2025 ranking, and GeoNames
(CC-BY). Every layer ships with a provenance file; one layer (WARN layoffs) is
deliberately pending rather than faked. Review licenses before distributing.
