import { describe, expect, it } from "vitest";
import type { CoverageUnit } from "./coverage";
import { solveSites } from "./sites";
import { selectSites } from "./site-selection";
import { parseParams } from "./params";
import { coverage } from "./coverage";

/** Points on the equator at x * 0.01° (~1.112 km per unit). */
function at(x: number) {
  return { lon: x * 0.01, lat: 0 };
}
function unit(id: string, x: number, pop = 1): CoverageUnit {
  return { geoid: id, ...at(x), pop, neighbors: [] };
}

describe("solveSites (MCLP)", () => {
  // Classic greedy trap: C covers {3,4,5,6,9} = 5, A covers {1,2,3,4},
  // B covers {5,6,7,8}. Greedy takes C then one of A/B for 7; A+B is 8.
  const units = [
    unit("1", 1), unit("2", 2), unit("3", 3), unit("4", 4),
    unit("5", 5), unit("6", 6), unit("7", 7), unit("8", 8),
    unit("9", 4.5),
  ];
  const weights = units.map((u) => u.pop);
  const candidates = [
    { id: "A", ...at(2.5) },
    { id: "B", ...at(6.5) },
    { id: "C", ...at(4.5) },
  ];
  const radiusKm = 1.6 * 1.1119; // 1.6 units

  it("greedy alone falls into the trap", () => {
    const s = solveSites(units, weights, [], candidates, { k: 2, radiusKm, localSearch: false });
    expect(s.sites.map((x) => x.id)).toContain("C");
    expect(s.finalCovered).toBe(7);
  });

  it("swap local search escapes it", () => {
    const s = solveSites(units, weights, [], candidates, { k: 2, radiusKm });
    expect(s.sites.map((x) => x.id).sort()).toEqual(["A", "B"]);
    expect(s.finalCovered).toBe(8);
    expect(s.improvedByLocalSearch).toBe(true);
  });

  it("does not re-cover units already served by existing supply", () => {
    const s = solveSites(units, weights, [at(2.5)], candidates, { k: 1, radiusKm });
    expect(s.baselineCovered).toBe(4);
    expect(s.sites[0].id).toBe("B");
    expect(s.sites[0].gain).toBe(4);
  });

  it("stops early when nothing is left to gain", () => {
    const s = solveSites(units, weights, [at(2.5), at(6.5), at(4.5)], candidates, { k: 3, radiusKm });
    expect(s.sites).toHaveLength(0);
    expect(s.finalCovered).toBe(s.baselineCovered);
  });
});

describe("selectSites on committed data", () => {
  it("proposes k sites that raise clinic coverage", () => {
    const params = parseParams({});
    const before = coverage({ domain: "clinic", radiusKm: 1.6 });
    const r = selectSites(
      { domain: "clinic", k: 3, radiusKm: 1.6, weighting: "population" },
      params
    );
    expect(r.sites).toHaveLength(3);
    expect(r.finalCovered).toBeGreaterThan(r.baselineCovered);
    expect(r.baselineCovered).toBe(before.coveredPop);
    const after = coverage(
      { domain: "clinic", radiusKm: 1.6 },
      { add: r.sites.map((s) => ({ domain: "clinic", lon: s.lon, lat: s.lat })), remove: [] }
    );
    expect(after.coveredPop).toBe(r.finalCovered);
  });
});
