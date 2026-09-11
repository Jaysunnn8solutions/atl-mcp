import { z } from "zod";
import type { AnalysisParams, SupplyOverrides } from "./types";

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
    wIncome: z.coerce.number().min(0).max(5).default(1),
  })
  .strict();

export type AnalysisQuery = z.input<typeof analysisParamsSchema>;

export const domainSchema = z.enum(["grocery", "pharmacy", "clinic", "transit"]);

/** Study-area bounds with a margin; anything outside is a typo, not a scenario. */
export const lonSchema = z.number().min(-85.2).max(-83.6);
export const latSchema = z.number().min(33.2).max(34.4);

export const facilitySchema = z
  .object({
    domain: domainSchema,
    lon: lonSchema,
    lat: latSchema,
    capacity: z
      .number()
      .positive()
      .max(200)
      .optional()
      .describe("1 for a POI (default); trips per hour for a stop (default 6)."),
    label: z.string().max(80).optional(),
  })
  .strict();

export const overridesSchema = z
  .object({
    add: z.array(facilitySchema).max(50).default([]),
    remove: z
      .array(z.string().max(40))
      .max(200)
      .default([])
      .describe("Ids of existing POIs or stops to remove, from get_tract or the map."),
  })
  .strict();

export const EMPTY_OVERRIDES: SupplyOverrides = { add: [], remove: [] };

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
      income: q.wIncome,
    },
  };
}

/** Parse loosely-typed input (query string or tool args) into AnalysisParams. */
export function parseParams(input: unknown): AnalysisParams {
  return toParams(analysisParamsSchema.parse(input ?? {}));
}

export function parseOverrides(input: unknown): SupplyOverrides {
  const o = overridesSchema.parse(input ?? {});
  return { add: o.add, remove: o.remove };
}

/** Split a JSON body into analysis params and supply overrides. */
export function parseRequestBody(body: unknown): {
  params: AnalysisParams;
  overrides: SupplyOverrides;
} {
  const record = (body ?? {}) as Record<string, unknown>;
  const { add, remove, ...rest } = record;
  return {
    params: parseParams(rest),
    overrides: parseOverrides({ add: add ?? [], remove: remove ?? [] }),
  };
}
