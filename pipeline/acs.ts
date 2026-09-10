/**
 * Stage 2: ACS demographics for both vintages, with the 2010→2020 tract
 * crosswalk applied to the prior vintage.
 *
 * Tract boundaries changed with the 2020 Census. The 2019 5-year estimates
 * are published on 2010 tracts; the 2024 estimates on 2020 tracts. The
 * Census relationship file lists every overlapping (2010, 2020) pair with
 * the land area of the overlap, so 2019 counts are apportioned onto 2020
 * tracts by land-area share. Medians are averaged across parts weighted
 * by apportioned population — an approximation, and documented as one.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ACS_PRIOR_VINTAGE,
  ACS_VARIABLES,
  ACS_VINTAGE,
  CACHE_DIR,
  COUNTIES,
  STATE_FIPS,
  TRACT_RELATIONSHIP_URL,
  allAcsCodes,
} from "./config";
import { parseCsvObjects } from "./lib/csv";
import { censusApiKey } from "./lib/env";
import { fetchCached, log } from "./lib/http";

/** Raw ACS row per tract, keyed by variable code. */
type AcsRow = Record<string, number | null>;

/** Census sentinel values for suppressed or unavailable estimates. */
function toEstimate(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= -222222222) return null;
  return n;
}

async function fetchVintage(vintage: number): Promise<Map<string, AcsRow>> {
  const codes = allAcsCodes();
  const rows = new Map<string, AcsRow>();
  for (const county of COUNTIES) {
    const url =
      `https://api.census.gov/data/${vintage}/acs/acs5?get=${codes.join(",")}` +
      `&for=tract:*&in=state:${STATE_FIPS}%20county:${county.fips}&key=${censusApiKey()}`;
    const buf = await fetchCached(
      url,
      `acs-${vintage}-${county.fips}.json`
    );
    const text = buf.toString("utf8");
    if (text.trimStart().startsWith("<")) {
      throw new Error(`Census API returned an error page for ${vintage}/${county.fips}`);
    }
    const table = JSON.parse(text) as string[][];
    const header = table[0];
    for (const r of table.slice(1)) {
      const rec: Record<string, string> = {};
      header.forEach((h, i) => (rec[h] = r[i]));
      const geoid = `${rec.state}${rec.county}${rec.tract}`;
      const row: AcsRow = {};
      for (const c of codes) row[c] = toEstimate(rec[c]);
      rows.set(geoid, row);
    }
  }
  log(`ACS ${vintage}: ${rows.size} tracts`);
  return rows;
}

