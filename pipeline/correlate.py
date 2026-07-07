#!/usr/bin/env python3
"""THE SOUL SURVEY — the Correlator.
Build-time spatial statistics across layers. Emits candidate findings to stdout
for hand review. Descriptive only: WHERE, not WHY.
"""
import json, math, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def p(*parts): return os.path.join(ROOT, *parts)
def load(fp):
    with open(fp, encoding="utf-8") as f: return json.load(f)

def hav(la1, lo1, la2, lo2):
    R = 6371.0
    dla, dlo = math.radians(la2-la1), math.radians(lo2-lo1)
    a = math.sin(dla/2)**2 + math.cos(math.radians(la1))*math.cos(math.radians(la2))*math.sin(dlo/2)**2
    return R*2*math.asin(math.sqrt(a))

def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs)/n, sum(ys)/n
    num = sum((x-mx)*(y-my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x-mx)**2 for x in xs))
    dy = math.sqrt(sum((y-my)**2 for y in ys))
    return num/(dx*dy) if dx and dy else 0.0

# ---------- county centroids from TopoJSON ----------
def county_centroids():
    topo = load(p("data","ref","counties-10m.json"))
    sx, sy = topo["transform"]["scale"]; tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        pts, x, y = [], 0, 0
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x*sx+tx, y*sy+ty))
        arcs.append(pts)
    def geom_pts(g):
        out = []
        def walk_rings(rings):
            for ring in rings:
                for ai in ring:
                    out.extend(arcs[ai] if ai >= 0 else arcs[~ai])
        if g["type"] == "Polygon": walk_rings(g["arcs"])
        elif g["type"] == "MultiPolygon":
            for poly in g["arcs"]: walk_rings(poly)
        return out
    cent = {}
    for g in topo["objects"]["counties"]["geometries"]:
        pts = geom_pts(g)
        if not pts: continue
        fips = str(g["id"]).zfill(5)
        cent[fips] = (sum(q[1] for q in pts)/len(pts), sum(q[0] for q in pts)/len(pts))  # (lat, lon)
    return cent

def nearest_km(la, lo, sites):
    best = 1e9
    for sla, slo in sites:
        if abs(sla-la) > 9 or abs(slo-lo) > 11: continue
        d = hav(la, lo, sla, slo)
        if d < best: best = d
    if best > 1e8:
        for sla, slo in sites:
            d = hav(la, lo, sla, slo)
            if d < best: best = d
    return best

