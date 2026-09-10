import { describe, expect, it } from "vitest";
import { loadTracts } from "../data/load";
import { parseParams } from "./params";
import { runAnalysisCached } from "./run";
import { findSimilar } from "./similar";

describe("findSimilar on committed data", () => {
  const result = runAnalysisCached(parseParams({}));
  const target = result.tracts.find((t) => t.biClass === "N3A1")!;

  it("returns k matches sorted by distance, never the target itself", () => {
    const m = findSimilar(result, target.geoid, { k: 5, excludeNeighbors: false });
    expect(m).toHaveLength(5);
    expect(m.map((x) => x.geoid)).not.toContain(target.geoid);
    for (let i = 1; i < m.length; i++) expect(m[i].distance).toBeGreaterThanOrEqual(m[i - 1].distance);
  });

  it("can exclude spatial neighbours", () => {
    const neighbors = new Set(
      loadTracts().features.find((f) => f.properties.geoid === target.geoid)!.properties.neighbors
    );
    const m = findSimilar(result, target.geoid, { k: 20, excludeNeighbors: true });
    for (const x of m) expect(neighbors.has(x.geoid)).toBe(false);
  });

  it("can require a clear access advantage", () => {
    const m = findSimilar(result, target.geoid, {
      k: 5,
      excludeNeighbors: true,
      minAccessAdvantage: 1,
    });
    for (const x of m) expect(x.result.access).toBeGreaterThanOrEqual(target.access + 1);
  });

  it("rejects unknown tracts", () => {
    expect(() => findSimilar(result, "13121999999", { k: 3, excludeNeighbors: false })).toThrow();
  });
});
