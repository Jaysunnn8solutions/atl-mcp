import { readFileSync } from "node:fs";
import path from "node:path";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Poi, Stop, TractProps } from "../analysis/types";

export type TractFeature = Feature<Polygon | MultiPolygon, TractProps>;
export type TractCollection = FeatureCollection<Polygon | MultiPolygon, TractProps>;

export interface DataManifest {
  generatedAt: string;
  acsVintage: number;
  acsPriorVintage: number;
  boundaryVintage: number;
  counties: Array<{ fips: string; name: string }>;
  counts: { tracts: number; pois: number; stops: number };
}

/**
 * Committed pipeline outputs, read once per process. The production path
 * is statically scoped to ./data so Next.js traces just that folder into
 * the function bundle. Tests and scripts can point elsewhere with
 * ATL_DATA_DIR; that branch is excluded from tracing.
 */
function readJson<T>(name: string): T {
  const override = process.env.ATL_DATA_DIR;
  const text = override
    ? readFileSync(/* turbopackIgnore: true */ path.join(override, name), "utf8")
    : readFileSync(path.join(process.cwd(), "data", name), "utf8");
  return JSON.parse(text) as T;
}

let tracts: TractCollection | null = null;
let pois: Poi[] | null = null;
let stops: Stop[] | null = null;
let manifest: DataManifest | null = null;

export function loadTracts(): TractCollection {
  if (!tracts) tracts = readJson<TractCollection>("tracts.json");
  return tracts;
}

export function loadPois(): Poi[] {
  if (!pois) pois = readJson<Poi[]>("pois.json");
  return pois;
}

export function loadStops(): Stop[] {
  if (!stops) stops = readJson<Stop[]>("stops.json");
  return stops;
}

export function loadManifest(): DataManifest {
  if (!manifest) manifest = readJson<DataManifest>("manifest.json");
  return manifest;
}

export function findTract(geoid: string): TractFeature | undefined {
  return loadTracts().features.find((f) => f.properties.geoid === geoid);
}
