/**
 * Stage 3: points of interest from OpenStreetMap via the Overpass API.
 *
 * The bounding box is the study area plus a ~3 km buffer, so a grocery
 * store just across the county line still counts for the tracts near it.
 * Ways and relations (building footprints) are reduced to their centre.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Poi, PoiCategory } from "../lib/analysis/types";
import { DATA_DIR, OVERPASS_URL } from "./config";
import { fetchCached, log } from "./lib/http";
import type { TractGeo } from "./tracts";

const BUFFER_DEG = 0.03;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function categorize(tags: Record<string, string>): PoiCategory | null {
  if (tags.shop === "supermarket" || tags.shop === "greengrocer") return "grocery";
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (["clinic", "doctors", "hospital"].includes(tags.amenity ?? "")) return "clinic";
  if (["clinic", "doctor", "hospital"].includes(tags.healthcare ?? "")) return "clinic";
  return null;
}

export function studyBbox(tracts: TractGeo[]): [number, number, number, number] {
  let s = 90, w = 180, n = -90, e = -180;
  for (const t of tracts) {
    const coords =
      t.geometry.type === "Polygon" ? [t.geometry.coordinates] : t.geometry.coordinates;
    for (const poly of coords) {
      for (const [lon, lat] of poly[0]) {
        if (lat < s) s = lat;
        if (lat > n) n = lat;
        if (lon < w) w = lon;
        if (lon > e) e = lon;
      }
    }
  }
  return [s - BUFFER_DEG, w - BUFFER_DEG, n + BUFFER_DEG, e + BUFFER_DEG];
}

export async function buildPois(tracts: TractGeo[]): Promise<Poi[]> {
  const [s, w, n, e] = studyBbox(tracts);
  const bbox = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  const query = `
[out:json][timeout:180];
(
  nwr["shop"~"^(supermarket|greengrocer)$"](${bbox});
  nwr["amenity"="pharmacy"](${bbox});
  nwr["amenity"~"^(clinic|doctors|hospital)$"](${bbox});
  nwr["healthcare"~"^(clinic|doctor|hospital)$"](${bbox});
);
out center tags;`;

  const buf = await fetchCached(OVERPASS_URL, "overpass-pois.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  const json = JSON.parse(buf.toString("utf8")) as { elements: OverpassElement[] };

  const seen = new Set<string>();
  const pois: Poi[] = [];
  for (const el of json.elements) {
    const tags = el.tags ?? {};
    const category = categorize(tags);
    if (!category) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const id = `${el.type[0]}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    pois.push({
      id,
      name: tags.name ?? tags.brand ?? `(unnamed ${category})`,
      category,
      lon: Math.round(lon * 1e6) / 1e6,
      lat: Math.round(lat * 1e6) / 1e6,
    });
  }

  const counts = pois.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});
  log(`POIs: ${JSON.stringify(counts)}`);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, "pois.json"), JSON.stringify(pois));
  log(`wrote data/pois.json`);
  return pois;
}
