#!/usr/bin/env python3
"""THE SOUL SURVEY — build script.
Packs data/staging/*.json into compact layer payloads, computes stats,
and injects registry + data + basemaps + vendored libs into a single
self-contained dist/index.html. Zero runtime network calls.
"""
import json, os, re, sys, datetime
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def p(*parts): return os.path.join(ROOT, *parts)

STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]

def load(path):
    with open(path, encoding="utf-8") as f: return json.load(f)

def rnd(x, nd=3): return round(float(x), nd)

def fmt_int(n): return f"{n:,}"

def load_staging(layer_id):
    fp = p("data","staging",f"{layer_id}.json")
    return load(fp) if os.path.exists(fp) else None

def pack_points(st, fields):
    """fields: list of (outname, fn(record)->value)"""
    out = {k: [] for k,_ in fields}
    for r in st["records"]:
        for k, fn in fields:
            out[k].append(fn(r))
    return out

def build():
    registry = load(p("registry","registry.json"))
    layers_data = {}
    for lay in registry["layers"]:
        lid = lay["id"]
        st = load_staging(lid)
        if st is None:
            lay["status"] = lay.get("status","pending")
            lay["count"] = 0
            continue
        lay["retrieved"] = st.get("retrieved","")
        lay["sources"] = st.get("sources", [])
        if lid == "memory-births":
            cells = st["cells"]
            labs = {}
            c_lat, c_lon, c_v = [], [], []
            for i, c in enumerate(cells):
                c_lat.append(rnd(c["lat"],2)); c_lon.append(rnd(c["lon"],2)); c_v.append(int(c["v"]))
                if c["v"] >= 5 and c.get("top"):
                    labs[str(i)] = c["top"][0][:48]
            stars = sorted(st["records"], key=lambda r: -(r.get("v") or 0))[:5000]
            s_pack = {
                "lat":[rnd(r["lat"]) for r in stars], "lon":[rnd(r["lon"]) for r in stars],
                "v":[rnd(r.get("v") or 0,1) for r in stars], "name":[(r.get("name") or "")[:48] for r in stars],
                "birth":[(r.get("meta") or {}).get("birth") for r in stars],
                "dom":[((r.get("meta") or {}).get("domain") or "")[:24] for r in stars]}
            total = sum(c_v)
            layers_data[lid] = {"kind":"memory","n":total,
                "cells":{"lat":c_lat,"lon":c_lon,"v":c_v,"lab":labs},"stars":s_pack}
            lay["count"] = total
            # US births approx (conus+ak+hi bbox)
            us = 0
            for la,lo,v in zip(c_lat,c_lon,c_v):
                if (24<=la<=50 and -125<=lo<=-66) or (51<=la<=72 and -170<=lo<=-129) or (18<=la<=23 and -161<=lo<=-154):
                    us += v
            lay["plateStats"].append({"label":"born in the U.S. (approx)","value":fmt_int(us)})
        elif lid == "desire-searches":
            us_map, world_map = {}, {}
            for r in st["regions"]:
                k = r["key"]
                if k.startswith("US-"):
                    us_map[k[3:]] = r["label"]
                else:
                    meta = r.get("meta") or {}
                    world_map[k] = {"label": r["label"], "country": meta.get("country", k), "kind": meta.get("kind","")}
            dark = [s for s in STATES if s not in us_map]
            layers_data[lid] = {"kind":"regions","us":us_map,"dark":dark,"world":world_map,"year":st.get("year","2025")}
            lay["count"] = len(us_map)
        elif lid == "loss-crashes":
            pk = pack_points(st, [("lat", lambda r: rnd(r["lat"])), ("lon", lambda r: rnd(r["lon"])),
                                  ("v", lambda r: int(r.get("v") or 1)), ("m", lambda r: int((r.get("meta") or {}).get("m") or 0))])
            deaths = sum(pk["v"])
            months = Counter()
            for v,m in zip(pk["v"],pk["m"]): months[m]+=v
            peak = months.most_common(1)[0] if months else (0,0)
            MN = ["","January","February","March","April","May","June","July","August","September","October","November","December"]
            layers_data[lid] = {"kind":"points","n":len(pk["lat"]),"deaths":deaths, **pk}
            lay["count"] = len(pk["lat"]); lay["deaths"] = deaths
            lay["plateStats"].append({"label":"deadliest month","value":f"{MN[peak[0]]} — {fmt_int(peak[1])} deaths"})
        elif lid == "power-datacenters":
            def nm(r):
                n = r.get("name") or (r.get("meta") or {}).get("operator") or ""
                return str(n)[:42]
            pk = pack_points(st, [("lat", lambda r: rnd(r["lat"])), ("lon", lambda r: rnd(r["lon"])), ("name", nm)])
            layers_data[lid] = {"kind":"points","n":len(pk["lat"]), **pk}
            lay["count"] = len(pk["lat"])
        elif lid == "power-fortune500":
            recs = sorted(st["records"], key=lambda r: (r.get("meta") or {}).get("rank") or 999)
            pk = {"lat":[rnd(r["lat"]) for r in recs],"lon":[rnd(r["lon"]) for r in recs],
                  "name":[r["name"][:36] for r in recs],
                  "v":[(r.get("v") if r.get("v") is not None else 0) for r in recs],
                  "rank":[(r.get("meta") or {}).get("rank") for r in recs],
                  "loc":[f"{(r.get('meta') or {}).get('city','')}, {(r.get('meta') or {}).get('state','')}" for r in recs]}
            total_rev = sum(pk["v"])
            layers_data[lid] = {"kind":"points","n":len(recs), **pk}
            lay["count"] = len(recs)
            lay["plateStats"].append({"label":"combined revenue","value":f"${total_rev/1e6:,.1f} trillion"})
        elif lid == "motion-fulfillment":
            TYPES = {"Fulfillment Center":0,"Sortation Center":1,"IXD":2,"Inbound Cross-Dock":2}
            TYPE_NAMES = ["Fulfillment Center","Sortation Center","Inbound Cross-Dock"]
            recs = st["records"]
            pk = {"lat":[rnd(r["lat"]) for r in recs],"lon":[rnd(r["lon"]) for r in recs],
                  "name":[(r.get("name") or "")[:12] for r in recs],
                  "t":[TYPES.get((r.get("meta") or {}).get("type",""),0) for r in recs],
                  "loc":[f"{(r.get('meta') or {}).get('city','')}, {(r.get('meta') or {}).get('state','')}" for r in recs]}
            states = Counter((r.get("meta") or {}).get("state","") for r in recs)
            top3 = " · ".join(f"{s} {c}" for s,c in states.most_common(3))
            layers_data[lid] = {"kind":"points","n":len(recs),"typeNames":TYPE_NAMES, **pk}
            lay["count"] = len(recs)
            lay["plateStats"].append({"label":"top states","value":top3})
        elif lid == "omen-names":
            recs = st["records"]
            pk = {"lat":[rnd(r["lat"]) for r in recs],"lon":[rnd(r["lon"]) for r in recs],
                  "name":[(r.get("name") or "")[:40] for r in recs],
                  "s":[0 if (r.get("meta") or {}).get("side")=="dark" else 1 for r in recs],
                  "cls":[((r.get("meta") or {}).get("class") or "")[:18] for r in recs],
                  "st":[((r.get("meta") or {}).get("state") or "")[:2] for r in recs]}
            dark = sum(1 for s in pk["s"] if s==0); light = len(recs)-dark
            layers_data[lid] = {"kind":"points","n":len(recs),"dark":dark,"light":light, **pk}
            lay["count"] = len(recs); lay["dark"]=dark; lay["light"]=light
        lay["status"] = "live"
        # statline
        sl = lay.get("statline","")
        sl = sl.replace("{n}", fmt_int(lay.get("count",0)))
        sl = sl.replace("{deaths}", fmt_int(lay.get("deaths",0)))
        sl = sl.replace("{dark}", fmt_int(lay.get("dark",0)))
        sl = sl.replace("{light}", fmt_int(lay.get("light",0)))
        lay["statline"] = sl

    # write packed per-layer files (repo artifacts)
    os.makedirs(p("data","layers"), exist_ok=True)
    for lid, d in layers_data.items():
        with open(p("data","layers",f"{lid}.json"),"w") as f:
            json.dump(d, f, separators=(",",":"))

    basemaps = {
        "land": load(p("data","ref","land-50m.json")),
        "countries": load(p("data","ref","countries-110m.json")),
        "states": load(p("data","ref","states-10m.json")),
        "nation": load(p("data","ref","nation-10m.json")),
    }

    def read(fp):
        with open(fp, encoding="utf-8") as f: return f.read()

    def js_safe(obj):
        s = json.dumps(obj, separators=(",",":"), ensure_ascii=False)
        return s.replace("</", "<\\/")

    html = read(p("site","template.html"))
    html = html.replace("/*{{CSS}}*/", read(p("site","styles.css")))
    html = html.replace("//{{VENDOR}}", read(p("site","vendor","d3.v7.min.js")) + "\n" + read(p("site","vendor","topojson-client.min.js")))
    html = html.replace("//{{DATA}}",
        "window.__REGISTRY__=" + js_safe(registry) + ";\n" +
        "window.__LAYERDATA__=" + js_safe(layers_data) + ";\n" +
        "window.__BASEMAPS__=" + js_safe(basemaps) + ";")
    html = html.replace("//{{APP}}", read(p("site","app.js")))

    os.makedirs(p("dist"), exist_ok=True)
    out = p("dist","index.html")
    with open(out,"w",encoding="utf-8") as f: f.write(html)
    print(f"built {out}: {os.path.getsize(out)/1e6:.2f} MB")
    for lid,d in layers_data.items():
        print(f"  {lid}: n={d.get('n', len(d.get('us',{})))}")

if __name__ == "__main__":
    build()
