import { loadTracts } from "@/lib/data/load";

/**
 * Tract geometry and base demographics. This never changes between
 * parameter tweaks, so the client fetches it once and caches hard.
 */
export function GET() {
  return Response.json(loadTracts(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
