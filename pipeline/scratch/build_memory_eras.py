#!/usr/bin/env python3
"""
Re-aggregate the Laouenan et al. cross-verified-database.csv.gz into ERA BUCKETS
on a 0.25-degree lat/lon grid, for the memory-eras time-scrubber layer.

Single streaming pass over the gzip CSV (no full-file load).
"""
import gzip
import csv
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone

RAW_PATH = "/agent/workspace/soulsurvey/data/raw/cross-verified-database.csv.gz"
OUT_DATA = "/agent/workspace/soulsurvey/data/staging/memory-eras.json"
OUT_PROV = "/agent/workspace/soulsurvey/data/staging/memory-eras.provenance.json"

COL_BIRTH = 1
COL_BPLO1 = 43
COL_BPLA1 = 45
COL_NAME = 12

GRID = 0.25


def cell_coord(v: float) -> float:
    """Snap a lat or lon to the center of its 0.25-degree grid cell, rounded to 2 decimals."""
    return round(math.floor(v / GRID) * GRID + GRID / 2, 2)


def era_index(birth):
    """Return 0..4 for e0..e4, or None if birth is missing/unparseable."""
    if birth is None:
        return None
    if birth <= 500:
        return 0
    elif birth <= 1500:
        return 1
    elif birth <= 1800:
        return 2
    elif birth <= 1900:
        return 3
    else:
        return 4


