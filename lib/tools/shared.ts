import { z } from "zod";
import { analysisParamsSchema, toParams } from "../analysis/params";
import { runAnalysisCached } from "../analysis/run";
import type { AnalysisParams, AnalysisResult, TractResult } from "../analysis/types";
import { loadTracts } from "../data/load";

/**
 * Parameters every analysis tool accepts. Optional in the tool schema so a
 * model can call with no arguments and get the defaults the map uses.
 */
export const toolParamsShape = {
  radiusKm: analysisParamsSchema.shape.radiusKm.optional(),
  decay: analysisParamsSchema.shape.decay.optional(),
  wPoverty: analysisParamsSchema.shape.wPoverty.optional(),
  wNoVehicle: analysisParamsSchema.shape.wNoVehicle.optional(),
  wSeniors: analysisParamsSchema.shape.wSeniors.optional(),
  wChildren: analysisParamsSchema.shape.wChildren.optional(),
  wGrowth: analysisParamsSchema.shape.wGrowth.optional(),
};

export type ToolParams = {
  radiusKm?: number;
  decay?: "binary" | "gaussian";
  wPoverty?: number;
  wNoVehicle?: number;
  wSeniors?: number;
  wChildren?: number;
  wGrowth?: number;
};

export function resolveParams(args: ToolParams): AnalysisParams {
  const defined = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== undefined)
  );
  return toParams(analysisParamsSchema.parse(defined));
}

export function analyze(args: ToolParams): AnalysisResult {
  return runAnalysisCached(resolveParams(args));
}

export const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

export function error(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

export function describeParams(p: AnalysisParams): string {
  const w = p.weights;
  return (
    `radius ${p.radiusKm} km, ${p.decay} decay; need weights: ` +
    `poverty ${w.poverty}, no-vehicle ${w.noVehicle}, seniors ${w.seniors}, ` +
    `children ${w.children}, growth ${w.growth}`
  );
}

export function tractLabel(geoid: string): string {
  const f = loadTracts().features.find((t) => t.properties.geoid === geoid);
  return f ? `${f.properties.name}, ${f.properties.county} (${geoid})` : geoid;
}

export function fmtPct(x: number | null): string {
  return x == null ? "n/a" : `${(x * 100).toFixed(1)}%`;
}

export function fmtMoney(x: number | null): string {
  return x == null ? "n/a" : `$${Math.round(x).toLocaleString("en-US")}`;
}

export function clusterWord(t: TractResult): string {
  switch (t.lisa.cluster) {
    case "HH":
      return "high-gap cluster";
    case "LL":
      return "low-gap cluster";
    case "HL":
      return "high-gap outlier among low neighbors";
    case "LH":
      return "low-gap outlier among high neighbors";
    default:
      return "no significant cluster";
  }
}

/** Zod is re-exported so tool files import one thing for schemas. */
export { z };
