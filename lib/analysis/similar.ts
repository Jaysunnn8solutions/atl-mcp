/**
 * Nearest neighbours in feature space: which tracts look like this one?
 *
 * Features are the standardized need components, the standardized access
 * domains, and standardized log income and rent, so the distance is in
 * comparable z-score units. Excluding spatial neighbours turns "similar"
 * into "peer": a tract elsewhere in the region with the same profile.
 */

import { loadTracts } from "../data/load";
import { zWithNulls } from "./run";
import { ACCESS_DOMAINS, type AnalysisResult, type TractResult } from "./types";

export interface SimilarOptions {
  k: number;
  /** Drop queen-contiguous neighbours of the target. */
  excludeNeighbors: boolean;
  /** Only tracts whose composite access is at least this much higher. */
  minAccessAdvantage?: number;
  /** Restrict to a county. */
  county?: string;
}

export interface SimilarMatch {
  geoid: string;
  distance: number;
  /** Feature-level differences (candidate minus target), sorted by magnitude. */
  biggestDifferences: Array<{ feature: string; delta: number }>;
  result: TractResult;
}

export const FEATURE_NAMES = [
  "poverty",
  "noVehicle",
  "seniors",
  "children",
  "growth",
  "lowIncome",
  ...ACCESS_DOMAINS.map((d) => `access:${d}`),
  "rent",
] as const;

/** One row of standardized features per tract, in tract order. */
export function featureMatrix(result: AnalysisResult): number[][] {
  const props = loadTracts().features.map((f) => f.properties);
  const rent = zWithNulls(props.map((p) => (p.medianRent == null ? null : Math.log(p.medianRent))));
  return result.tracts.map((t, i) => [
    t.needBy.poverty,
    t.needBy.noVehicle,
    t.needBy.seniors,
    t.needBy.children,
    t.needBy.growth,
    t.needBy.income,
    ...ACCESS_DOMAINS.map((d) => t.accessZ[d]),
    rent[i],
  ]);
}

export function findSimilar(
  result: AnalysisResult,
  geoid: string,
  opts: SimilarOptions
): SimilarMatch[] {
  const features = loadTracts().features;
  const idx = features.findIndex((f) => f.properties.geoid === geoid);
  if (idx === -1) throw new Error(`Unknown tract ${geoid}`);

  const matrix = featureMatrix(result);
  const target = matrix[idx];
  const targetResult = result.tracts[idx];
  const neighbors = new Set(features[idx].properties.neighbors);

  const matches: SimilarMatch[] = [];
  for (let j = 0; j < matrix.length; j++) {
    if (j === idx) continue;
    const p = features[j].properties;
    if (p.pop === 0) continue;
    if (opts.excludeNeighbors && neighbors.has(p.geoid)) continue;
    if (opts.county && p.county !== opts.county) continue;
    const r = result.tracts[j];
    if (
      opts.minAccessAdvantage != null &&
      r.access < targetResult.access + opts.minAccessAdvantage
    ) {
      continue;
    }
    let sq = 0;
    const deltas: Array<{ feature: string; delta: number }> = [];
    for (let f = 0; f < target.length; f++) {
      const d = matrix[j][f] - target[f];
      sq += d * d;
      deltas.push({ feature: FEATURE_NAMES[f], delta: Math.round(d * 100) / 100 });
    }
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    matches.push({
      geoid: p.geoid,
      distance: Math.round(Math.sqrt(sq) * 1000) / 1000,
      biggestDifferences: deltas.slice(0, 3),
      result: r,
    });
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, opts.k);
}