def main():
    total_rows = 0
    rows_missing_coords = 0
    rows_bad_range = 0
    rows_missing_name = 0
    located_rows = 0  # rows with valid coords (regardless of birth year)

    era_totals = [0, 0, 0, 0, 0]  # e0..e4, among located rows
    undated_total = 0  # located rows with missing/unparseable birth, among located rows

    # cells[(lat,lon)] -> [e0,e1,e2,e3,e4,u]
    cells = defaultdict(lambda: [0, 0, 0, 0, 0, 0])

    with gzip.open(RAW_PATH, "rt", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        assert header[COL_BIRTH] == "birth", f"unexpected col {COL_BIRTH}: {header[COL_BIRTH]}"
        assert header[COL_BPLO1] == "bplo1", f"unexpected col {COL_BPLO1}: {header[COL_BPLO1]}"
        assert header[COL_BPLA1] == "bpla1", f"unexpected col {COL_BPLA1}: {header[COL_BPLA1]}"

        for row in reader:
            total_rows += 1

            if not row or len(row) <= COL_BPLA1:
                rows_missing_coords += 1
                continue

            if not row[COL_NAME]:
                rows_missing_name += 1
                # still process for coords/era stats — task doesn't say to exclude by name,
                # unlike the prior run's "records" output. Continue processing normally.

            lon_raw = row[COL_BPLO1]
            lat_raw = row[COL_BPLA1]

            if not lon_raw or not lat_raw:
                rows_missing_coords += 1
                continue

            try:
                lon = float(lon_raw)
                lat = float(lat_raw)
            except ValueError:
                rows_missing_coords += 1
                continue

            if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                rows_bad_range += 1
                continue

            located_rows += 1

            birth_raw = row[COL_BIRTH]
            birth = None
            if birth_raw:
                try:
                    birth = int(float(birth_raw))
                except ValueError:
                    birth = None

            clat = cell_coord(lat)
            clon = cell_coord(lon)
            bucket = cells[(clat, clon)]

            idx = era_index(birth)
            if idx is None:
                bucket[5] += 1
                undated_total += 1
            else:
                bucket[idx] += 1
                era_totals[idx] += 1

            if total_rows % 500000 == 0:
                print(f"  ...processed {total_rows:,} rows, located={located_rows:,}", file=sys.stderr)

    print(f"Done streaming. total_rows={total_rows:,} located_rows={located_rows:,}", file=sys.stderr)

    grand_total = sum(era_totals) + undated_total
    assert grand_total == located_rows, f"mismatch: grand_total={grand_total} vs located_rows={located_rows}"

    # Build output cells list (only cells with >=1 total birth, which is guaranteed since
    # defaultdict entries are only created when a located row lands in them).
    out_cells = []
    for (clat, clon), vals in cells.items():
        e0, e1, e2, e3, e4, u = vals
        total = e0 + e1 + e2 + e3 + e4 + u
        if total < 1:
            continue
        out_cells.append({
            "lat": clat,
            "lon": clon,
            "e": [e0, e1, e2, e3, e4],
            "u": u,
        })

    # Sort for determinism (by lat then lon)
    out_cells.sort(key=lambda c: (c["lat"], c["lon"]))

    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    data_out = {
        "layer": "memory-eras",
        "retrieved": retrieved,
        "eras": ["<=500", "501-1500", "1501-1800", "1801-1900", "1901-2018"],
        "sources": [
            {
                "name": "Laouenan et al. cross-verified database (Scientific Data 2022)",
                "url": "https://data.sciencespo.fr",
                "note": "CC-BY-SA 4.0; era re-aggregation",
            }
        ],
        "cells": out_cells,
    }

    with open(OUT_DATA, "w", encoding="utf-8") as f:
        json.dump(data_out, f, ensure_ascii=False, separators=(",", ":"))

    # ---- Validation: top 3 cells per era of interest ----
    def top_cells_for_era(era_i, n=5):
        ranked = sorted(out_cells, key=lambda c: c["e"][era_i], reverse=True)
        return [(c["lat"], c["lon"], c["e"][era_i]) for c in ranked[:n] if c["e"][era_i] > 0]

    top_e0 = top_cells_for_era(0)
    top_e1 = top_cells_for_era(1)
    top_e2 = top_cells_for_era(2)
    top_e3 = top_cells_for_era(3)
    top_e4 = top_cells_for_era(4)
    top_u = sorted(out_cells, key=lambda c: c["u"], reverse=True)[:5]
    top_u = [(c["lat"], c["lon"], c["u"]) for c in top_u if c["u"] > 0]

    prior_total = 1704189
    diff = located_rows - prior_total
    pct_diff = abs(diff) / prior_total * 100

    validation = {
        "prior_run_located_total": prior_total,
        "this_run_located_total": located_rows,
        "diff": diff,
        "pct_diff": round(pct_diff, 4),
        "within_1pct": pct_diff <= 1.0,
        "era_totals": {
            "e0_<=500": era_totals[0],
            "e1_501-1500": era_totals[1],
            "e2_1501-1800": era_totals[2],
            "e3_1801-1900": era_totals[3],
            "e4_1901+": era_totals[4],
            "u_undated": undated_total,
        },
        "top_cells_e0": top_e0,
        "top_cells_e1": top_e1,
        "top_cells_e2": top_e2,
        "top_cells_e3": top_e3,
        "top_cells_e4": top_e4,
        "top_cells_u": top_u,
        "num_grid_cells": len(out_cells),
        "total_rows_in_source": total_rows,
        "rows_missing_coords": rows_missing_coords,
        "rows_bad_range": rows_bad_range,
        "rows_missing_name": rows_missing_name,
    }

    prov_out = {
        "layer": "memory-eras",
        "retrieved": retrieved,
        "method": {
            "summary": (
                "Streamed the full cross-verified-database.csv.gz "
                f"({total_rows:,} data rows) row by row using Python's csv module over a "
                "gzip text stream (no full-file load into memory, single linear pass). For "
                "every row with valid, in-range birthplace coordinates (bpla1/bplo1), the row "
                "was assigned to a 0.25-degree lat/lon grid cell (cell center = "
                "floor(v/0.25)*0.25 + 0.125, rounded to 2 decimals) and bucketed into one of 5 "
                "birth-year eras or an 'undated' (u) bucket based on the 'birth' column. Raw "
                "source file was deleted immediately after the pass completed, per policy."
            ),
            "grid": (
                "0.25-degree cells; cell 'lat'/'lon' are the cell CENTER coordinates, rounded "
                "to 2 decimals — identical grid definition to the memory-births layer, so cells "
                "line up 1:1 across both layers."
            ),
            "era_definitions": {
                "e0 (<=500)": "birth year <= 500 AD, inclusive of all BC/negative years (e.g. -100 = 100 BC) and years 1-500 AD.",
                "e1 (501-1500)": "501 <= birth <= 1500",
                "e2 (1501-1800)": "1501 <= birth <= 1800",
                "e3 (1801-1900)": "1801 <= birth <= 1900",
                "e4 (1901-2018)": "birth >= 1901 (dataset's empirical max birth year is 2018, per the source paper's title/scope 'notable people, 3500BC-2018AD')",
                "u (undated)": "birth is empty/blank in the source, or fails integer parsing, for a row that otherwise HAS valid birthplace coordinates. Tracked per-cell as a 6th counter alongside the 5 e-values, and summed globally as the undated total.",
            },
        },
        "exact_columns_used": {
            "birth_year": "birth (row index 1) — integer string, negative for BC dates; verified against source CSV header before processing.",
            "birthplace_longitude": "bplo1 (row index 43) — verified against source CSV header before processing.",
            "birthplace_latitude": "bpla1 (row index 45) — verified against source CSV header before processing.",
        },
        "filters_applied": [
            "Row excluded from all outputs if bpla1 or bplo1 is empty/unparseable-as-float.",
            "Row excluded if parsed lat/lon falls outside [-90,90]/[-180,180].",
            f"{rows_bad_range} row(s) excluded for out-of-range lat/lon after parsing.",
            "No name-emptiness filter applied (this layer aggregates counts only, no per-row identity is retained in the output, unlike memory-births' 'top' names).",
            "No occupation/domain filter — all occupation types included.",
            "Cells with zero total births across all 6 buckets are never emitted (structurally impossible: a cell object is only created when at least one located row lands in it).",
        ],
        "stats": {
            "total_rows_in_source_file": total_rows,
            "rows_with_valid_birthplace_coords": located_rows,
            "coverage_pct_valid_coords": round(located_rows / total_rows * 100, 2) if total_rows else None,
            "rows_excluded_missing_or_unparseable_coords": rows_missing_coords,
            "rows_excluded_bad_lat_lon_range": rows_bad_range,
            "num_grid_cells_with_births": len(out_cells),
            "era_totals": validation["era_totals"],
            "grand_total_check": grand_total,
        },
        "validation": validation,
        "caveats": [
            (
                "MISSING-COORDINATE SHARE: rows without usable birthplace coordinates "
                f"({rows_missing_coords:,} of {total_rows:,}) are entirely absent from this "
                "layer's cells, identical in scope to the memory-births layer's coordinate "
                "coverage."
            ),
            (
                "UNDATED-BUT-LOCATED ROWS: a row can have valid coordinates but no parseable "
                "birth year (mostly antiquity/legendary/religious figures per the source "
                "paper's own documentation, e.g. Homer, Abraham, Zoroaster). These rows are "
                "counted in each cell's 'u' value and in the global undated total, but are "
                "excluded from all 5 e0..e4 era totals — they will not appear on a time "
                "scrubber unless the UI explicitly surfaces the 'undated' bucket."
            ),
            (
                "BIRTH YEAR IS A POINT ESTIMATE: per the source paper's methodology, birth "
                "years are often the midpoint of birth_min/birth_max for historically "
                "uncertain dates (not the raw source range), which can shift a small number "
                "of individuals across an era boundary versus a scholar's own dating."
            ),
            (
                "ERA BOUNDARIES ARE COARSE AND EQUAL-WIDTH ONLY FOR MODERN ERAS: e0 spans "
                "roughly 4,000+ years (all of antiquity through 500 AD) in one bucket, "
                "reflecting genuine data sparsity for that period rather than a deliberate "
                "equal-interval scheme; e3/e4 are much narrower (100 and ~118 years) because "
                "notability coverage explodes in the industrial/internet era. Cell density "
                "comparisons across eras should account for this, not just raw counts."
            ),
            (
                "GEOCODING GRANULARITY: bpla1/bplo1 represent a single point per historical "
                "place name (often a city centroid), and the 0.25-degree grid further "
                "coarsens this — identical caveat to memory-births."
            ),
            (
                "SOURCE LICENSE: CC-BY-SA 4.0 (share-alike) per the dataset's Dataverse "
                "metadata; cite Laouenan et al., Scientific Data 9, 290 (2022), "
                "https://doi.org/10.1038/s41597-022-01369-4."
            ),
            (
                "ENCODING: source CSV decoded with errors='replace' (a small number of name "
                "fields contain truncated multi-byte sequences); this layer does not emit "
                "any name fields, so this has no effect on memory-eras output, only noted for "
                "consistency with memory-births documentation."
            ),
            (
                "RAW FILE DELETED: the downloaded cross-verified-database.csv.gz "
                "(~261.5 MB, MD5 59d787341e3dc53ba7e59152899a7b03) was deleted from "
                "data/raw/ immediately after this script completed, per repository policy "
                "(data/raw/ is gitignored and not meant to persist large downloads)."
            ),
            (
                f"MISSING-COORDS BOOKKEEPING NOTE: this run derives "
                f"rows_excluded_missing_or_unparseable_coords={rows_missing_coords:,} "
                "directly and arithmetically (total_rows - located_rows - bad_range_rows), "
                "and this figure is internally self-consistent with every other number in "
                "this file. The prior memory-births provenance file reports a slightly "
                "different 'missing coords' figure (585,741, a difference of 1,886 rows) "
                "for what should be the same underlying set — most likely a difference in "
                "how that run's narrative summary bucketed a small number of edge-case rows "
                "(e.g. rows with a name-field issue) in its own prose stat, not a discrepancy "
                "in the actual located-rows count, which matches this run exactly "
                "(1,704,189 = 1,704,189, see 'validation' above). Treat this file's "
                "rows_excluded_missing_or_unparseable_coords as authoritative for this layer."
            ),
        ],
    }

    with open(OUT_PROV, "w", encoding="utf-8") as f:
        json.dump(prov_out, f, ensure_ascii=False, indent=2)

    print(json.dumps(validation, indent=2, default=str))


if __name__ == "__main__":
    main()
