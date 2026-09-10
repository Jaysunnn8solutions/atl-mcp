import { describe, expect, it } from "vitest";
import { loadManifest, loadTracts } from "../data/load";
import { PRIORITY_CLASS } from "./classify";
import { parseParams } from "./params";
import { runAnalysis, runAnalysisCached } from "./run";

/**
 * Integration test over the committed pipeline outputs. It guards the data
 * contract as much as the code: if a refresh produces a tract file the
 * engine cannot score, this is where it shows up.
 */
describe("runAnalysis on committed data", () => {
  const params = parseParams({});
  const started = performance.now();
  const result = runAnalysis(params);
  const elapsedMs = performance.now() - started;

  it("scores every tract in the manifest", () => {
    const manifest = loadManifest();
    expect(result.tracts).toHaveLength(manifest.counts.tracts);
    expect(result.summary.tractCount).toBe(loadTracts().features.length);
  });

  it("produces finite scores and a full set of classes", () => {
    for (const t of result.tracts) {
      expect(Number.isFinite(t.need)).toBe(true);
      expect(Number.isFinite(t.access)).toBe(true);
      expect(t.gap).toBeCloseTo(t.need - t.access, 3);
      expect(t.lisa.p).toBeGreaterThan(0);
      expect(t.lisa.p).toBeLessThanOrEqual(1);
    }
    const classes = new Set(result.tracts.map((t) => t.biClass));
    expect(classes.has(PRIORITY_CLASS)).toBe(true);
    expect(result.summary.priorityCount).toBeGreaterThan(0);
  });

  it("finds that gaps cluster in space", () => {
    // Need and access are both spatially smooth, so their difference should
    // be too. A non-positive I would mean the pipeline scrambled geography.
    expect(result.global.I).toBeGreaterThan(0);
    expect(result.global.p).toBeLessThan(0.05);
    expect(result.summary.hotspotCount).toBeGreaterThan(0);
  });

  it("runs fast enough to compute per request", () => {
    expect(elapsedMs).toBeLessThan(5000);
  });

  it("memoizes identical parameter sets", () => {
    const a = runAnalysisCached(parseParams({ radiusKm: 2 }));
    const b = runAnalysisCached(parseParams({ radiusKm: "2" }));
    expect(a).toBe(b);
  });

  it("responds to the catchment radius", () => {
    const wide = runAnalysis(parseParams({ radiusKm: 4, decay: "binary" }));
    const narrow = runAnalysis(parseParams({ radiusKm: 0.5, decay: "binary" }));
    const meanRaw = (r: typeof wide) =>
      r.tracts.reduce((s, t) => s + t.accessBy.grocery, 0) / r.tracts.length;
    // A wider catchment reaches more supply per tract than a narrow one.
    expect(meanRaw(wide)).toBeGreaterThan(meanRaw(narrow));
  });
});
