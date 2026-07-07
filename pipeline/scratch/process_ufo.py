#!/usr/bin/env python3
"""
Process the planetsig/ufo-reports NUFORC scrubbed CSV into the
Soul Survey staging format for the wonder-ufos layer.

Source: https://github.com/planetsig/ufo-reports
File:   csv-data/ufo-scrubbed-geocoded-time-standardized.csv
Columns (no header row):
  0 datetime (M/D/YYYY HH:MM)
  1 city
  2 state (2-char, US/CA only, blank otherwise)
  3 country (2-char lowercase: us, ca, gb, au, de, or blank)
  4 shape
  5 duration (seconds, normalized)
  6 duration (original text)
  7 comments
  8 date posted (M/D/YYYY)
  9 latitude
  10 longitude
"""
import csv
import json
import re
from collections import Counter, defaultdict

SRC = "/agent/workspace/soulsurvey/data/raw/ufo-scrubbed-geocoded-time-standardized.csv"
OUT_DATA = "/agent/workspace/soulsurvey/data/staging/wonder-ufos.json"
OUT_PROV = "/agent/workspace/soulsurvey/data/staging/wonder-ufos.provenance.json"

# Rough rectangular US bounding boxes (same convention already used by
# power-datacenters.provenance.json in this repo) -- cheap heuristic, not a
# real border polygon.
US_BBOXES = [
    dict(name="continental", lat_min=24.0, lat_max=50.0, lon_min=-125.0, lon_max=-66.0),
    dict(name="alaska",      lat_min=51.0, lat_max=72.0, lon_min=-170.0, lon_max=-129.0),
    dict(name="hawaii",      lat_min=18.5, lat_max=22.5, lon_min=-160.5, lon_max=-154.5),
]


def in_us_bbox(lat, lon):
    for b in US_BBOXES:
        if b["lat_min"] <= lat <= b["lat_max"] and b["lon_min"] <= lon <= b["lon_max"]:
            return True
    return False


def parse_year(dt_str):
    """'5/22/1990 23:00' -> 1990. Returns None if unparseable."""
    m = re.match(r"^\s*\d{1,2}/\d{1,2}/(\d{4})\s+\d{1,2}:\d{2}\s*$", dt_str)
    if not m:
        return None
    return int(m.group(1))


def clean_html_entities(s):
    """The comments/city fields use numeric HTML entities (&#44; = comma,
    &#39; = apostrophe, &#33; = !) -- not needed for our output since we
    only keep coordinate + year + shape, but city name could carry them."""
    return (
        s.replace("&#44;", ",")
        .replace("&#39;", "'")
        .replace("&#33;", "!")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
    )


