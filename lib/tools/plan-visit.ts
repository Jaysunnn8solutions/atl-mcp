import { PRIORITY_CLASS } from "../analysis/classify";
import { loadTracts } from "../data/load";
import { planRoute } from "../spatial/tsp";
import {
  analyze,
  geoidSchema,
  readOnly,
  text,
  toolParamsShape,
  type ToolParams,
  z,
} from "./shared";
import { resolveStation, type Origin } from "./tracts-near";

export const planVisitConfig = {
  title: "Plan a field visit",
  description:
    "Order a set of tracts into the shortest visiting route from a starting " +
    "point (a MARTA station or lon/lat), using nearest-neighbour plus 2-opt on " +
    "straight-line distances. Pass GEOIDs, or omit them to route the top " +
    "priority tracts. A planning aid, not turn-by-turn directions.",
  inputSchema: z
    .object({
      geoids: z.array(geoidSchema).max(25).optional().describe("Tracts to visit. Defaults to the top priority tracts."),
      limit: z.number().int().min(2).max(25).default(8).describe("How many priority tracts to route when geoids is omitted."),
      county: z.enum(["Fulton", "DeKalb", "Clayton"]).optional().describe("With geoids omitted: restrict to a county."),
      startStation: z.string().min(2).optional().describe("Start from this MARTA rail station."),
      startLon: z.number().min(-85.5).max(-83.5).optional(),
      startLat: z.number().min(33).max(34.5).optional(),
      roundTrip: z.boolean().default(true).describe("Return to the start at the end."),
      ...toolParamsShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  geoids?: string[];
  limit: number;
  county?: "Fulton" | "DeKalb" | "Clayton";
  startStation?: string;
  startLon?: number;
  startLat?: number;
  roundTrip: boolean;
}

export function planVisitHandler({
  geoids,
  limit,
  county,
  startStation,
  startLon,
  startLat,
  roundTrip,
  ...params
}: Args) {
  const result = analyze(params);
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));

  let targets: string[];
  if (geoids && geoids.length > 0) {
    const unknown = geoids.filter((g) => !props.has(g));
    if (unknown.length) return text(`Unknown tracts: ${unknown.join(", ")}`);
    targets = [...new Set(geoids)];
  } else {
    targets = result.tracts
      .filter((t) => t.biClass === PRIORITY_CLASS && (!county || props.get(t.geoid)!.county === county))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, limit)
      .map((t) => t.geoid);
  }
  if (targets.length < 2) return text("Need at least two tracts to plan a route.");

  let start: Origin | null = null;
  if (startStation) {
    const r = resolveStation(startStation);
    if ("error" in r) return text(r.error);
    start = r;
  } else if (startLon != null && startLat != null) {
    start = { lon: startLon, lat: startLat, label: `${startLat}, ${startLon}` };
  }

  const points = targets.map((g) => ({ lon: props.get(g)!.cx, lat: props.get(g)!.cy }));
  const labels = targets.map((g) => `${props.get(g)!.name}, ${props.get(g)!.county} (${g})`);
  if (start) {
    points.unshift({ lon: start.lon, lat: start.lat });
    labels.unshift(`Start: ${start.label}`);
  }

  const route = planRoute(points, { start: 0, roundTrip });
  const lines = route.order.map((idx, i) => {
    const leg = i === 0 ? "" : ` — ${route.legsKm[i - 1].toFixed(1)} km`;
    return `${i + 1}. ${labels[idx]}${leg}`;
  });
  if (roundTrip && route.legsKm.length === route.order.length) {
    lines.push(`${route.order.length + 1}. back to ${labels[route.order[0]]} — ${route.legsKm[route.legsKm.length - 1].toFixed(1)} km`);
  }

  return text(
    [
      `Visit order for ${targets.length} tracts${start ? ` from ${start.label}` : ""}, ` +
        `${route.totalKm.toFixed(1)} km straight-line${roundTrip ? " round trip" : ""}:`,
      ``,
      ...lines,
      ``,
      `Distances are great-circle between tract centroids (and the start point); ` +
        `road distance is typically 20–40% longer.`,
    ].join("\n")
  );
}
