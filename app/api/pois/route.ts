import { loadPois, loadStops } from "@/lib/data/load";

/** Supply-side points for map overlays: POIs by category and rail stations. */
export function GET() {
  const stops = loadStops();
  return Response.json(
    {
      pois: loadPois(),
      railStations: stops.filter((s) => s.rail),
      stopCount: stops.length,
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
  );
}