function sum(row: AcsRow, codes: readonly string[]): number | null {
  let s = 0;
  for (const c of codes) {
    const v = row[c];
    if (v == null) return null;
    s += v;
  }
  return s;
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

export interface AcsCurrent {
  pop: number;
  households: number;
  medianIncome: number | null;
  medianRent: number | null;
  povertyRate: number | null;
  noVehicleRate: number | null;
  seniorShare: number | null;
  childShare: number | null;
  housingUnits: number;
  vacancyRate: number | null;
}

export interface AcsPrior {
  pop2019: number | null;
  medianIncome2019: number | null;
  medianRent2019: number | null;
  housingUnits2019: number | null;
}

function shapeCurrent(row: AcsRow): AcsCurrent {
  const V = ACS_VARIABLES;
  const seniors = sum(row, [...V.seniorsMale, ...V.seniorsFemale]);
  const pop = row[V.pop] ?? 0;
  return {
    pop,
    households: row[V.households] ?? 0,
    medianIncome: row[V.medianIncome],
    medianRent: row[V.medianRent],
    povertyRate: ratio(row[V.povertyBelow], row[V.povertyUniverse]),
    noVehicleRate: ratio(row[V.noVehicle], row[V.households]),
    seniorShare: ratio(seniors, pop),
    childShare: ratio(row[V.under18], pop),
    housingUnits: row[V.housingUnits] ?? 0,
    vacancyRate: ratio(row[V.vacant], row[V.housingUnits]),
  };
}

interface RelPart {
  geoid20: string;
  geoid10: string;
  /** Share of the 2010 tract's land that falls in this 2020 tract. */
  share: number;
}

async function loadRelationship(): Promise<RelPart[]> {
  const buf = await fetchCached(TRACT_RELATIONSHIP_URL, path.basename(TRACT_RELATIONSHIP_URL));
  const rows = parseCsvObjects(buf.toString("utf8"), "|");
  const parts: RelPart[] = [];
  for (const r of rows) {
    const land10 = Number(r.AREALAND_TRACT_10);
    const part = Number(r.AREALAND_PART);
    if (!(land10 > 0)) continue;
    parts.push({
      geoid20: r.GEOID_TRACT_20,
      geoid10: r.GEOID_TRACT_10,
      share: part / land10,
    });
  }
  log(`relationship file: ${parts.length} tract parts statewide`);
  return parts;
}

/** Apportion prior-vintage rows (2010 tracts) onto 2020 tract GEOIDs. */
export function crosswalk(
  prior: Map<string, AcsRow>,
  parts: RelPart[]
): Map<string, AcsPrior> {
  const V = ACS_VARIABLES;
  const acc = new Map<
    string,
    { pop: number; units: number; incW: number; incPop: number; rentW: number; rentPop: number; any: boolean }
  >();

  for (const p of parts) {
    const row = prior.get(p.geoid10);
    if (!row) continue;
    const a = acc.get(p.geoid20) ?? {
      pop: 0, units: 0, incW: 0, incPop: 0, rentW: 0, rentPop: 0, any: false,
    };
    const popPart = (row[V.pop] ?? 0) * p.share;
    const income = row[V.medianIncome];
    const rent = row[V.medianRent];
    a.pop += popPart;
    a.units += (row[V.housingUnits] ?? 0) * p.share;
    if (income != null && popPart > 0) {
      a.incW += income * popPart;
      a.incPop += popPart;
    }
    if (rent != null && popPart > 0) {
      a.rentW += rent * popPart;
      a.rentPop += popPart;
    }
    a.any = true;
    acc.set(p.geoid20, a);
  }

  const out = new Map<string, AcsPrior>();
  for (const [geoid20, a] of acc) {
    if (!a.any) continue;
    out.set(geoid20, {
      pop2019: Math.round(a.pop),
      housingUnits2019: Math.round(a.units),
      medianIncome2019: a.incPop > 0 ? Math.round(a.incW / a.incPop) : null,
      medianRent2019: a.rentPop > 0 ? Math.round(a.rentW / a.rentPop) : null,
    });
  }
  return out;
}

export interface AcsOutput {
  current: Record<string, AcsCurrent>;
  prior: Record<string, AcsPrior>;
}

export async function buildAcs(): Promise<AcsOutput> {
  const [current, prior, parts] = await Promise.all([
    fetchVintage(ACS_VINTAGE),
    fetchVintage(ACS_PRIOR_VINTAGE),
    loadRelationship(),
  ]);

  const shapedCurrent: Record<string, AcsCurrent> = {};
  for (const [geoid, row] of current) shapedCurrent[geoid] = shapeCurrent(row);

  const walked = crosswalk(prior, parts);
  const shapedPrior: Record<string, AcsPrior> = {};
  let matched = 0;
  for (const geoid of current.keys()) {
    const p = walked.get(geoid);
    if (p) {
      shapedPrior[geoid] = p;
      matched++;
    }
  }
  log(`crosswalk: ${matched} of ${current.size} current tracts have a prior-vintage match`);

  const out = { current: shapedCurrent, prior: shapedPrior };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path.join(CACHE_DIR, "acs.json"), JSON.stringify(out));
  log(`wrote cache/acs.json`);
  return out;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildAcs().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
