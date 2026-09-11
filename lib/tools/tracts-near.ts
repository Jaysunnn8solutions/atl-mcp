import { haversineKm } from "../spatial/stats";
import { verdict } from "../analysis/interpret";
import { loadStops, loadTracts } from "../data/load";
import type { AnalysisResult } from "../analysis/types";
import { analyze, clusterWord, readOnly, text, toolParamsShape, type ToolParams, z } from "./shared";

export interface Origin {
  lon: number;
  lat: number;
  label: string;
}

/** Resolve a MARTA rail station name to a point, or explain why not. */
export function resolveStation(station: string): Origin | { error: string } {
  const needle = station.toLowerCase();
  const rail = loadStops().filter((s) => s.rail);
  const matches = rail.filter((s) => (s.name ?? "").toLowerCase().includes(needle));
  if (matches.length === 0) {
    const names = [...new Set(rail.map((s) => s.name))].sort();
    return { error: `No rail station matches "${station}". Stations: ${names.join("; ")}` };
  }
  if (matches.length > 1) {
    return {
      error: `Several stations match "${station}": ${matches.map((m) => m.name).join("; ")}. Be more specific.`,
    };
  }
  return { lon: matches[0].lon, lat: matches[0].lat, label: matches[0].name };
}

/** Tracts whose centroid is within a distance of a point, nearest first, with scores. */
export function tractsAround(
  origin: Origin,
  withinKm: number,
  limit: number,
  result: AnalysisResult
): string {
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
    return `No tract centroids within ${withinKm} km of ${origin.label}.`;
  }

  return [
    `${rows.length} tracts within ${withinKm} km of ${origin.label}, nearest first:`,
    ``,
    ...rows.map(({ p, km }) => {
      const t = scores.get(p.geoid)!;
      return (
        `- ${p.name} in ${p.place}, ${p.county} (${p.geoid}) — ${km.toFixed(1)} km; ${verdict(t)} ` +
        `${clusterWord(t)} [gap ${t.gap.toFixed(2)}, need ${t.need.toFixed(2)}, access ${t.access.toFixed(2)}, class ${t.biClass}]`
      );
    }),
  ].join("\n");
}

export const tractsNearConfig = {
  title: "Find tracts near a place",
  description:
    "List tracts whose centroid is within a distance of a point, or of a named " +
    "MARTA rail station, with their scores. Provide either a station name or " +
    "lon/lat. For addresses and neighbourhood names use search_place instead.",
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
  let origin: Origin;
  if (station) {
    const resolved = resolveStation(station);
    if ("error" in resolved) return text(resolved.error);
    origin = resolved;
  } else if (lon != null && lat != null) {
    origin = { lon, lat, label: `${lat}, ${lon}` };
  } else {
    return text("Provide either a station name or both lon and lat.");
  }
  return text(tractsAround(origin, withinKm, limit, analyze(params)));
}