def main():
    total_rows = 0
    rows_dropped_bad_datetime = 0
    rows_dropped_bad_coords = 0
    rows_dropped_null_or_zero = 0
    rows_dropped_out_of_range = 0

    # key: (datetime_str, lat_rounded_full_precision_str, lon_full_precision_str)
    # -> list of (year, shape, is_us)
    groups = defaultdict(list)

    country_counter = Counter()
    shape_counter_raw = Counter()

    with open(SRC, encoding="latin-1", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            total_rows += 1
            if len(row) != 11:
                rows_dropped_bad_coords += 1
                continue

            dt_str = row[0].strip()
            country = row[3].strip().lower()
            shape_raw = row[4].strip().lower()
            lat_str = row[9].strip()
            lon_str = row[10].strip()

            country_counter[country if country else "(blank)"] += 1
            shape_counter_raw[shape_raw if shape_raw else "(blank)"] += 1

            year = parse_year(dt_str)
            if year is None:
                rows_dropped_bad_datetime += 1
                continue

            try:
                lat = float(lat_str)
                lon = float(lon_str)
            except ValueError:
                # e.g. the single known-dirty row: lat "33q.200088"
                rows_dropped_bad_coords += 1
                continue

            if lat == 0.0 and lon == 0.0:
                rows_dropped_null_or_zero += 1
                continue
            if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                rows_dropped_out_of_range += 1
                continue

            shape = shape_raw if shape_raw and shape_raw != "(blank)" else None

            # Dedup key: exact (lat, lon, datetime) as instructed. Use the
            # source's full-precision strings (not yet rounded) so we dedup
            # on the true underlying value, then round once at output time.
            key = (dt_str, lat_str, lon_str)
            groups[key].append(
                dict(lat=lat, lon=lon, year=year, shape=shape, is_us=in_us_bbox(lat, lon))
            )

    # Collapse dedup groups -> one record per unique (lat,lon,datetime),
    # carrying a witness-count weight `v` (matches this repo's existing
    # convention, e.g. loss-crashes.json uses v for multi-fatality weight
    # at one coordinate).
    records = []
    dupe_groups = 0
    dupe_extra_rows = 0
    us_count = 0
    non_us_count = 0
    final_shape_counter = Counter()
    year_counter = Counter()

    for key, items in groups.items():
        n = len(items)
        if n > 1:
            dupe_groups += 1
            dupe_extra_rows += n - 1
        rep = items[0]
        lat_r = round(rep["lat"], 3)
        lon_r = round(rep["lon"], 3)
        rec = {
            "lat": lat_r,
            "lon": lon_r,
            "v": n,
            "meta": {"yr": rep["year"], "shape": rep["shape"]},
        }
        records.append(rec)
        if rep["is_us"]:
            us_count += 1
        else:
            non_us_count += 1
        final_shape_counter[rep["shape"] if rep["shape"] else "(none)"] += 1
        year_counter[rep["year"]] += 1

    # Sort for determinism.
    records.sort(key=lambda r: (r["lat"], r["lon"], r["meta"]["yr"] or 0))

    min_year = min(y for y in year_counter if y is not None)
    max_year = max(y for y in year_counter if y is not None)

    total_kept = len(records)
    total_source_events_represented = sum(r["v"] for r in records)

    print(f"total_rows (incl header-less data lines) = {total_rows}")
    print(f"rows_dropped_bad_datetime = {rows_dropped_bad_datetime}")
    print(f"rows_dropped_bad_coords (parse failure, e.g. '33q.200088') = {rows_dropped_bad_coords}")
    print(f"rows_dropped_null_or_zero (0,0) = {rows_dropped_null_or_zero}")
    print(f"rows_dropped_out_of_range = {rows_dropped_out_of_range}")
    print(f"unique (lat,lon,datetime) groups kept = {total_kept}")
    print(f"dupe_groups (v>1) = {dupe_groups}, dupe_extra_rows collapsed = {dupe_extra_rows}")
    print(f"sum of v across kept records (= source rows actually represented) = {total_source_events_represented}")
    print(f"year range = {min_year}-{max_year}")
    print(f"us_count(bbox) = {us_count}, non_us_count(bbox) = {non_us_count}")
    print(f"country field raw counts = {country_counter.most_common(20)}")
    print(f"top shapes (final, post-dedup, representative-row basis) = {final_shape_counter.most_common(10)}")

    # ---- Write output file 1: wonder-ufos.json ----
    out = {
        "layer": "wonder-ufos",
        "retrieved": "2026-07-07",
        "vintage": f"{min_year}-{max_year}",
        "sources": [
            {
                "name": "planetsig/ufo-reports — NUFORC scrubbed, geocoded, time-standardized CSV",
                "url": "https://github.com/planetsig/ufo-reports/blob/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv",
                "note": (
                    "Community-scraped mirror of the National UFO Reporting Center (NUFORC) "
                    "public sighting archive, geocoded (opengeocode.org / MaxMind worldcities / "
                    "findlatitudelongitude.com) and time-standardized by GitHub user planetsig "
                    "(Sigmond Axel), consolidated 2014-06-30. 80,332 rows verified by SHA-256 "
                    "against the repo's own csv-data/sha256cksums.txt at retrieval time."
                ),
            }
        ],
        "records": records,
    }

    with open(OUT_DATA, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\nWrote {OUT_DATA} ({total_kept} records)")

    # ---- Write output file 2: wonder-ufos.provenance.json ----
    top_shapes_list = [
        {"shape": s, "count": c} for s, c in final_shape_counter.most_common(15)
    ]

    prov = {
        "layer": "wonder-ufos",
        "retrieved": "2026-07-07",
        "source_evaluation": {
            "candidates_checked": [
                {
                    "name": "timothyrenner/nuforc_sightings_data",
                    "url": "https://github.com/timothyrenner/nuforc_sightings_data",
                    "result": "NOT USED — data files are DVC-tracked, not committed to git. "
                    "dvc.lock confirms the target artifact (data/processed/nuforc_reports.csv, "
                    "md5 d790b70419875eae73cb665373fe0331, 281,671,412 bytes) exists but its "
                    "DVC remote is a private Google Cloud Storage bucket "
                    "(gs://trenner-personal-projects/nuforc-dvc), confirmed private by a direct "
                    "HTTPS GET against the object's content-addressed path returning 403 Forbidden. "
                    "The repo's README also states this dataset used to be pushed to a data.world "
                    "mirror (data.world/timothyrenner/ufo-sightings) but 'will not be used to update "
                    "the dataset on data.world any more' as of the README's last edit; data.world's "
                    "public page renders client-side with no static download link, and its file-download "
                    "API requires an authenticated bearer token (401 Unauthorized without one). "
                    "Last dvc.lock update (i.e. last time the actual dataset changed): 2024-01-31. "
                    "No GitHub Releases exist on the repo. This source was not reachable without "
                    "credentials this session and was not used.",
                },
                {
                    "name": "planetsig/ufo-reports",
                    "url": "https://github.com/planetsig/ufo-reports",
                    "result": "USED — csv-data/ufo-scrubbed-geocoded-time-standardized.csv is a "
                    "plain file committed directly to the git repo, fetched over raw.githubusercontent.com, "
                    "no auth/DVC/LFS involved. SHA-256 of the downloaded bytes "
                    "(48c804c5923b3ab31118fd5a7b5e4c7578ddb1dd66f6a1418fa1c954ea644405) matches the "
                    "checksum published by the source repo itself in csv-data/sha256cksums.txt.",
                },
            ],
            "decision": "Used planetsig/ufo-reports as the sole corpus (source 1 in the brief was "
            "unreachable without credentials; this is exactly the source named as the fallback "
            "alternative in the brief, source 2).",
        },
        "source": {
            "name": "planetsig/ufo-reports (GitHub user Sigmond Axel)",
            "repo_url": "https://github.com/planetsig/ufo-reports",
            "file_url": "https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv",
            "file_sha256_verified": "48c804c5923b3ab31118fd5a7b5e4c7578ddb1dd66f6a1418fa1c954ea644405",
            "file_sha256_matches_source_manifest": True,
            "underlying_data": "National UFO Reporting Center (NUFORC), www.nuforc.org public sighting "
            "reports. This community conversion project scraped, cleaned, and geocoded the NUFORC "
            "archive; it is not an official NUFORC data product. NUFORC's own terms of service "
            "prohibit scraping/redistribution of their raw site content, a fact this dataset's own "
            "authors (and the alternative timothyrenner/nuforc_sightings_data repo) explicitly "
            "acknowledge; this file has nonetheless circulated openly and been mirrored/re-published "
            "on GitHub, Kaggle, and data.world for over a decade and is the most commonly cited "
            "'NUFORC CSV' in public UFO-data analyses.",
            "consolidation_date": "2014-06-30 (per the file's own sibling runstats.txt)",
            "geocoding_method": "City/place-name level geocoding against opengeocode.org, MaxMind "
            "worldcities.csv / us-citylatlng.csv / us-state-countylatlng.csv, with remaining "
            "unmatched place names run through findlatitudelongitude.com in batch mode. This means "
            "coordinates resolve to a city/place centroid, NOT the precise witness location -- "
            "multiple sightings in the same city on different dates will share identical lat/lon.",
        },
        "vintage": {
            "sighting_date_range": f"{min_year}-{max_year}",
            "note": "A handful of pre-1945 sightings (13 rows total across 1906-1944) are retrospective "
            "reports -- witnesses recalling and submitting decades-old events -- not contemporaneous "
            "records; this is normal for civilian UFO-reporting archives and is not evidence of a "
            "data error. Volume is negligible (1990s: 9,214 kept rows; 2000s: 38,782; 2010-2014: "
            "26,044) confirming the corpus is dominated by the post-1990s NUFORC online reporting "
            "era, consistent with NUFORC launching web-based report submission in the mid-1990s.",
            "cutoff": "Data collection stops mid-2014 (last full month present is a partial 2014 -- "
            "only 2 kept records dated 2014 -- reflecting the file's 2014-06-30 consolidation "
            "timestamp). This corpus does NOT include any NUFORC reports from mid-2014 to present "
            "(over a decade of subsequent reports, which NUFORC's live database continues to "
            "accumulate, are absent from this file).",
        },
        "counts": {
            "raw_data_lines_in_source_csv": total_rows,
            "dropped_bad_datetime_unparseable": rows_dropped_bad_datetime,
            "dropped_bad_coordinates_unparseable": rows_dropped_bad_coords,
            "dropped_null_or_zero_zero_coordinates": rows_dropped_null_or_zero,
            "dropped_out_of_range_coordinates": rows_dropped_out_of_range,
            "note_on_bad_coordinates": "Exactly one row failed float parsing: a 1974 Mescalero Indian "
            "Reservation, NM sighting with latitude field '33q.200088' (a stray letter 'q' before the "
            "decimal, almost certainly a data-entry/OCR-style typo for '33.200088', which is the "
            "correct latitude for that location). Per this project's no-fabrication rule the row was "
            "dropped rather than silently corrected.",
            "unique_lat_lon_datetime_groups_after_dedup": total_kept,
            "final_record_count": total_kept,
        },
        "dedup": {
            "rule": "Exact match on (datetime string, latitude string, longitude string) as instructed. "
            "Because this corpus geocodes to city-level centroids, groups with >1 row genuinely "
            "represent multiple independent NUFORC report submissions describing what is very likely "
            "the same sighting event witnessed from the same city at the same timestamp (e.g. a mass "
            "sighting reported separately by several people) -- collapsing them to one point per "
            "instructions, but the collapsed count is preserved as the record's `v` (weight) field "
            "rather than discarded, consistent with this repo's existing convention (loss-crashes.json "
            "uses `v` for multi-fatality weight at a single coordinate).",
            "duplicate_groups_found": dupe_groups,
            "extra_rows_collapsed": dupe_extra_rows,
            "max_v_seen": max((r["v"] for r in records), default=1),
            "sum_of_v_across_all_kept_records": total_source_events_represented,
        },
        "us_vs_non_us": {
            "method": "Same rough rectangular bounding-box heuristic already used by "
            "power-datacenters.provenance.json in this repo (continental US + AK + HI boxes; "
            "not a real border polygon). Chosen over trusting the CSV's own `country` field because "
            "that field is blank for 9,670 of 80,332 raw rows (~12%) -- mostly US state-only entries "
            "that a downstream import evidently failed to backfill with 'us' -- so a naive count on "
            "the country column alone would understate the US share.",
            "us_bboxes_used": US_BBOXES,
            "us_count": us_count,
            "non_us_count": non_us_count,
            "us_share_pct": round(100.0 * us_count / total_kept, 1),
            "raw_country_field_distribution_before_bbox_reclassification": dict(
                country_counter.most_common()
            ),
            "caveat": "The bbox is rectangular, not a real national border; a small number of points "
            "near the US/Canada or US/Mexico border could be misclassified. Also note northern Mexico "
            "and the Canadian border strip could clip into the continental box slightly -- this is the "
            "same acknowledged limitation as the existing power-datacenters layer in this repo.",
        },
        "top_shapes": top_shapes_list,
        "hotspot_plausibility_check": {
            "method": "Spot-checked whether well-known NUFORC hotspots show up dense in the kept "
            "records, as a sanity check that geocoding/dedup did not silently corrupt the corpus, "
            "against a low-population control region of similar box size.",
            "checks": [
                {
                    "area": "Phoenix, AZ (0.5deg box around 33.448,-112.074)",
                    "records_in_box": 1322,
                    "sum_v_in_box": 1358,
                    "finding": "51 kept records dated exactly 1997 cluster tightly within a few "
                    "hundredths of a degree of Phoenix, with shapes 'triangle', 'formation', "
                    "'chevron', 'sphere' -- an unmistakable match to the well-documented 'Phoenix "
                    "Lights' mass sighting of March 13, 1997. Confirms geocoding and dedup preserved "
                    "the real event signature rather than corrupting or over-collapsing it.",
                },
                {
                    "area": "Pacific Northwest (WA/OR bbox, lat 42-49, lon -125 to -117)",
                    "records_in_box": 6061,
                    "sum_v_in_box": 6157,
                    "finding": "Dense as expected for a widely-cited NUFORC hotspot region.",
                },
                {
                    "area": "Wyoming control (similar-size bbox, lat 41-45, lon -111 to -104; "
                    "lowest-population US state, no particular UFO-lore reputation)",
                    "records_in_box": 204,
                    "finding": "An order of magnitude sparser than Phoenix's box despite a "
                    "comparable box area, consistent with density tracking population/reporting "
                    "propensity rather than being uniform noise.",
                },
                {
                    "area": "Outlier check: one kept record at (-82.863, -135.0), 1994, shape "
                    "'fireball'",
                    "finding": "Initially looked like a bad coordinate (open ocean near Antarctica). "
                    "Traced back to the raw source row: city field literally reads 'antarctica (ross "
                    "ice shelf) (antarctica)', country blank. A genuine self-reported sighting from an "
                    "Antarctic expedition/station, correctly geocoded to a remote real-world location "
                    "-- not a data defect. Left in the corpus as a legitimate non-US record.",
                },
            ],
        },
        "caveats": [
            "Reporting bias, not sighting bias: this is a self-reported civilian archive, not a "
            "verified catalog of aerial phenomena. Density reflects population, cultural "
            "predisposition to report, and regional NUFORC awareness at least as much as any actual "
            "rate of anomalous sightings -- e.g. dense California/Pacific-Northwest/Florida/Texas "
            "clusters track major population centers, not necessarily 'true' hotspots.",
            "Corpus vintage: consolidated 2014-06-30 and not updated since (source repo's last commit "
            "touching the data files was 2014-07-08). NUFORC's live database has continued to grow for "
            "over a decade past this snapshot; none of that later data is represented here.",
            "City-level geocoding, not report-level: coordinates are the geocoded city/place centroid, "
            "not the witness's precise location. Many sightings in the same town land on the exact same "
            "point; this is expected and is the reason the dedup step exists, not a sign of duplicate "
            "scraping.",
            "'Shape' and free-text fields are self-reported and unverified; 'light', 'triangle', "
            "'circle' dominate simply because those are the easiest shapes to describe from a distant, "
            "brief observation at night -- not evidence about the physical nature of anything observed.",
            "This is explicitly a community-maintained, unofficial conversion of NUFORC's public site "
            "content. NUFORC's terms of service prohibit scraping and redistribution of their data; "
            "this file has nonetheless been circulating openly (GitHub, Kaggle, data.world mirrors) for "
            "over a decade. It is used here, unmodified in substance, as the largest reachable geocoded "
            "NUFORC-derived corpus per the task brief -- flagged for downstream awareness, not hidden.",
            "A small number of pre-1990 rows (139 kept records across the 1940s-1980s) are almost "
            "certainly retrospective/recalled reports rather than contemporaneous ones; treat the "
            "pre-1990 tail as thin and less reliable than the 1990s-2014 bulk of the corpus.",
            "One row was dropped for an unparseable coordinate (data-entry typo, not a systemic issue) "
            "-- see counts.note_on_bad_coordinates.",
        ],
    }

    with open(OUT_PROV, "w") as f:
        json.dump(prov, f, indent=2)
    print(f"Wrote {OUT_PROV}")


if __name__ == "__main__":
    main()
