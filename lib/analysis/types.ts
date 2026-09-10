import type { Cluster } from "../spatial/moran";

/** Properties attached to each tract by the offline pipeline. */
export interface TractProps {
  geoid: string;
  name: string;
  countyFips: string;
  county: string;
  landKm2: number;
  /** Centroid longitude/latitude, used as the demand location. */
  cx: number;
  cy: number;
  /** GEOIDs of queen-contiguous neighbors (share an edge or vertex). */
  neighbors: string[];

  // ACS 5-year, current vintage (2020 tract geography).
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

  // ACS 5-year, prior vintage, apportioned from 2010 tracts onto 2020 tracts.
  pop2019: number | null;
  medianIncome2019: number | null;
  medianRent2019: number | null;
  housingUnits2019: number | null;
}

export type PoiCategory = "grocery" | "pharmacy" | "clinic";

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  lon: number;
  lat: number;
}

export interface Stop {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Scheduled weekday trips per hour across all routes serving the stop. */
  tph: number;
  rail: boolean;
}

export type AccessDomain = PoiCategory | "transit";

export interface NeedWeights {
  poverty: number;
  noVehicle: number;
  seniors: number;
  children: number;
  growth: number;
}

export interface AnalysisParams {
  radiusKm: number;
  decay: "binary" | "gaussian";
  weights: NeedWeights;
  permutations: number;
}

export interface TractResult {
  geoid: string;
  /** Composite need index in z-score units. */
  need: number;
  /** Composite access index in z-score units. */
  access: number;
  /** need - access. Positive means need outruns access. */
  gap: number;
  /** Raw 2SFCA accessibility per 1,000 residents, by domain. */
  accessBy: Record<AccessDomain, number>;
  /** Standardized need components that fed the composite. */
  needBy: Record<keyof NeedWeights, number>;
  popGrowth: number | null;
  needTertile: 1 | 2 | 3;
  accessTertile: 1 | 2 | 3;
  /** Bivariate class, e.g. "N3A1" = highest-need third, lowest-access third. */
  biClass: string;
  lisa: { I: number; p: number; cluster: Cluster };
}

export interface AnalysisSummary {
  tractCount: number;
  populated: number;
  /** Tracts in the highest-need, lowest-access cell. */
  priorityCount: number;
  /** Tracts in a significant high-gap cluster. */
  hotspotCount: number;
  byCounty: Array<{
    county: string;
    tracts: number;
    priority: number;
    meanNeed: number;
    meanAccess: number;
  }>;
}

export interface AnalysisResult {
  params: AnalysisParams;
  tracts: TractResult[];
  global: { I: number; z: number; p: number };
  summary: AnalysisSummary;
  dataVintages: { acs: number; acsPrior: number; boundaries: number };
}
