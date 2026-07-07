# Data Sources & Licenses

| Layer | Source | License / Terms | Notes |
|---|---|---|---|
| memory-births | Laouenan et al., "A cross-verified database of notable people, 3500BC–2018AD", *Scientific Data* (2022), via Sciences Po dataverse (doi:10.21410/7E4/RDAG3O) | **CC-BY-SA 4.0** (share-alike) | 2,291,817 records streamed; aggregated to 0.25° cells; MD5-verified download |
| desire-searches | Pornhub Insights "2025 Year in Review" — official state infographic read via archive; cross-checked against independent press (Advocate, UNILAD, NY Post syndication) | Published facts, attributed | Text terms only; 22 states carry no data because Pornhub blocks access there |
| power-datacenters | OpenStreetMap contributors (telecom/building=data_center via Overpass), plus 98 records from the Brockovich data-center accountability map | **ODbL** — attribution required | © OpenStreetMap contributors; Brockovich entries carry per-record citations |
| power-fortune500 | Fortune 500 (2025 list, FY2024 revenue) via fortune.com's published ranking data; coordinates via GeoNames | Published facts; GeoNames CC-BY 4.0 | 500/500 geocoded, 100% revenue coverage |
| motion-fulfillment | fba.wiki "Locations of Amazon Warehouses in USA" (verified FBA shipment-routing codes). MWPVL International withdrew its public tables and was not scraped. | Scraped facts, attributed | 314 active facilities; sqft unavailable from this source |
| loss-crashes | NHTSA FARS 2023 national accident file | US public domain | 129 unlocatable crashes (136 deaths) excluded and disclosed |
| omen-names | USGS Geographic Names Information System (Domestic Names) | US public domain | Word-boundary match over 981,698 names; natural features + settlements only |
| wonder-ufos | NUFORC sighting reports via the long-circulating community geocoded corpus (planetsig/ufo-reports, consolidated 2014-06-30, checksum-verified) | Community conversion of self-submitted reports; NUFORC's own ToS discourages scraping — corpus provenance disclosed, not hidden | 80,331 reports, 1906–2014; city-centroid geocodes |
| despair-overdoses | CDC NCIPC "Mapping Injury, Overdose, and Violence — County" (Socrata psx4-wq38), Intent=Drug_OD, CY2024 | US public data | Crude rates per 100k; ~47% of counties Bayesian-modeled by CDC; 129 suppressed counties excluded |
| residue-superfund | EPA "Superfund NPL Sites with Status Information" ArcGIS feature service | US public data | 1,840 sites: 1,343 final · 460 deleted · 37 proposed; 100% coordinate coverage |
| memory-eras | Same cross-verified database (Laouenan et al.) re-aggregated into five era buckets | **CC-BY-SA 4.0** | Grand total matches memory-births exactly (1,704,189) |
| loss-layoffs | — pending — | — | Standardized WARN sources are paywalled/gated; layer intentionally empty |
| basemaps | Natural Earth via world-atlas / us-atlas (TopoJSON) | Public domain | |
| geocoding ref | GeoNames cities500 | CC-BY 4.0 | `data/ref/world_places.csv` is regenerable and excluded from the repo |
| engine | d3 v7 (ISC), topojson-client (ISC) — vendored | ISC | |

**Distribution notes:** keep OSM (ODbL), GeoNames (CC-BY), and Laouenan et al. (CC-BY-SA)
attribution visible — the site's About/Sources panel does this. The memory layer's
share-alike term applies to that dataset's derived aggregates. Every staging file ships
with a `.provenance.json` documenting methodology, counts, and caveats.
