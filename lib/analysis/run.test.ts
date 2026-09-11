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
    expect(result.summary.priorityPop).toBeGreaterThan(0);
  });

  it("reports percentile ranks and absolute coverage shares", () => {
    for (const t of result.tracts) {
      expect(t.needPct).toBeGreaterThanOrEqual(0);
      expect(t.needPct).toBeLessThanOrEqual(100);
      expect(t.accessPct).toBeGreaterThanOrEqual(0);
      expect(t.accessPct).toBeLessThanOrEqual(100);
    }
    const best = result.tracts.reduce((a, b) => (b.access > a.access ? b : a));
    expect(best.accessPct).toBe(100);
    for (const share of Object.values(result.summary.coverageShare)) {
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect(result.summary.totalPop).toBeGreaterThan(1_000_000);
  });

  it("carries place names and nearest rail stations on every tract", () => {
    for (const f of loadTracts().features) {
      expect(f.properties.place.length).toBeGreaterThan(0);
      expect(f.properties.nearestRail.name.length).toBeGreaterThan(0);
      expect(f.properties.nearestRail.km).toBeGreaterThanOrEqual(0);
    }
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

  it("treats lower income as higher need", () => {
    const withIncome = runAnalysis(parseParams({ wIncome: 5, wPoverty: 0, wNoVehicle: 0, wSeniors: 0, wChildren: 0, wGrowth: 0 }));
    const props = loadTracts().features.map((f) => f.properties);
    const richest = props.reduce((a, b) => ((b.medianIncome ?? 0) > (a.medianIncome ?? 0) ? b : a));
    const poorest = props.reduce((a, b) => ((b.medianIncome ?? Infinity) < (a.medianIncome ?? Infinity) ? b : a));
    const need = new Map(withIncome.tracts.map((t) => [t.geoid, t.need]));
    expect(need.get(poorest.geoid)!).toBeGreaterThan(need.get(richest.geoid)!);
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
