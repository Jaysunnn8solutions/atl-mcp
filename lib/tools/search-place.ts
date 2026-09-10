import { geocode } from "../geocode";
import { analyze, readOnly, text, toolParamsShape, type ToolParams, z } from "./shared";
import { tractsAround } from "./tracts-near";

export const searchPlaceConfig = {
  title: "Search a place",
  description:
    "Geocode an address, neighbourhood, landmark or station name inside metro " +
    "Atlanta and list the scored tracts around it. Use this when a question " +
    "names a place rather than a GEOID or coordinates.",
  inputSchema: z
    .object({
      query: z.string().min(2).max(120).describe("e.g. 'Bankhead', 'Emory University', '241 Peachtree St NE'"),
      withinKm: z.number().min(0.5).max(15).default(2),
      limit: z.number().int().min(1).max(50).default(10),
      ...toolParamsShape,
    })
    .strict(),
  annotations: { ...readOnly, openWorldHint: true },
};

interface Args extends ToolParams {
  query: string;
  withinKm: number;
  limit: number;
}

export async function searchPlaceHandler({ query, withinKm, limit, ...params }: Args) {
  const matches = await geocode(query);
  if (matches.length === 0) {
    return text(
      `Nothing found for "${query}" inside metro Atlanta. Try a street address, a ` +
        `neighbourhood, or a MARTA station name.`
    );
  }
  const best = matches[0];
  const others =
    matches.length > 1
      ? `\n\nOther matches: ${matches
          .slice(1)
          .map((m) => `${m.label} (${m.lat.toFixed(4)}, ${m.lon.toFixed(4)})`)
          .join("; ")}. Pass lon/lat to tracts_near to use one of these instead.`
      : "";
  const body = tractsAround(
    { lon: best.lon, lat: best.lat, label: `${best.label} (${best.lat.toFixed(4)}, ${best.lon.toFixed(4)})` },
    withinKm,
    limit,
    analyze(params)
  );
  return text(`Matched "${query}" to ${best.label} via ${best.source}.\n\n${body}${others}`);
}
