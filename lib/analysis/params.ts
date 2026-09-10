import { z } from "zod";
import type { AnalysisParams } from "./types";

/**
 * One schema shared by the HTTP API and the MCP tools, so both surfaces
 * accept the same knobs and apply the same defaults.
 */
export const analysisParamsSchema = z
  .object({
    radiusKm: z
      .coerce.number()
      .min(0.25)
      .max(5)
      .default(1.6)
      .describe("Catchment radius in km. 1.6 km is about one mile."),
    decay: z
      .enum(["binary", "gaussian"])
      .default("gaussian")
      .describe(
        "binary: everything inside the radius counts equally. " +
          "gaussian: nearer supply counts more."
      ),
    permutations: z
      .coerce.number()
      .int()
      .min(49)
      .max(999)
      .default(199)
      .describe("Permutations for local Moran's I significance."),
    wPoverty: z.coerce.number().min(0).max(5).default(1),
    wNoVehicle: z.coerce.number().min(0).max(5).default(1),
    wSeniors: z.coerce.number().min(0).max(5).default(0.5),
    wChildren: z.coerce.number().min(0).max(5).default(0.5),
    wGrowth: z.coerce.number().min(0).max(5).default(1),
  })
  .strict();

export type AnalysisQuery = z.input<typeof analysisParamsSchema>;

export function toParams(q: z.output<typeof analysisParamsSchema>): AnalysisParams {
  return {
    radiusKm: q.radiusKm,
    decay: q.decay,
    permutations: q.permutations,
    weights: {
      poverty: q.wPoverty,
      noVehicle: q.wNoVehicle,
      seniors: q.wSeniors,
      children: q.wChildren,
      growth: q.wGrowth,
    },
  };
}

/** Parse loosely-typed input (query string or tool args) into AnalysisParams. */
export function parseParams(input: unknown): AnalysisParams {
  return toParams(analysisParamsSchema.parse(input ?? {}));
}
