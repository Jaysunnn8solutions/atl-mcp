/**
 * Location allocation: the maximal covering location problem (MCLP).
 *
 * Given existing supply, a radius, and a budget of k new sites, choose the
 * sites that cover the most (weighted) population that is not already
 * covered. Candidates are tract centroids. The solver is greedy
 * construction followed by pairwise-swap local search; MCLP is NP-hard,
 * but at 600 candidates greedy-plus-swap is fast and usually within a few
 * percent of optimal, and both steps are deterministic.
 */

import type { Point } from "../spatial/catchment";
import { haversineKm } from "../spatial/stats";
import type { CoverageUnit } from "./coverage";

export interface Candidate extends Point {
  id: string;
}

export interface SiteSolverOptions {
  k: number;
  radiusKm: number;
  /** Run the swap-based improvement pass after greedy construction. */
  localSearch?: boolean;
  /** Cap on improvement passes, each a full sweep over chosen × unchosen. */
  maxPasses?: number;
}

export interface ChosenSite {
  id: string;
  lon: number;
  lat: number;
  /** Weight newly covered when this site was added, in greedy order. */
  gain: number;
  coveredUnits: string[];
}

export interface SiteSolution {
  sites: ChosenSite[];
  baselineCovered: number;
  finalCovered: number;
  totalWeight: number;
  improvedByLocalSearch: boolean;
}

/** Indices of demand units within the radius of a point. */
function reach(point: Point, units: CoverageUnit[], radiusKm: number): number[] {
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.cos((point.lat * Math.PI) / 180));
  const out: number[] = [];
  for (let j = 0; j < units.length; j++) {
    const u = units[j];
    if (Math.abs(u.lat - point.lat) > dLat || Math.abs(u.lon - point.lon) > dLon) continue;
    if (haversineKm(point.lon, point.lat, u.lon, u.lat) <= radiusKm) out.push(j);
  }
  return out;
}

/**
 * Solve MCLP. `weights[j]` is the value of covering unit j (population, or
 * population scaled by need). `existing` are supply points already in
 * place; units they reach contribute nothing to any candidate.
 */
export function solveSites(
  units: CoverageUnit[],
  weights: number[],
  existing: Point[],
  candidates: Candidate[],
  opts: SiteSolverOptions
): SiteSolution {
  const n = units.length;
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // coverCount[j] = how many chosen sites reach unit j; existing supply
  // counts as a permanent cover.
  const coverCount = new Array<number>(n).fill(0);
  for (const e of existing) for (const j of reach(e, units, opts.radiusKm)) coverCount[j]++;
  let baselineCovered = 0;
  for (let j = 0; j < n; j++) if (coverCount[j] > 0) baselineCovered += weights[j];

  const reachOf = candidates.map((c) => reach(c, units, opts.radiusKm));
  const chosen: number[] = [];
  const chosenSet = new Set<number>();

  const gainOf = (i: number) => {
    let g = 0;
    for (const j of reachOf[i]) if (coverCount[j] === 0) g += weights[j];
    return g;
  };
  const add = (i: number) => {
    chosen.push(i);
    chosenSet.add(i);
    for (const j of reachOf[i]) coverCount[j]++;
  };
  const drop = (i: number) => {
    chosen.splice(chosen.indexOf(i), 1);
    chosenSet.delete(i);
    for (const j of reachOf[i]) coverCount[j]--;
  };

  // ---- Greedy construction ----------------------------------------------
  const greedyGain = new Map<number, number>();
  for (let step = 0; step < opts.k && step < candidates.length; step++) {
    let best = -1;
    let bestGain = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (chosenSet.has(i)) continue;
      const g = gainOf(i);
      if (g > bestGain) {
        bestGain = g;
        best = i;
      }
    }
    if (best === -1) break; // nothing left to gain
    add(best);
    greedyGain.set(best, bestGain);
  }

  // ---- Swap local search ------------------------------------------------
  let improved = false;
  if (opts.localSearch !== false) {
    const maxPasses = opts.maxPasses ?? 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let any = false;
      for (const s of [...chosen]) {
        drop(s);
        const lostGain = gainOf(s); // what s was uniquely covering
        let bestIn = s;
        let bestGain = lostGain;
        for (let c = 0; c < candidates.length; c++) {
          if (chosenSet.has(c) || c === s) continue;
          const g = gainOf(c);
          if (g > bestGain + 1e-9) {
            bestGain = g;
            bestIn = c;
          }
        }
        add(bestIn);
        if (bestIn !== s) {
          any = true;
          improved = true;
        }
      }
      if (!any) break;
    }
  }

  // ---- Report -----------------------------------------------------------
  let finalCovered = 0;
  for (let j = 0; j < n; j++) if (coverCount[j] > 0) finalCovered += weights[j];

  // Recompute per-site gains in chosen order for a stable explanation.
  const tmp = new Array<number>(n).fill(0);
  for (const e of existing) for (const j of reach(e, units, opts.radiusKm)) tmp[j]++;
  const sites: ChosenSite[] = chosen.map((i) => {
    let gain = 0;
    const coveredUnits: string[] = [];
    for (const j of reachOf[i]) {
      if (tmp[j] === 0) {
        gain += weights[j];
        coveredUnits.push(units[j].geoid);
      }
      tmp[j]++;
    }
    return { id: candidates[i].id, lon: candidates[i].lon, lat: candidates[i].lat, gain, coveredUnits };
  });
  sites.sort((a, b) => b.gain - a.gain);

  return { sites, baselineCovered, finalCovered, totalWeight, improvedByLocalSearch: improved };
}
