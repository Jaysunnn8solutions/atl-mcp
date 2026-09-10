import { haversineKm } from "../spatial/stats";
import { loadStops, loadTracts } from "../data/load";
import { analyze, clusterWord, readOnly, text, toolParamsShape, type ToolParams, z } from "./shared";

export const tractsNearConfig = {
  title: "Find tracts near a place",
  description:
    "List tracts whose centroid is within a distance of a point, or of a named " +
    "MARTA rail station, with their scores. Use this to answer questions like " +
    "'what does the area around Five Points look like'. Provide either a station " +
    "name or lon/lat.",
  inputSchema: z
    .object({
      station: z
        .string()
        .min(2)
        .optional()
        .describe("MARTA rail station name, matched case-insensitively (e.g. 'Five Points')."),
      lon: z.number().min(-85.5).max(-83.5).optional(),
      lat: z.number().min(33).max(34.5).optional(),
      withinKm: z.number().min(0.5).max(15).default(3),
      limit: z.number().int().min(1).max(50).default(15),
      ...toolParamsShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  station?: string;
  lon?: number;
  lat?: number;
  withinKm: number;
  limit: number;
}

export function tractsNearHandler({ station, lon, lat, withinKm, limit, ...params }: Args) {
  let origin: { lon: number; lat: number; label: string };
  if (station) {
    const needle = station.toLowerCase();
    const matches = loadStops().filter(
      (s) => s.rail && (s.name ?? "").toLowerCase().includes(needle)
    );
    if (matches.length === 0) {
      const names = [...new Set(loadStops().filter((s) => s.rail).map((s) => s.name))].sort();
      return text(`No rail station matches "${station}". Stations: ${names.join("; ")}`);
    }
    if (matches.length > 1) {
      return text(
        `Several stations match "${station}": ${matches.map((m) => m.name).join("; ")}. Be more specific.`
      );
    }
    origin = { lon: matches[0].lon, lat: matches[0].lat, label: matches[0].name };
  } else if (lon != null && lat != null) {
    origin = { lon, lat, label: `${lat}, ${lon}` };
  } else {
    return text("Provide either a station name or both lon and lat.");
  }

  const result = analyze(params);
  const scores = new Map(result.tracts.map((t) => [t.geoid, t]));
  const rows = loadTracts()
    .features.map((f) => ({
      p: f.properties,
      km: haversineKm(origin.lon, origin.lat, f.properties.cx, f.properties.cy),
    }))
    .filter((x) => x.km <= withinKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);

  if (rows.length === 0) {
    return text(`No tract centroids within ${withinKm} km of ${origin.label}.`);
  }

  return text(
    [
      `${rows.length} tracts within ${withinKm} km of ${origin.label}, nearest first:`,
      ``,
      ...rows.map(({ p, km }) => {
        const t = scores.get(p.geoid)!;
        return (
          `- ${p.name}, ${p.county} (${p.geoid}) — ${km.toFixed(1)} km; gap ${t.gap.toFixed(2)}, ` +
          `need ${t.need.toFixed(2)}, access ${t.access.toFixed(2)}, class ${t.biClass}, ${clusterWord(t)}`
        );
      }),
    ].join("\n")
  );
}
