import path from "node:path";

/** Study area: the three counties that fund and are served by MARTA. */
export const COUNTIES: Array<{ fips: string; name: string }> = [
  { fips: "121", name: "Fulton" },
  { fips: "089", name: "DeKalb" },
  { fips: "063", name: "Clayton" },
];
export const STATE_FIPS = "13";

export const BOUNDARY_VINTAGE = 2024;
export const ACS_VINTAGE = 2024;
/** Prior vintage. 2015–2019 and 2020–2024 do not overlap, per Census guidance. */
export const ACS_PRIOR_VINTAGE = 2019;

export const ROOT = path.resolve(import.meta.dirname, "..");
export const CACHE_DIR = path.join(ROOT, "pipeline", "cache");
export const DATA_DIR = path.join(ROOT, "data");

export const TRACT_SHAPE_URL = `https://www2.census.gov/geo/tiger/GENZ${BOUNDARY_VINTAGE}/shp/cb_${BOUNDARY_VINTAGE}_${STATE_FIPS}_tract_500k.zip`;
export const TRACT_RELATIONSHIP_URL = `https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st${STATE_FIPS}.txt`;
export const MARTA_GTFS_URL =
  "https://www.itsmarta.com/google_transit_feed/google_transit.zip";
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * ACS detailed-table variables pulled for both vintages. Every code here
 * exists unchanged in 2019 and 2024, which is what makes the comparison
 * possible without a variable crosswalk on top of the geography crosswalk.
 */
export const ACS_VARIABLES = {
  pop: "B01003_001E",
  households: "B08201_001E",
  noVehicle: "B08201_002E",
  medianIncome: "B19013_001E",
  medianRent: "B25064_001E",
  povertyUniverse: "B17001_001E",
  povertyBelow: "B17001_002E",
  under18: "B09001_001E",
  housingUnits: "B25002_001E",
  vacant: "B25002_003E",
  // Age 65+ is not published as a single detailed-table cell; sum the
  // sex-by-age bands.
  seniorsMale: ["B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E"],
  seniorsFemale: ["B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E"],
} as const;

export function allAcsCodes(): string[] {
  const out: string[] = [];
  for (const v of Object.values(ACS_VARIABLES)) {
    if (Array.isArray(v)) out.push(...v);
    else out.push(v as string);
  }
  return out;
}
