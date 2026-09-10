import { z } from "zod";
import { handleApiError, requestInput } from "@/lib/api";
import { domainSchema, parseParams, parseOverrides } from "@/lib/analysis/params";
import { selectSites } from "@/lib/analysis/site-selection";

const schema = z.object({
  domain: domainSchema,
  k: z.coerce.number().int().min(1).max(10).default(3),
  weighting: z.enum(["population", "need"]).default("need"),
  minTph: z.coerce.number().min(0).max(60).optional(),
  add: z.unknown().optional(),
  remove: z.unknown().optional(),
});

/** Maximal covering site selection over tract centroids. */
async function handle(request: Request) {
  try {
    const input = await requestInput(request);
    const { domain, k, weighting, minTph, add, remove, ...rest } = schema
      .passthrough()
      .parse(input);
    const params = parseParams(rest);
    const overrides = parseOverrides({ add: add ?? [], remove: remove ?? [] });
    const result = selectSites(
      { domain, k, radiusKm: params.radiusKm, weighting, minTph },
      params,
      overrides
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}

export { handle as GET, handle as POST };
