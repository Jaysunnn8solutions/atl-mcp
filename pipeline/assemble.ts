/**
 * Stage 5: join geometry, demographics and the nearest rail station into
 * the committed tract file, and write a manifest describing what was built.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Stop, TractProps } from "../lib/analysis/types";
import type { TractCollection, DataManifest } from "../lib/data/load";
import { haversineKm } from "../lib/spatial/stats";
import type { AcsOutput } from "./acs";
import {
  ACS_PRIOR_VINTAGE,
  ACS_VINTAGE,
  BOUNDARY_VINTAGE,
  COUNTIES,
  DATA_DIR,
} from "./config";
import { log } from "./lib/http";
import type { TractGeo } from "./tracts";

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function assemble(
  tracts: TractGeo[],
  acs: AcsOutput,
  stops: Stop[],
  counts: { pois: number; stops: number }
): TractCollection {
  const rail = stops.filter((s) => s.rail);
  let missing = 0;
  const features = tracts.map((t) => {
    const cur = acs.current[t.geoid];
    const prior = acs.prior[t.geoid];
    if (!cur) missing++;

    let nearest = { name: "", km: Infinity };
    for (const s of rail) {
      const km = haversineKm(t.cx, t.cy, s.lon, s.lat);
      if (km < nearest.km) nearest = { name: titleCase(s.name.replace(/\s+STATION$/i, "")), km };
    }

    const props: TractProps = {
      geoid: t.geoid,
      name: t.name,
      countyFips: t.countyFips,
      county: t.county,
      place: t.place,
      nearestRail: { name: nearest.name, km: Math.round(nearest.km * 10) / 10 },
      landKm2: t.landKm2,
      cx: t.cx,
      cy: t.cy,
      neighbors: t.neighbors,
      pop: cur?.pop ?? 0,
      households: cur?.households ?? 0,
      medianIncome: cur?.medianIncome ?? null,
      medianRent: cur?.medianRent ?? null,
      povertyRate: cur?.povertyRate ?? null,
      noVehicleRate: cur?.noVehicleRate ?? null,
      seniorShare: cur?.seniorShare ?? null,
      childShare: cur?.childShare ?? null,
      housingUnits: cur?.housingUnits ?? 0,
      vacancyRate: cur?.vacancyRate ?? null,
      pop2019: prior?.pop2019 ?? null,
      medianIncome2019: prior?.medianIncome2019 ?? null,
      medianRent2019: prior?.medianRent2019 ?? null,
      housingUnits2019: prior?.housingUnits2019 ?? null,
    };
    return { type: "Feature" as const, properties: props, geometry: t.geometry };
  });
  if (missing > 0) log(`warning: ${missing} tracts have no current ACS row`);

  const fc: TractCollection = { type: "FeatureCollection", features };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, "tracts.json"), JSON.stringify(fc));
  log(`wrote data/tracts.json (${features.length} tracts)`);

  const manifest: DataManifest = {
    generatedAt: new Date().toISOString(),
    acsVintage: ACS_VINTAGE,
    acsPriorVintage: ACS_PRIOR_VINTAGE,
    boundaryVintage: BOUNDARY_VINTAGE,
    counties: COUNTIES,
    counts: { tracts: features.length, ...counts },
  };
  writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  log(`wrote data/manifest.json`);
  return fc;
}
