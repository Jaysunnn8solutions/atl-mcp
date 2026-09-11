/**
 * The analysis engine. Given parameters, produces a need index, an access
 * index, a gap, a bivariate class, and a local Moran cluster for every tract.
 *
 * All inputs are the committed pipeline outputs; nothing here touches the
 * network, so a run is a few hundred milliseconds and safe to do per request.
 */

import { twoStepFca, type Demand } from "../spatial/catchment";
import { globalMoran, localMoran } from "../spatial/moran";
import { clamp, mean, zscores } from "../spatial/stats";
import { buildWeights } from "../spatial/weights";
import { loadManifest, loadTracts } from "../data/load";
import { biClass, PRIORITY_CLASS, tertiles } from "./classify";
import { coverageCore, tractUnits } from "./coverage";
import { EMPTY_OVERRIDES } from "./params";
import { overridesKey, supplyFor } from "./supply";
import {
  ACCESS_DOMAINS,
  type AccessDomain,
  type AnalysisParams,
  type AnalysisResult,
  type NeedWeights,
  type SupplyOverrides,
  type TractProps,
  type TractResult,
} from "./types";

/** Population growth 2019→2024, clipped so a handful of new-build tracts don't dominate. */
export function popGrowth(p: TractProps): number | null {
  if (p.pop2019 == null || p.pop2019 < 100) return null;
  return clamp((p.pop - p.pop2019) / p.pop2019, -0.75, 2);
}

/**
 * Standardize a component, treating nulls as "average" (z = 0) so a tract
 * missing one input is neither rewarded nor punished for it.
 */
export function zWithNulls(values: Array<number | null>): number[] {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return values.map(() => 0);
  const z = zscores(present);
  let k = 0;
  return values.map((v) => (v == null ? 0 : z[k++]));
}

function weightedComposite(
  parts: Record<keyof NeedWeights, number[]>,
  weights: NeedWeights,
  n: number
): number[] {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const out = new Array<number>(n).fill(0);
  if (total === 0) return out;
  for (const key of Object.keys(weights) as Array<keyof NeedWeights>) {
    const w = weights[key] / total;
    if (w === 0) continue;
    const series = parts[key];
    for (let i = 0; i < n; i++) out[i] += w * series[i];
  }
  return out;
}

/** Percent of values strictly below each value (0–100), in input order. */
export function percentileRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  if (n <= 1) return values.map(() => 50);
  return values.map((v) => {
    // Binary search for the first index >= v.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((100 * lo) / (n - 1));
  });
}

/** Tract centroids as demand points, in tract order. */
export function demandPoints(): Demand[] {
  return loadTracts().features.map((f) => ({
    lon: f.properties.cx,
    lat: f.properties.cy,
    population: f.properties.pop,
  }));
}

