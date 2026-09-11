import { z } from "zod";
import { analysisParamsSchema, EMPTY_OVERRIDES, overridesSchema, toParams } from "../analysis/params";
import { runAnalysisCached } from "../analysis/run";
import type {
  AnalysisParams,
  AnalysisResult,
  SupplyOverrides,
  TractResult,
} from "../analysis/types";
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

/** Scenario overrides, for tools that accept hypothetical supply. */
export const scenarioShape = {
  add: overridesSchema.shape.add.optional().describe(
    "Hypothetical facilities or stops to add before computing."
  ),
  remove: overridesSchema.shape.remove.optional(),
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

export type ScenarioArgs = {
  add?: SupplyOverrides["add"];
  remove?: string[];
};

export function resolveParams(args: ToolParams): AnalysisParams {
  const defined = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== undefined)
  );
  return toParams(analysisParamsSchema.parse(defined));
}

/** Accept either flat tool params or an already-built AnalysisParams. */
function isAnalysisParams(x: ToolParams | AnalysisParams): x is AnalysisParams {
  return typeof (x as AnalysisParams).weights === "object";
}

export function resolveOverrides(args: ScenarioArgs): SupplyOverrides {
  if (!args.add?.length && !args.remove?.length) return EMPTY_OVERRIDES;
  return { add: args.add ?? [], remove: args.remove ?? [] };
}

export function analyze(
  args: ToolParams | AnalysisParams,
  scenario: ScenarioArgs = {}
): AnalysisResult {
  const params = isAnalysisParams(args) ? args : resolveParams(args);
  return runAnalysisCached(params, resolveOverrides(scenario));
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

export function describeScenario(o: SupplyOverrides): string {
  if (o.add.length === 0 && o.remove.length === 0) return "";
  const adds = o.add.map((f) => `+${f.domain}${f.label ? ` "${f.label}"` : ""} at ${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}`);
  const removes = o.remove.map((id) => `-${id}`);
  return ` Scenario: ${[...adds, ...removes].join("; ")}.`;
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

export function fmtInt(x: number): string {
  return Math.round(x).toLocaleString("en-US");
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

export const geoidSchema = z
  .string()
  .regex(/^13(121|089|063)\d{6}$/)
  .describe("11-digit tract GEOID in Fulton, DeKalb or Clayton.");

/** Zod is re-exported so tool files import one thing for schemas. */
export { z };
