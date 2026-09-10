/**
 * Site selection over the study area: wires the MCLP solver to tracts,
 * existing supply, and the need index.
 */

import { loadTracts } from "../data/load";
import { tractUnits } from "./coverage";
import { EMPTY_OVERRIDES } from "./params";
import { runAnalysisCached } from "./run";
import { solveSites, type SiteSolution } from "./sites";
import { supplyFor } from "./supply";
import type { AccessDomain, AnalysisParams, SupplyOverrides } from "./types";

export interface SiteSelectionOptions {
  domain: AccessDomain;
  k: number;
  radiusKm: number;
  /** "population" maximizes people covered; "need" scales each tract by its need index. */
  weighting: "population" | "need";
  minTph?: number;
}

export interface SiteSelectionResult extends SiteSolution {
  options: SiteSelectionOptions;
  sites: Array<
    SiteSolution["sites"][number] & { geoid: string; name: string; county: string }
  >;
  totalPop: number;
}

export function selectSites(
  opts: SiteSelectionOptions,
  params: AnalysisParams,
  overrides: SupplyOverrides = EMPTY_OVERRIDES
): SiteSelectionResult {
  const units = tractUnits();
  const features = loadTracts().features;

  let weights = units.map((u) => u.pop);
  if (opts.weighting === "need") {
    const analysis = runAnalysisCached(params, overrides);
    // Need is a z-score; shift so the average tract keeps weight 1 and a
    // tract two sigma below average still counts a little.
    weights = units.map((u, i) => u.pop * Math.max(0.1, 1 + analysis.tracts[i].need));
  }

  const existing = supplyFor(opts.domain, overrides, { minTph: opts.minTph });
  const candidates = units
    .filter((u) => u.pop > 0)
    .map((u) => ({ id: u.geoid, lon: u.lon, lat: u.lat }));

  const solution = solveSites(units, weights, existing, candidates, {
    k: opts.k,
    radiusKm: opts.radiusKm,
    localSearch: true,
  });

  const byGeoid = new Map(features.map((f) => [f.properties.geoid, f.properties]));
  return {
    ...solution,
    options: opts,
    totalPop: units.reduce((s, u) => s + u.pop, 0),
    sites: solution.sites.map((s) => {
      const p = byGeoid.get(s.id)!;
      return { ...s, geoid: s.id, name: p.name, county: p.county };
    }),
  };
}
