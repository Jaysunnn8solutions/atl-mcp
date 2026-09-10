# atl-mcp

A resource-gap screen for metro Atlanta: which census tracts have **high or rising need** and **low access** to groceries, pharmacies, clinics, and MARTA service, where the holes in coverage are, and where new sites would do the most good. An interactive map, a JSON API, and an [MCP](https://modelcontextprotocol.io) server, all computed from the same engine over the same committed data.

**Live map:** `https://atl-mcp.vercel.app`
**MCP endpoint:** `https://atl-mcp.vercel.app/mcp`

Fulton, DeKalb, and Clayton counties, by 2020 census tract. Authless and read-only.

This is the second project in a portfolio sequence. The first, [census-mcp](https://github.com/Jaysunnn8solutions/census-mcp), is a stateless tool server where the model does the orchestration. This one is an application that does its own orchestration: an offline data pipeline, a spatial analysis engine with a location-allocation solver, a map UI with scenarios, CI, and an MCP surface with tools, prompts, and resources over its own results.

---

## What it answers

> Where does need outrun access, does that pattern cluster, and what would change it?

Every tract gets three numbers and two labels:

| Output | Meaning |
|---|---|
| **Need** | Composite of poverty rate, households with no vehicle, share aged 65+, share under 18, and population growth 2019→2024. Each component is standardized; weights are adjustable. |
| **Access** | Two-step floating catchment area (2SFCA) accessibility to groceries, pharmacies, clinics, and scheduled transit, averaged after standardizing. Transit supply is weighted by weekday trips per hour. |
| **Gap** | Need minus access, in z-score units. |
| **Class** | Tertile of need × tertile of access. `N3A1` (top-third need, bottom-third access) is the priority cell. |
| **Cluster** | Local Moran's I on the gap: high-gap cluster, low-gap cluster, outlier, or not significant. |

On top of that: **coverage** (who is outside every catchment, grouped into contiguous holes), **site selection** (the k new sites that cover the most uncovered need), **what-if scenarios** (drop a facility, see the access index recompute), **similarity** (tracts that look alike, or look alike but do better), and **visit routing**.

It is a screening tool. It surfaces candidates for closer study; it does not establish that a tract needs a particular intervention.

---

## The map

- Seven layers: gap, need, access, growth, clusters, coverage, and (with a scenario) change in access.
- Place search for neighbourhoods, addresses, landmarks and stations.
- Scenario mode: pick a supply type and click the map to place a hypothetical facility, or ask the solver to suggest sites. Every layer and the summary recompute against the scenario.
- Coverage mode: choose a supply type (and a minimum service frequency for transit), see the holes ranked by population, click one to fly to it.
- Adjustable catchment radius, distance decay, and need weights.
- The URL hash carries the whole view, so any state can be shared as a link. CSV and GeoJSON export of the current results.

---

## Try the MCP server

**Claude (web or desktop):** Settings → Connectors → Add custom connector → paste the endpoint URL. Leave the OAuth fields empty.

**Claude Code:**

```bash
claude mcp add --transport http atl https://atl-mcp.vercel.app/mcp
```

Then ask something like *"Where are the biggest gaps in clinic coverage, and where should the next three go?"*

### Tools

| Tool | Purpose |
|---|---|
| `describe_analysis` | Method, data vintages, and headline counts. Call first. |
| `find_priority_tracts` | Rank tracts by gap; filter by county or the priority cell. |
| `get_tract` | Full profile for one GEOID: both vintages, growth, scores with components, what is within the catchment. |
| `tracts_near` | Tracts around a MARTA rail station or a lon/lat point. |
| `search_place` | Geocode a neighbourhood, address or landmark, then list the tracts around it. |
| `compare_counties` | County-level rollup of need, access, priority tracts, and clusters. |
| `find_similar` | Nearest neighbours in feature space. Exclude bordering tracts to find peers; require an access advantage to find benchmarks. |
| `coverage_gaps` | Population outside every catchment for one supply type, as ranked contiguous holes. |
| `site_selection` | Maximal covering location problem: the k sites that cover the most uncovered (need-weighted) population. |
| `what_if` | Recompute everything with facilities added or removed; report what changed. |
| `plan_visit` | Shortest visiting order over a set of tracts from a station or point. |

Every analysis tool accepts the same optional parameters as the map (catchment radius, distance decay, need weights), and the coverage and site tools accept scenario additions, so a model can chain "find the holes → propose sites → test them" with consistent assumptions.

### Prompts and resources

Three prompts package multi-tool workflows: `brief_tract` (a one-page brief on a tract), `county_comparison`, and `site_plan` (holes → sites → what-if). Two resources expose the data manifest (`atl://data/manifest`) and the method (`atl://method`) for context.

---

## Method

**Need.** Five inputs from the ACS 5-year estimates. Poverty and no-vehicle rates are the classic markers of households that cannot substitute distance with driving. Age shares capture populations with higher service dependence. Growth is the forward-looking term: a tract adding population is one where today's supply is being stretched. Each is z-scored across the 600 tracts; a null input contributes zero so a tract is neither rewarded nor punished for a suppressed estimate. The composite is a weighted mean.

**Access.** 2SFCA is a standard measure from health geography that accounts for competition, not just proximity. Step one: each supply point (a store, a stop) computes capacity divided by the population within its catchment. Step two: each tract sums the ratios of every supply point that reaches it. A grocery surrounded by 50,000 people counts for less than one surrounded by 5,000. The enhanced variant swaps the hard cutoff for Gaussian decay, so nearer supply counts more. Transit stops carry capacity equal to their scheduled weekday trips per hour, so "near a station" becomes "near frequent service." Accessibility is log-transformed before standardizing because it is heavily right-skewed.

**Clusters.** Global Moran's I answers whether gaps cluster at all. Local Moran's I (Anselin's LISA) answers where, with significance from conditional permutation: hold a tract's value fixed, redraw its neighbours' values from the rest of the study area, and ask how often chance produces a statistic that extreme. Neighbours are queen-contiguous (share an edge or a vertex).

**Coverage.** Binary: a tract is covered if any supply point lies within the radius of its centroid. Uncovered tracts are grouped into connected components of the contiguity graph and ranked by population, so the answer is "the three biggest holes", not a list of 300 tracts.

**Site selection.** The maximal covering location problem: choose k sites from tract centroids to maximize newly covered weight, where weight is population or population scaled by the need index. Greedy construction, then swap-based local search. The test suite includes the classic instance where greedy alone picks a site that blocks the optimal pair and the swap pass recovers it.

**Similarity.** Euclidean distance over eleven standardized features: the five need components, four access domains, log income and log rent. Each match reports its three largest feature differences so the model can say *why* two tracts are alike.

**Routing.** Nearest-neighbour construction plus 2-opt improvement on great-circle distance, checked against brute force on small instances.

All of these are implemented from the formulas in `lib/spatial/` and `lib/analysis/`, with tests against instances where the answer is known.

**Tract boundaries changed in 2020.** The 2019 estimates are published on 2010 tracts and the 2024 estimates on 2020 tracts, so growth cannot be a straight tract-to-tract comparison. The pipeline applies the Census relationship file: 2019 counts are apportioned onto 2020 tracts by land-area share of each overlapping part, and medians are averaged across parts weighted by apportioned population. It is an approximation and is labelled as one in the tool output. The two vintages, 2015–2019 and 2020–2024, do not overlap, which is the Census Bureau's condition for comparing 5-year estimates.

---

## Data

All public or openly licensed, all free.

| Source | Used for | Licence |
|---|---|---|
| Census cartographic boundary files, 2024 | Tract polygons | Public domain |
| ACS 5-year 2024 and 2019 | Demographics, growth | Public domain |
| Census 2010→2020 tract relationship file | Crosswalk | Public domain |
| OpenStreetMap via Overpass | Groceries, pharmacies, clinics | ODbL |
| MARTA GTFS | Stops and weekday service frequency | Open data |
| Nominatim and the Census geocoder | Place search, at request time | ODbL / public domain |
| Esri gray canvas basemap | Map tiles | Free with attribution, no key |

The pipeline output is committed under `data/` (about 1.3 MB) so the deployed app has no runtime dependency on any of these services except place search. `data/manifest.json` records vintages, counts, and the build date.

---

## Design decisions

**Compute per request, from committed data.** Six hundred tracts and seven thousand supply points is small enough that a full run, including 199 permutations per tract, takes well under a second, and site selection over 600 candidates takes tens of milliseconds. So the API and the MCP tools compute on demand rather than serving a precomputed table, which is what lets parameters and scenarios be adjustable. Results are memoized per parameter set with a bounded cache.

**One engine, three surfaces.** The map's routes, the MCP tools, and the tests all call the same functions. Scenario overrides flow through one `supplyFor` so what-if, coverage, and site selection agree on what exists.

**No Python in the serving path.** GeoPandas and friends are the natural tools here, but they push a serverless bundle past Vercel's size limit. The spatial statistics and the solver are a few hundred lines of TypeScript. Polygon contiguity, the one operation that genuinely wants a geometry library, is computed once in the pipeline with Turf and stored on each tract.

**Neighbours before truncation.** Contiguity is computed on the full-precision boundaries, then coordinates are rounded to five decimals for a smaller file. Rounding after the topology is settled means shared borders still agree.

**Nulls are honest.** A suppressed ACS estimate stays null rather than becoming zero. Composite scores treat a null as "average," tool output prints `n/a`, and the map greys out tracts with no population.

**Explain the statistic, not just the label.** Tool responses say "high-gap cluster (local I 1.84, p 0.005)" rather than "HH," similarity results name the features that differ, and site selection reports who each site newly covers.

**Bounded inputs.** Scenario coordinates must fall inside the study area's bounding box, scenarios are capped at 50 facilities, and geocoding is proxied through the server with an identifying user agent and a per-process cache, as both geocoders' usage policies ask.

**Secrets stay out of logs.** The Census key rides in a query string because that is how the Census API authenticates. The pipeline redacts it from every log line and error message.

---

## Architecture

```
pipeline/               offline; run by `npm run pipeline` or the refresh-data workflow
  tracts.ts             boundaries → contiguity → truncated GeoJSON
  acs.ts                two ACS vintages + tract crosswalk
  pois.ts               Overpass query → categorized points
  transit.ts            GTFS → stops with trips per hour, rail rollup
  assemble.ts           join → data/tracts.json, data/manifest.json
data/                   committed pipeline outputs
lib/spatial/            weights, Moran's I, 2SFCA, TSP, stats — no dependencies
lib/analysis/           engine, supply overrides, coverage, MCLP solver, similarity
lib/data/               loaders for the committed files
lib/geocode.ts          Nominatim with Census geocoder fallback
lib/tools/              MCP tools, prompts and resources, one file per tool
app/api/                tracts, pois, analysis, coverage, sites, geocode routes
app/mcp/route.ts        registration only
components/             Leaflet map, sidebar, legend, URL state, export
.github/workflows/      ci.yml (type-check, lint, test, build) · refresh-data.yml
```

`lib/spatial/` knows nothing about tracts or MCP. `lib/analysis/` knows about tracts but not HTTP. `lib/tools/` and `app/api/` are thin adapters over the engine.

---

## Running locally

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:3000, uses the committed data
npm test             # unit tests for the statistics and solvers + integration tests on the data
npm run type-check
npm run lint
```

Rebuilding the data needs a free [Census API key](https://api.census.gov/data/key_signup.html) in `.env.local`:

```
CENSUS_API_KEY=...
```

```bash
npm run pipeline     # ~30 s; raw downloads cached under pipeline/cache
```

Smoke-test the MCP server against a running instance (every tool, prompts, resources):

```bash
npm run test:client -- http://localhost:3000
```

---

## Limitations

- Distance is straight-line from tract centroids. Network or transit travel time would be better and is the obvious next step.
- OpenStreetMap coverage of businesses is uneven. Overture Maps Places is a candidate replacement with a permissive licence.
- Tertiles are relative to the three-county study area. A tract in the "low access" third is low for metro Atlanta, not by any absolute standard.
- Site selection candidates are tract centroids, so a proposal means "somewhere in this tract". Greedy plus swap is a heuristic; it is usually within a few percent of optimal but is not guaranteed to be.
- The 2019→2020 tract crosswalk apportions by land area, which assumes population is spread evenly within each 2010 tract.
- Local Moran significance is per-tract without a multiple-comparison correction, which is conventional for exploratory LISA maps but means a few of the 600 flags are chance.

---

## Data sources

U.S. Census Bureau (ACS, TIGER/Line, geographic relationship files, geocoder), public domain. © OpenStreetMap contributors, ODbL, including Nominatim search. MARTA GTFS. Basemap tiles © Esri.

Built with Next.js, React Leaflet, and [`mcp-handler`](https://github.com/vercel/mcp-handler). Deployed on Vercel.
