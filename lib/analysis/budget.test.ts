import { describe, expect, it } from "vitest";
import { DEFAULT_COSTS, planBudget } from "./budget";
import { parseParams } from "./params";
import { ACCESS_DOMAINS } from "./types";

const params = parseParams({});

describe("planBudget on committed data", () => {
  it("spends within budget and reports gains by type", () => {
    const r = planBudget(
      {
        budget: 100_000_000,
        costs: DEFAULT_COSTS,
        radiusKm: 1.6,
        incomeCap: 65_000,
        weighting: "need",
        domains: ACCESS_DOMAINS,
      },
      params
    );
    expect(r.spent).toBeLessThanOrEqual(100_000_000);
    expect(r.spent + r.remaining).toBe(100_000_000);
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.focusPop).toBeGreaterThan(0);
    expect(r.focusPop).toBeLessThan(r.totalPop);
    expect(r.residentsGainedAny).toBeGreaterThan(0);
    for (const d of ACCESS_DOMAINS) {
      expect(r.byDomain[d].coverageAfter).toBeGreaterThanOrEqual(r.byDomain[d].coverageBefore);
      expect(r.byDomain[d].spent).toBe(r.byDomain[d].count * DEFAULT_COSTS[d]);
    }
    expect(Object.values(r.byDomain).reduce((s, d) => s + d.spent, 0)).toBe(r.spent);
  });

  it("counts only frequent stops as transit coverage when asked", () => {
    const any = planBudget(
      { budget: 2_000_000, costs: DEFAULT_COSTS, radiusKm: 1.6, incomeCap: 65_000, weighting: "population", domains: ["transit"] },
      params
    );
    const frequent = planBudget(
      { budget: 2_000_000, costs: DEFAULT_COSTS, radiusKm: 1.6, incomeCap: 65_000, weighting: "population", domains: ["transit"], minTph: 4 },
      params
    );
    expect(frequent.byDomain.transit.coverageBefore).toBeLessThan(any.byDomain.transit.coverageBefore);
  });

  it("buys nothing it cannot afford", () => {
    const r = planBudget(
      {
        budget: 1_000_000,
        costs: DEFAULT_COSTS,
        radiusKm: 1.6,
        incomeCap: null,
        weighting: "population",
        domains: ACCESS_DOMAINS,
      },
      params
    );
    expect(r.picks).toHaveLength(0);
    expect(r.remaining).toBe(1_000_000);
  });

  it("prefers cheaper types when their benefit per dollar is higher", () => {
    const r = planBudget(
      {
        budget: 20_000_000,
        costs: { ...DEFAULT_COSTS, grocery: 19_000_000, pharmacy: 1_000_000 },
        radiusKm: 1.6,
        incomeCap: 65_000,
        weighting: "population",
        domains: ["grocery", "pharmacy"],
      },
      params
    );
    expect(r.byDomain.pharmacy.count).toBeGreaterThan(r.byDomain.grocery.count);
  });

  it("respects the domain restriction", () => {
    const r = planBudget(
      {
        budget: 30_000_000,
        costs: DEFAULT_COSTS,
        radiusKm: 1.6,
        incomeCap: 65_000,
        weighting: "need",
        domains: ["clinic"],
      },
      params
    );
    expect(r.picks.every((p) => p.domain === "clinic")).toBe(true);
    expect(r.byDomain.grocery.count).toBe(0);
  });
});
