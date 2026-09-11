import { handleApiError } from "@/lib/api";
import { parseParams, parseRequestBody } from "@/lib/analysis/params";
import { runAnalysisCached } from "@/lib/analysis/run";

/**
 * Per-tract need, access, gap, bivariate class and LISA cluster for a set
 * of parameters. Results are small (no geometry) so they travel fast.
 *
 * GET takes parameters as a query string. POST takes the same parameters
 * as JSON plus scenario overrides (`add`, `remove`).
 */
export function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  delete query.v; // cache-busting version tag from the client, not a parameter
  try {
    const params = parseParams(query);
    return Response.json(runAnalysisCached(params), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { params, overrides } = parseRequestBody(await request.json());
    return Response.json(runAnalysisCached(params, overrides), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
