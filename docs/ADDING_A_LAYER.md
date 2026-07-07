# Adding a Layer to the Soul Survey

A layer is: **a dataset with coordinates + an essay about what it says about us.**

## 1. Write the pipeline script

`pipeline/layers/<id>.py` must produce `data/staging/<id>.json`:

```jsonc
{
  "layer": "<id>",
  "retrieved": "2026-07-07",
  "sources": [{ "name": "...", "url": "...", "note": "..." }],
  // ONE of the following record shapes:
  "records": [
    { "lat": 34.05, "lon": -118.24, "v": 1, "name": "optional", "meta": {} }   // point layer
  ],
  "regions": [
    { "key": "US-CA", "value": 41.2, "label": "top term / display value" }     // tint layer
  ],
  // For massive datasets (>100k points): pre-aggregate to cells
  "cells": [
    { "lat": 48.75, "lon": 2.25, "v": 1240, "top": ["Voltaire", "..."] }
  ]
}
```

Also write `data/staging/<id>.provenance.json`: methodology, record counts, caveats,
fallbacks used. **Never fabricate records.** If a source is unreachable, use a named
fallback or mark the layer `"status": "pending"` and stop.

## 2. Register it

Add an entry to `registry/registry.json`: id, title, theme, accent (hex), scopes
(`us` / `world`), forms (points / contours / tint), weight (contribution to the
composite terrain), unit, essay (`what`, `how`, `why`), stats, sources, status `live`.

## 3. Build

```
python3 pipeline/build.py
```

This quantizes coordinates, computes counts, packs `data/layers/<id>.json`, and bakes
everything into `dist/index.html`. The engine picks up the new layer automatically:
it appears in the layer rail, participates in the composite terrain per its weight,
and gets a plate (deep-dive panel) generated from its registry entry.

## Design contract

- Accent colors should be luminous on near-black (`#0a0d12`). Test overlap blending.
- `weight` controls how much the layer raises the composite terrain. Tint layers use 0.
- Essays are three short movements: **What** (the data, plainly), **How** (method,
  source, caveats), **Why** (the soul reading — earned, not purple).
