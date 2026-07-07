# Keeping the Survey Alive — refresh playbook

The survey is a snapshot with dates on it. This is the schedule and the exact moves
for keeping those dates honest. Every refresh follows the same law: re-run the layer's
pipeline into `data/staging/`, update the provenance sidecar, rebuild, verify counts,
commit with the new vintage in the message.

## Cadence

| Layer | Source rhythm | Refresh | How |
|---|---|---|---|
| loss-crashes | NHTSA FARS releases each year's final file ~18 months later | **Yearly** (watch for FARS 2024 in late 2026) | Download `FARS{YYYY}NationalCSV.zip`, re-extract accident.csv (see loss-crashes provenance for column handling), regenerate staging |
| despair-overdoses | CDC MIOV updates monthly with rolling windows; calendar years stabilize in spring | **Yearly** (adopt CY2025 when published) | Socrata `psx4-wq38`, Intent=Drug_OD, latest calendar year; keep the crude-rate + modeled disclosure |
| residue-superfund | EPA NPL feature service updates continuously | **Quarterly** | Re-query the ArcGIS endpoint in residue-superfund provenance; statuses may move proposed→final→deleted |
| desire-searches | Pornhub Insights year-in-review lands each December | **Yearly** | Archive the official infographic, cross-check two press republications, re-map states/countries; update the dark-state list — it is legislation-driven and will change |
| power-datacenters | OSM continuously; Brockovich map episodically | **Quarterly** | Re-run Overpass query + Brockovich merge, dedup 200m |
| motion-fulfillment | fba.wiki tracks live routing codes | **Quarterly** | Re-scrape the reference table; geocode via data/ref/us_places.csv |
| power-fortune500 | Fortune publishes each June | **Yearly** | New ranking, re-geocode, keep revenue coverage at 100% |
| memory-births / memory-eras | Source database is static (2022) | **None** — re-verify MD5 on any re-download | `data.sciencespo.fr` file id 4432, MD5 59d787341e3dc53ba7e59152899a7b03 |
| omen-names | GNIS updates continuously, names rarely | **Yearly** | Re-download DomesticNames, re-run word-boundary filter |
| wonder-ufos | Corpus frozen 2014; NUFORC live DB is ToS-restricted | **Watch** for a newer open corpus; do not scrape NUFORC directly |
| loss-layoffs | WARN sources still gated | **Watch** — the slot stays PENDING until an open standardized source exists |
| reference places | GeoNames cities500, monthly dumps | **Yearly** | `python3 pipeline/build_reference.py` after re-downloading cities500 |

## The moves (any layer)

```
1. Re-run the layer's acquisition (scratch scripts in pipeline/scratch/ document the last run)
2. Diff record counts vs the provenance sidecar — investigate any swing >5%
3. Update data/staging/<id>.provenance.json (retrieved date, counts, method deltas)
4. python3 pipeline/correlate.py       # findings may shift — re-review before shipping changed cards
5. python3 pipeline/build.py           # rebuilds dist/ and docs/, merges eras + findings
6. Verify: page under 8MB, counts printed match staging, spot-check the layer on the map
7. Update the essay/plateStats in registry/registry.json if headline numbers moved
8. Commit: "refresh(<layer>): <vintage> — <count delta>" and push dist/ + docs/
```

## Findings discipline on refresh

Never ship a silently changed finding. If a refresh moves a finding's number, update the
card AND its method note, and mention it in the SURVEY LOG. If a finding stops holding,
retire the card visibly (strikethrough + note) rather than deleting it — the survey's
memory of its own corrections is part of the trust.

## Automation note

This playbook is deliberately runnable by hand. A scheduled "Surveyor" agent can run the
quarterly moves (NPL, OSM, fba.wiki) and file the yearly ones as reminders — drafted
separately when the maintainer wants it; nothing runs unattended until then.
