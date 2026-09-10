import { ZodError } from "zod";
import { parseParams } from "@/lib/analysis/params";
import { runAnalysisCached } from "@/lib/analysis/run";

/**
 * Per-tract need, access, gap, bivariate class and LISA cluster for a set
 * of parameters. Results are small (no geometry) so they travel fast.
 */
export function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const params = parseParams(query);
    return Response.json(runAnalysisCached(params), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "Invalid parameters", issues: err.issues },
        { status: 400 }
      );
    }
    throw err;
  }
}
