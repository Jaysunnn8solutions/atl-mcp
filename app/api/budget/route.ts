import { z } from "zod";
import { handleApiError, requestInput } from "@/lib/api";
import { DEFAULT_COSTS, planBudget } from "@/lib/analysis/budget";
import { domainSchema, parseParams, parseOverrides } from "@/lib/analysis/params";
import { ACCESS_DOMAINS } from "@/lib/analysis/types";

const schema = z
  .object({
    budget: z.coerce.number().min(100_000).max(10_000_000_000),
    costs: z
      .object({
        grocery: z.coerce.number().positive(),
        pharmacy: z.coerce.number().positive(),
        clinic: z.coerce.number().positive(),
        transit: z.coerce.number().positive(),
      })
      .partial()
      .default({}),
    incomeCap: z.coerce.number().min(0).max(500_000).nullable().default(65_000),
    weighting: z.enum(["population", "need"]).default("need"),
    domains: z.array(domainSchema).min(1).default(ACCESS_DOMAINS),
    minTph: z.coerce.number().min(0).max(60).default(4),
    add: z.unknown().optional(),
    remove: z.unknown().optional(),
  })
  .passthrough();

/** Budget-constrained multi-type site selection. */
async function handle(request: Request) {
  try {
    const { budget, costs, incomeCap, weighting, domains, minTph, add, remove, ...rest } = schema.parse(
      await requestInput(request)
    );
    const params = parseParams(rest);
    const overrides = parseOverrides({ add: add ?? [], remove: remove ?? [] });
    const result = planBudget(
      {
        budget,
        costs: { ...DEFAULT_COSTS, ...costs },
        radiusKm: params.radiusKm,
        incomeCap,
        weighting,
        domains,
        minTph,
      },
      params,
      overrides
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}

export { handle as POST };
