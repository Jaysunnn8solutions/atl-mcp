/**
 * Resources: reference material a client can attach to context without a
 * tool call — the data manifest and a description of the method.
 */

import { loadManifest } from "../data/load";

export const METHOD_MARKDOWN = `# Atlanta resource gap screen — method

**Question.** Where does need outrun access to groceries, pharmacies, clinics and transit, and does that pattern cluster?

**Units.** 2020 census tracts in Fulton, DeKalb and Clayton counties. Tract centroids stand in for residents.

**Need** = weighted mean of five standardized (z-score) components: poverty rate, households with no vehicle, share aged 65+, share under 18, and population growth from the prior ACS vintage (apportioned from 2010 tracts to 2020 tracts by land area). Nulls contribute 0.

**Access** = mean of four standardized domains. Each domain is two-step floating catchment area (2SFCA) accessibility: every supply point divides its capacity by the population inside its catchment; every tract sums the ratios of supply points that reach it. Catchments default to 1.6 km with Gaussian decay. Transit supply capacity is weekday trips per hour at the stop. Raw values are log1p-transformed before standardizing.

**Gap** = need − access. Tracts are cut into thirds on need and access; class N3A1 (top-third need, bottom-third access) is the priority cell.

**Clusters.** Global Moran's I on the gap tests whether gaps cluster. Local Moran's I (LISA) with conditional permutation (199 draws, seed 42) labels each tract HH, LL, HL, LH or not significant at α = 0.05. Neighbours are queen-contiguous.

**Coverage** is binary: a tract is covered if any supply point is within the radius of its centroid. Uncovered tracts are grouped into contiguous clusters.

**Site selection** solves the maximal covering location problem over tract centroids: greedy construction, then pairwise swap local search, maximizing newly covered population or need-weighted population.

**Similarity** is Euclidean distance over 11 standardized features: the five need components, four access domains, log income and log rent.

**Routing** is nearest-neighbour plus 2-opt on great-circle distances.

**Limits.** Straight-line distance; OpenStreetMap business coverage is uneven; tertiles are relative to the study area; the 2010→2020 crosswalk assumes uniform population within 2010 tracts; LISA has no multiple-comparison correction. This is a screening tool.
`;

export const manifestResource = {
  name: "manifest",
  uri: "atl://data/manifest",
  config: {
    title: "Data manifest",
    description: "Vintages, counties, counts and build date of the committed data.",
    mimeType: "application/json",
  },
  handler: (uri: URL) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(loadManifest(), null, 2),
      },
    ],
  }),
};

export const methodResource = {
  name: "method",
  uri: "atl://method",
  config: {
    title: "Method",
    description: "How need, access, gap, clusters, coverage, site selection and similarity are computed.",
    mimeType: "text/markdown",
  },
  handler: (uri: URL) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: METHOD_MARKDOWN }],
  }),
};
