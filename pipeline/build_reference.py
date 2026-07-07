#!/usr/bin/env python3
"""Bake the geographic reference gazetteer from GeoNames cities500.
Output: data/ref/places_baked.json
  us:    [[name, state, lat, lon, pop, cap], ...]  cap: 1 = state capital / DC
  world: [[name, cc, lat, lon, pop, cap], ...]     cap: 1 = national capital
Compact, population-sorted, ~120KB. GeoNames CC-BY 4.0.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/tmp/cities500.txt"
US_TOP = 2000
WORLD_TOP = 650

us, world = [], []
with open(SRC, encoding="utf-8") as f:
    for line in f:
        p = line.rstrip("\n").split("\t")
        if len(p) < 15: continue
        name, lat, lon, fcode, cc, admin1, pop = p[1], p[4], p[5], p[7], p[8], p[10], p[14]
        try:
            latf, lonf, popi = round(float(lat), 3), round(float(lon), 3), int(pop or 0)
        except: continue
        if len(name) > 28: name = name[:27] + "…"
        if cc == "US":
            cap = 1 if fcode in ("PPLA", "PPLC") else 0   # state capitals + DC
            us.append([name, admin1, latf, lonf, popi, cap])
        else:
            cap = 1 if fcode == "PPLC" else 0
            world.append([name, cc, latf, lonf, popi, cap])

us.sort(key=lambda r: (-r[5], -r[4]))       # capitals first block, then by pop
caps_us = [r for r in us if r[5] == 1]
rest_us = sorted([r for r in us if r[5] == 0], key=lambda r: -r[4])[:US_TOP]
us_out = sorted(caps_us + rest_us, key=lambda r: -r[4])

caps_w = [r for r in world if r[5] == 1]
rest_w = sorted([r for r in world if r[5] == 0], key=lambda r: -r[4])[:WORLD_TOP]
world_out = sorted(caps_w + rest_w, key=lambda r: -r[4])

out = {"license": "GeoNames cities500 — CC-BY 4.0", "us": us_out, "world": world_out}
dst = os.path.join(ROOT, "data", "ref", "places_baked.json")
with open(dst, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
print(f"us: {len(us_out)} (capitals {len(caps_us)}) | world: {len(world_out)} (capitals {len(caps_w)}) | {os.path.getsize(dst)//1024} KB")
