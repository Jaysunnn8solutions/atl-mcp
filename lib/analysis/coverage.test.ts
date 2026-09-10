import { describe, expect, it } from "vitest";
import { coverage, coverageCore, type CoverageUnit } from "./coverage";

/** A 1-D strip of tracts along the equator, 0.01° (~1.1 km) apart. */
function strip(pops: number[]): CoverageUnit[] {
  return pops.map((pop, i) => ({
    geoid: `t${i}`,
    lon: i * 0.01,
    lat: 0,
    pop,
    neighbors: [i > 0 ? `t${i - 1}` : "", i < pops.length - 1 ? `t${i + 1}` : ""].filter(Boolean),
  }));
}

describe("coverageCore", () => {
  it("marks tracts near supply as covered and groups the rest into contiguous clusters", () => {
    const units = strip([100, 100, 100, 100, 100, 100, 100]);
    // One store at t0, one at t6. Radius reaches one neighbour on each side.
    const supply = [
      { lon: 0, lat: 0 },
      { lon: 0.06, lat: 0 },
    ];
    const { covered, clusters } = coverageCore(units, supply, 1.2);
    expect(covered).toEqual([true, true, false, false, false, true, true]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].tracts).toEqual(["t2", "t3", "t4"]);
    expect(clusters[0].pop).toBe(300);
    expect(clusters[0].rank).toBe(1);
  });

  it("ranks clusters by population and treats empty tracts as covered", () => {
    const units = strip([50, 0, 900, 0, 10, 0, 20]);
    const { covered, clusters } = coverageCore(units, [], 0.5);
    expect(covered[1]).toBe(true);
    expect(clusters.map((c) => c.pop)).toEqual([900, 50, 20, 10]);
    expect(clusters[0].rank).toBe(1);
  });
});

describe("coverage on committed data", () => {
  it("covers most of the population for groceries at one mile", () => {
    const c = coverage({ domain: "grocery", radiusKm: 1.6 });
    expect(c.coveredPop / c.totalPop).toBeGreaterThan(0.5);
    expect(c.clusters.length).toBeGreaterThan(0);
    const largest = c.clusters[0];
    for (const g of largest.tracts) expect(c.clusterOf[g]).toBe(1);
  });

  it("covers less when a scenario removes supply and more when it adds", () => {
    const base = coverage({ domain: "pharmacy", radiusKm: 1 });
    const hole = base.clusters[0];
    const withNew = coverage(
      { domain: "pharmacy", radiusKm: 1 },
      { add: [{ domain: "pharmacy", lon: hole.lon, lat: hole.lat }], remove: [] }
    );
    expect(withNew.coveredPop).toBeGreaterThan(base.coveredPop);
  });
});
