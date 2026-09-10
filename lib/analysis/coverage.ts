/**
 * Coverage gaps: who is outside every catchment?
 *
 * Unlike 2SFCA, which grades access continuously, coverage is binary: a
 * tract is covered if any supply point lies within the radius of its
 * centroid. Uncovered tracts are then grouped into contiguous clusters
 * using the queen-contiguity graph, so the answer is "here are the three
 * biggest holes" rather than a list of 80 tracts.
 */

import type { Point } from "../spatial/catchment";
import { haversineKm } from "../spatial/stats";
import { loadTracts } from "../data/load";
import { EMPTY_OVERRIDES } from "./params";
import { supplyFor } from "./supply";
import type { AccessDomain, SupplyOverrides } from "./types";

export interface CoverageUnit {
  geoid: string;
  lon: number;
  lat: number;
  pop: number;
  neighbors: string[];
  county?: string;
  name?: string;
}

export interface CoverageCluster {
  rank: number;
  tracts: string[];
  pop: number;
  /** Population-weighted centre of the cluster. */
  lon: number;
  lat: number;
  counties: Record<string, number>;
}

export interface CoverageResult {
  domain: AccessDomain;
  radiusKm: number;
  minTph?: number;
  supplyCount: number;
  totalPop: number;
  coveredPop: number;
  uncoveredTracts: number;
  /** geoid → covered */
  covered: Record<string, boolean>;
  /** geoid → cluster rank (1 = largest by population), for uncovered tracts */
  clusterOf: Record<string, number>;
  clusters: CoverageCluster[];
}

/** Pure core, so it can be tested on synthetic units. */
export function coverageCore(
  units: CoverageUnit[],
  supply: Point[],
  radiusKm: number
): { covered: boolean[]; clusters: CoverageCluster[] } {
  const dLat = radiusKm / 110.574;
  const covered = units.map((u) => {
    if (u.pop === 0) return true; // nobody to cover
    const dLon = radiusKm / (111.32 * Math.cos((u.lat * Math.PI) / 180));
    for (const s of supply) {
      if (Math.abs(s.lat - u.lat) > dLat || Math.abs(s.lon - u.lon) > dLon) continue;
      if (haversineKm(u.lon, u.lat, s.lon, s.lat) <= radiusKm) return true;
    }
    return false;
  });

  // Connected components over uncovered units.
  const index = new Map(units.map((u, i) => [u.geoid, i]));
  const seen = new Array<boolean>(units.length).fill(false);
  const clusters: CoverageCluster[] = [];
  for (let i = 0; i < units.length; i++) {
    if (covered[i] || seen[i]) continue;
    const members: number[] = [];
    const queue = [i];
    seen[i] = true;
    while (queue.length) {
      const cur = queue.pop()!;
      members.push(cur);
      for (const nid of units[cur].neighbors) {
        const j = index.get(nid);
        if (j === undefined || seen[j] || covered[j]) continue;
        seen[j] = true;
        queue.push(j);
      }
    }
    let pop = 0;
    let lonW = 0;
    let latW = 0;
    const counties: Record<string, number> = {};
    for (const m of members) {
      const u = units[m];
      pop += u.pop;
      lonW += u.lon * u.pop;
      latW += u.lat * u.pop;
      if (u.county) counties[u.county] = (counties[u.county] ?? 0) + 1;
    }
    clusters.push({
      rank: 0,
      tracts: members.map((m) => units[m].geoid),
      pop,
      lon: pop > 0 ? lonW / pop : units[members[0]].lon,
      lat: pop > 0 ? latW / pop : units[members[0]].lat,
      counties,
    });
  }
  clusters.sort((a, b) => b.pop - a.pop);
  clusters.forEach((c, i) => (c.rank = i + 1));
  return { covered, clusters };
}

export function tractUnits(): CoverageUnit[] {
  return loadTracts().features.map((f) => ({
    geoid: f.properties.geoid,
    lon: f.properties.cx,
    lat: f.properties.cy,
    pop: f.properties.pop,
    neighbors: f.properties.neighbors,
    county: f.properties.county,
    name: f.properties.name,
  }));
}

export interface CoverageOptions {
  domain: AccessDomain;
  radiusKm: number;
  /** Transit only: ignore stops below this many weekday trips per hour. */
  minTph?: number;
}

export function coverage(
  opts: CoverageOptions,
  overrides: SupplyOverrides = EMPTY_OVERRIDES
): CoverageResult {
  const units = tractUnits();
  const supply = supplyFor(opts.domain, overrides, { minTph: opts.minTph });
  const { covered, clusters } = coverageCore(units, supply, opts.radiusKm);

  const coveredMap: Record<string, boolean> = {};
  const clusterOf: Record<string, number> = {};
  let totalPop = 0;
  let coveredPop = 0;
  units.forEach((u, i) => {
    coveredMap[u.geoid] = covered[i];
    totalPop += u.pop;
    if (covered[i]) coveredPop += u.pop;
  });
  for (const c of clusters) for (const g of c.tracts) clusterOf[g] = c.rank;

  return {
    domain: opts.domain,
    radiusKm: opts.radiusKm,
    minTph: opts.minTph,
    supplyCount: supply.length,
    totalPop,
    coveredPop,
    uncoveredTracts: covered.filter((c) => !c).length,
    covered: coveredMap,
    clusterOf,
    clusters,
  };
}
