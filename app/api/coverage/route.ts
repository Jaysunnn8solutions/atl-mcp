import { z } from "zod";
import { handleApiError, requestInput } from "@/lib/api";
import { coverage } from "@/lib/analysis/coverage";
import { analysisParamsSchema, domainSchema, parseOverrides } from "@/lib/analysis/params";

const schema = z.object({
  domain: domainSchema,
  radiusKm: analysisParamsSchema.shape.radiusKm,
  minTph: z.coerce.number().min(0).max(60).optional(),
  add: z.unknown().optional(),
  remove: z.unknown().optional(),
});

/** Binary coverage per tract plus contiguous uncovered clusters. */
async function handle(request: Request) {
  try {
    const input = schema.parse(await requestInput(request));
    const overrides = parseOverrides({ add: input.add ?? [], remove: input.remove ?? [] });
    const result = coverage(
      { domain: input.domain, radiusKm: input.radiusKm, minTph: input.minTph },
      overrides
    );
    return Response.json(result, {
      headers: { "Cache-Control": request.method === "GET" ? "public, max-age=300" : "no-store" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export { handle as GET, handle as POST };
