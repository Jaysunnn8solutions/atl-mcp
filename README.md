# atl-mcp

A resource-gap screen for metro Atlanta: which census tracts have **high or rising need** and **low access** to groceries, pharmacies, clinics, and MARTA service. An interactive map, a JSON API, and an [MCP](https://modelcontextprotocol.io) server, all computed from the same engine over the same committed data.

**Live map:** `https://atl-mcp.vercel.app`
**MCP endpoint:** `https://atl-mcp.vercel.app/mcp`

Fulton, DeKalb, and Clayton counties, by 2020 census tract. Authless and read-only.

This is the second project in a portfolio sequence. The first, [census-mcp](https://github.com/Jaysunnn8solutions/census-mcp), is a stateless tool server where the model does the orchestration. This one is an application that does its own orchestration: an offline data pipeline, a spatial analysis engine, a map UI, CI, and an MCP surface over its own results.

---

## What it answers

> Where does need outrun access, and does that pattern cluster geographically?

Every tract gets three numbers and two labels:

| Output | Meaning |
|---|---|
| **Need** | Composite of poverty rate, households with no vehicle, share aged 65+, share under 18, and population growth 2019→2024. Each component is standardized; weights are adjustable. |
| **Access** | Two-step floating catchment area (2SFCA) accessibility to groceries, pharmacies, clinics, and scheduled transit, averaged after standardizing. Transit supply is weighted by weekday trips per hour. |
| **Gap** | Need minus access, in z-score units. |
| **Class** | Tertile of need × tertile of access. `N3A1` (top-third need, bottom-third access) is the priority cell. |
| **Cluster** | Local Moran's I on the gap: high-gap cluster, low-gap cluster, outlier, or not significant. |

It is a screening tool. It surfaces candidates for closer study; it does not establish that a tract needs a particular intervention.

---

## Try the MCP server

**Claude (web or desktop):** Settings → Connectors → Add custom connector → paste the endpoint URL. Leave the OAuth fields empty.

**Claude Code:**

```bash
claude mcp add --transport http atl https://atl-mcp.vercel.app/mcp
```

Then ask something like *"Which tracts near the Five Points station have the biggest resource gap, and why?"*

| Tool | Purpose |
|---|---|
| `describe_analysis` | Method, data vintages, and headline counts. Call first. |
| `find_priority_tracts` | Rank tracts by gap; filter by county or the priority cell. |
| `get_tract` | Full profile for one GEOID: both vintages, growth, scores with components, what is within the catchment. |
| `tracts_near` | Tracts around a MARTA rail station or a lon/lat point. |
| `compare_counties` | County-level rollup of need, access, priority tracts, and clusters. |

Every tool accepts the same optional parameters as the map (catchment radius, distance decay, need weights), so a model can ask "what changes if walking distance is half a mile" and get a fresh computation.

---

## Method

**Need.** Five inputs from the ACS 5-year estimates. Poverty and no-vehicle rates are the classic markers of households that cannot substitute distance with driving. Age shares capture populations with higher service dependence. Growth is the forward-looking term: a tract adding population is one where today's supply is being stretched. Each is z-scored across the 600 tracts; a null input contributes zero so a tract is neither rewarded nor punished for a suppressed estimate. The composite is a weighted mean.

**Access.** 2SFCA is a standard measure from health geography that accounts for competition, not just proximity. Step one: each supply point (a store, a stop) computes capacity divided by the population within its catchment. Step two: each tract sums the ratios of every supply point that reaches it. A grocery surrounded by 50,000 people counts for less than one surrounded by 5,000. The enhanced variant swaps the hard cutoff for Gaussian decay, so nearer supply counts more. Transit stops carry capacity equal to their scheduled weekday trips per hour, so "near a station" becomes "near frequent service." Accessibility is log-transformed before standardizing because it is heavily right-skewed.

**Clusters.** Global Moran's I answers whether gaps cluster at all. Local Moran's I (Anselin's LISA) answers where, with significance from conditional permutation: hold a tract's value fixed, redraw its neighbours' values from the rest of the study area, and ask how often chance produces a statistic that extreme. Neighbours are queen-contiguous (share an edge or a vertex). Both statistics are implemented from the formulas in `lib/spatial/`, with tests against lattices where the answer is known.

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
| Esri gray canvas basemap | Map tiles | Free with attribution, no key |

The pipeline output is committed under `data/` (about 1.3 MB) so the deployed app has no runtime dependency on any of these services. `data/manifest.json` records vintages, counts, and the build date.

---

## Design decisions

**Compute per request, from committed data.** Six hundred tracts and seven thousand supply points is small enough that a full run, including 199 permutations per tract, takes well under a second. So the API and the MCP tools compute on demand rather than serving a precomputed table, which is what lets parameters be adjustable. Results are memoized per parameter set with a bounded cache.

**One engine, three surfaces.** The map's `/api/analysis`, the MCP tools, and the tests all call `runAnalysis`. There is no separate "MCP version" of the numbers to drift.

**No Python in the serving path.** GeoPandas and friends are the natural tools here, but they push a serverless bundle past Vercel's size limit. The spatial statistics are a few hundred lines of TypeScript. Polygon contiguity, the one operation that genuinely wants a geometry library, is computed once in the pipeline with Turf and stored on each tract.

**Neighbours before truncation.** Contiguity is computed on the full-precision boundaries, then coordinates are rounded to five decimals for a smaller file. Rounding after the topology is settled means shared borders still agree.

**Nulls are honest.** A suppressed ACS estimate stays null rather than becoming zero. Composite scores treat a null as "average," tool output prints `n/a`, and the map greys out tracts with no population.

**Explain the statistic, not just the label.** Tool responses say "high-gap cluster (local I 1.84, p 0.005)" rather than "HH," and the tract profile shows every need component and every access domain, so a model or a reader can see *why* a tract scored the way it did.

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
lib/spatial/            weights, Moran's I, 2SFCA, stats — no dependencies
lib/analysis/           parameters, engine, classification
lib/data/               loaders for the committed files
lib/tools/              MCP tool schemas and handlers, one file per tool
app/api/                tracts, pois, analysis routes
app/mcp/route.ts        tool registration only
components/             Leaflet map, sidebar, legend, colour scales
.github/workflows/      ci.yml (type-check, lint, test, build) · refresh-data.yml
```

`lib/spatial/` knows nothing about tracts or MCP. `lib/analysis/` knows about tracts but not HTTP. `lib/tools/` and `app/api/` are thin adapters over the engine.

---

## Running locally

Requires Node 22+.

```bash
npm install
npm run dev          # http://localhost:3000, uses the committed data
npm test             # unit tests for the statistics + an integration test on the data
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

Smoke-test the MCP server against a running instance:

```bash
npm run test:client -- http://localhost:3000
```

---

## Limitations

- Distance is straight-line from tract centroids. Network distance or transit travel time would be better and is the obvious next step.
- OpenStreetMap coverage of businesses is uneven. Overture Maps Places is a candidate replacement with a permissive licence.
- Tertiles are relative to the three-county study area. A tract in the "low access" third is low for metro Atlanta, not by any absolute standard.
- The 2019→2020 tract crosswalk apportions by land area, which assumes population is spread evenly within each 2010 tract.
- Local Moran significance is per-tract without a multiple-comparison correction, which is conventional for exploratory LISA maps but means a few of the 600 flags are chance.

---

## Data sources

U.S. Census Bureau (ACS, TIGER/Line, geographic relationship files), public domain. © OpenStreetMap contributors, ODbL. MARTA GTFS. Basemap tiles © Esri.

Built with Next.js, React Leaflet, and [`mcp-handler`](https://github.com/vercel/mcp-handler). Deployed on Vercel.