def main():
    cents = county_centroids()
    print(f"county centroids: {len(cents)}")

    od = load(p("data","staging","despair-overdoses.json"))
    rates = {str(r["key"]).zfill(5): r["value"] for r in od["regions"]}

    sf = load(p("data","staging","residue-superfund.json"))
    sf_sites = [(r["lat"], r["lon"]) for r in sf["records"]]

    f5 = load(p("data","staging","power-fortune500.json"))
    f5_sites = [(r["lat"], r["lon"]) for r in f5["records"]]

    ful = load(p("data","staging","motion-fulfillment.json"))
    ful_sites = [(r["lat"], r["lon"]) for r in ful["records"]]

    # ---- F1: overdose rate vs distance to nearest Superfund NPL site
    pairs = []
    for fips, rate in rates.items():
        c = cents.get(fips)
        if not c: continue
        pairs.append((rate, nearest_km(c[0], c[1], sf_sites)))
    close = [r for r, d in pairs if d <= 15]
    far   = [r for r, d in pairs if d >= 75]
    r_sf = pearson([r for r, d in pairs], [math.log1p(d) for r, d in pairs])
    print(f"\nF1 overdose vs superfund: n={len(pairs)}  mean(rate|<=15km)={sum(close)/len(close):.1f} (n={len(close)})  mean(rate|>=75km)={sum(far)/len(far):.1f} (n={len(far)})  pearson(rate, log dist)={r_sf:.3f}")

    # ---- F2: overdose rate vs distance to nearest Fortune 500 HQ
    pairs2 = []
    for fips, rate in rates.items():
        c = cents.get(fips)
        if not c: continue
        pairs2.append((rate, nearest_km(c[0], c[1], f5_sites)))
    near_money = [r for r, d in pairs2 if d <= 25]
    far_money  = [r for r, d in pairs2 if d >= 150]
    r_f5 = pearson([r for r, d in pairs2], [math.log1p(d) for r, d in pairs2])
    print(f"F2 overdose vs money: mean(rate|<=25km of F500)={sum(near_money)/len(near_money):.1f} (n={len(near_money)})  mean(rate|>=150km)={sum(far_money)/len(far_money):.1f} (n={len(far_money)})  pearson={r_f5:.3f}")

    # ---- F3: crashes near the fulfillment network
    cr = load(p("data","staging","loss-crashes.json"))
    ds = []
    for rrec in cr["records"]:
        ds.append(nearest_km(rrec["lat"], rrec["lon"], ful_sites))
    ds.sort()
    med = ds[len(ds)//2]
    w25 = sum(1 for d in ds if d <= 25)/len(ds)
    w50 = sum(1 for d in ds if d <= 50)/len(ds)
    # baseline proxy: county centroids' distance to the network
    cd = sorted(nearest_km(la, lo, ful_sites) for la, lo in cents.values())
    print(f"F3 crashes vs fulfillment: median crash->FC = {med:.1f} km | within 25km {w25*100:.1f}% | within 50km {w50*100:.1f}% | county-centroid median {cd[len(cd)//2]:.1f} km")

    # ---- F4: memory vs data centers on the 0.25 deg US grid (confounded, pair with F5)
    mem = load(p("data","staging","memory-births.json"))
    dc = load(p("data","staging","power-datacenters.json"))
    def cellkey(la, lo): return (math.floor(la/0.25), math.floor(lo/0.25))
    mcell = defaultdict(int)
    for c in mem["cells"]:
        if 24 <= c["lat"] <= 50 and -125 <= c["lon"] <= -66: mcell[cellkey(c["lat"], c["lon"])] += c["v"]
    dcell = defaultdict(int)
    for rrec in dc["records"]:
        if 24 <= rrec["lat"] <= 50 and -125 <= rrec["lon"] <= -66: dcell[cellkey(rrec["lat"], rrec["lon"])] += 1
    keys = set(mcell) | set(dcell)
    r_md = pearson([math.log1p(mcell[k]) for k in keys], [math.log1p(dcell[k]) for k in keys])
    dc_on_mem = sum(1 for k in dcell if mcell.get(k, 0) > 0)/len(dcell)
    print(f"F4 memory vs cloud: r={r_md:.3f} over {len(keys)} cells | {dc_on_mem*100:.1f}% of DC cells sit on remembered-birth cells")

    # ---- F5 (the spurious exhibit): UFO sightings vs data centers
    uf = load(p("data","staging","wonder-ufos.json"))
    ucell = defaultdict(int)
    for rrec in uf["records"]:
        if 24 <= rrec["lat"] <= 50 and -125 <= rrec["lon"] <= -66: ucell[cellkey(rrec["lat"], rrec["lon"])] += rrec.get("v", 1)
    keys2 = set(ucell) | set(dcell)
    r_ud = pearson([math.log1p(ucell[k]) for k in keys2], [math.log1p(dcell[k]) for k in keys2])
    print(f"F5 ufos vs cloud (spurious exhibit): r={r_ud:.3f} over {len(keys2)} cells")

    # ---- F6: devils sit west of angels
    om = load(p("data","staging","omen-names.json"))
    dark = sorted(r["lon"] for r in om["records"] if (r.get("meta") or {}).get("side") == "dark" and -130 <= r["lon"] <= -60)
    light = sorted(r["lon"] for r in om["records"] if (r.get("meta") or {}).get("side") != "dark" and -130 <= r["lon"] <= -60)
    print(f"F6 omen longitude: median dark {dark[len(dark)//2]:.2f} vs light {light[len(light)//2]:.2f}  (delta {abs(dark[len(dark)//2]-light[len(light)//2]):.2f} deg)")

    # ---- F7: the westward migration of memory (mean longitude per era, world)
    er = load(p("data","staging","memory-eras.json"))
    sums = [0.0]*5; ns = [0]*5
    for c in er["cells"]:
        for i, v in enumerate(c["e"]):
            if v: sums[i] += c["lon"]*v; ns[i] += v
    means = [sums[i]/ns[i] if ns[i] else 0 for i in range(5)]
    print("F7 memory mean lon per era:", [f"{m:.1f}" for m in means])

    # ---- F8: Appalachian concentration of the epidemic
    top = sorted(rates.items(), key=lambda kv: -kv[1])[:100]
    app_states = {"21", "54", "39", "51", "47"}  # KY WV OH VA TN
    share = sum(1 for f, _ in top if f[:2] in app_states)/100
    all_share = sum(1 for f in rates if f[:2] in app_states)/len(rates)
    print(f"F8 appalachia: {share*100:.0f}% of the 100 highest-rate counties are in KY/WV/OH/VA/TN vs {all_share*100:.1f}% baseline share of counties")

if __name__ == "__main__":
    main()