export function runAnalysis(
  params: AnalysisParams,
  overrides: SupplyOverrides = EMPTY_OVERRIDES
): AnalysisResult {
  const features = loadTracts().features;
  const props = features.map((f) => f.properties);
  const n = props.length;

  // ---- Need -------------------------------------------------------------
  const growth = props.map(popGrowth);
  const needBy: Record<keyof NeedWeights, number[]> = {
    poverty: zWithNulls(props.map((p) => p.povertyRate)),
    noVehicle: zWithNulls(props.map((p) => p.noVehicleRate)),
    seniors: zWithNulls(props.map((p) => p.seniorShare)),
    children: zWithNulls(props.map((p) => p.childShare)),
    growth: zWithNulls(growth),
    // Lower income is higher need, so the sign is flipped; log keeps a few
    // very high-income tracts from dominating the scale.
    income: zWithNulls(props.map((p) => (p.medianIncome == null ? null : -Math.log(p.medianIncome)))),
  };
  const need = weightedComposite(needBy, params.weights, n);

  // ---- Access -----------------------------------------------------------
  const demand = demandPoints();
  const accessRaw = {} as Record<AccessDomain, number[]>;
  const accessZ = {} as Record<AccessDomain, number[]>;
  for (const domain of ACCESS_DOMAINS) {
    const raw = twoStepFca(demand, supplyFor(domain, overrides), {
      radiusKm: params.radiusKm,
      decay: params.decay,
    }).map((a) => a * 1000);
    accessRaw[domain] = raw;
    // Accessibility is heavily right-skewed; log1p before standardizing.
    accessZ[domain] = zscores(raw.map((a) => Math.log1p(a)));
  }
  const access = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    access[i] = mean(ACCESS_DOMAINS.map((d) => accessZ[d][i]));
  }

  // ---- Gap, classes, clusters -------------------------------------------
  const gap = need.map((v, i) => v - access[i]);
  const needT = tertiles(need);
  const accessT = tertiles(access);
  const needPct = percentileRanks(need);
  const accessPct = percentileRanks(access);

  // Binary coverage per domain, the absolute companion to the relative index.
  const units = tractUnits();
  const totalPop = units.reduce((s, u) => s + u.pop, 0);
  const coverageShare = {} as Record<AccessDomain, number>;
  for (const domain of ACCESS_DOMAINS) {
    const { covered } = coverageCore(units, supplyFor(domain, overrides), params.radiusKm);
    let pop = 0;
    units.forEach((u, i) => {
      if (covered[i]) pop += u.pop;
    });
    coverageShare[domain] = totalPop > 0 ? round(pop / totalPop) : 0;
  }

  const weights = buildWeights(
    props.map((p) => p.geoid),
    props.map((p) => p.neighbors)
  );
  const global = globalMoran(gap, weights);
  const local = localMoran(gap, weights, { permutations: params.permutations });

  const tracts: TractResult[] = props.map((p, i) => ({
    geoid: p.geoid,
    need: round(need[i]),
    access: round(access[i]),
    gap: round(gap[i]),
    accessBy: Object.fromEntries(
      ACCESS_DOMAINS.map((d) => [d, round(accessRaw[d][i])])
    ) as Record<AccessDomain, number>,
    accessZ: Object.fromEntries(
      ACCESS_DOMAINS.map((d) => [d, round(accessZ[d][i])])
    ) as Record<AccessDomain, number>,
    needBy: Object.fromEntries(
      (Object.keys(needBy) as Array<keyof NeedWeights>).map((k) => [
        k,
        round(needBy[k][i]),
      ])
    ) as Record<keyof NeedWeights, number>,
    popGrowth: growth[i] == null ? null : round(growth[i]!),
    needPct: needPct[i],
    accessPct: accessPct[i],
    needTertile: needT[i],
    accessTertile: accessT[i],
    biClass: biClass(needT[i], accessT[i]),
    lisa: { I: round(local.I[i]), p: round(local.p[i]), cluster: local.cluster[i] },
  }));

  // ---- Summary ----------------------------------------------------------
  const byCountyMap = new Map<
    string,
    { tracts: number; priority: number; need: number[]; access: number[] }
  >();
  tracts.forEach((t, i) => {
    const county = props[i].county;
    const entry = byCountyMap.get(county) ?? {
      tracts: 0,
      priority: 0,
      need: [],
      access: [],
    };
    entry.tracts++;
    if (t.biClass === PRIORITY_CLASS) entry.priority++;
    entry.need.push(t.need);
    entry.access.push(t.access);
    byCountyMap.set(county, entry);
  });

  const manifest = loadManifest();
  return {
    params,
    overrides,
    tracts,
    global: { I: round(global.I), z: round(global.z), p: round(global.p) },
    summary: {
      tractCount: n,
      populated: props.filter((p) => p.pop > 0).length,
      priorityCount: tracts.filter((t) => t.biClass === PRIORITY_CLASS).length,
      priorityPop: tracts.reduce(
        (s, t, i) => s + (t.biClass === PRIORITY_CLASS ? props[i].pop : 0),
        0
      ),
      hotspotCount: tracts.filter((t) => t.lisa.cluster === "HH").length,
      coverageShare,
      totalPop,
      byCounty: [...byCountyMap.entries()]
        .map(([county, e]) => ({
          county,
          tracts: e.tracts,
          priority: e.priority,
          meanNeed: round(mean(e.need)),
          meanAccess: round(mean(e.access)),
        }))
        .sort((a, b) => a.county.localeCompare(b.county)),
    },
    dataVintages: {
      acs: manifest.acsVintage,
      acsPrior: manifest.acsPriorVintage,
      boundaries: manifest.boundaryVintage,
    },
  };
}

export function round(x: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

// ---- Memoization ----------------------------------------------------------
// Results are pure functions of params and overrides, so identical requests
// (the common case: the map's defaults) reuse the last computation. Bounded
// so a parameter sweep can't grow memory without limit.

const MAX_CACHED = 16;
const cache = new Map<string, AnalysisResult>();

export function runAnalysisCached(
  params: AnalysisParams,
  overrides: SupplyOverrides = EMPTY_OVERRIDES
): AnalysisResult {
  const key = JSON.stringify(params) + overridesKey(overrides);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = runAnalysis(params, overrides);
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}
