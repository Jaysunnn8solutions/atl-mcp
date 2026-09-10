import { supplyWithin } from "../spatial/catchment";
import { findTract, loadPois, loadStops } from "../data/load";
import {
  analyze,
  clusterWord,
  describeParams,
  error,
  fmtMoney,
  fmtPct,
  readOnly,
  text,
  toolParamsShape,
  type ToolParams,
  z,
} from "./shared";

export const getTractConfig = {
  title: "Get a tract profile",
  description:
    "Full profile for one census tract by 11-digit GEOID: demographics for both " +
    "vintages, growth, need and access scores with their components, what is " +
    "within the catchment radius, and cluster status. GEOIDs come from " +
    "find_priority_tracts or tracts_near.",
  inputSchema: z
    .object({
      geoid: z.string().regex(/^13(121|089|063)\d{6}$/).describe("11-digit tract GEOID."),
      ...toolParamsShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  geoid: string;
}

export function getTractHandler({ geoid, ...params }: Args) {
  const feature = findTract(geoid);
  if (!feature) {
    return error(`No tract ${geoid} in the study area (Fulton, DeKalb, Clayton).`);
  }
  const p = feature.properties;
  const result = analyze(params);
  const t = result.tracts.find((r) => r.geoid === geoid)!;
  const origin = { lon: p.cx, lat: p.cy };
  const r = result.params.radiusKm;

  const pois = loadPois();
  const stops = loadStops();
  const within = (cat: "grocery" | "pharmacy" | "clinic") =>
    supplyWithin(
      origin,
      pois.filter((x) => x.category === cat).map((x) => ({ ...x, capacity: 1 })),
      r
    ).count;
  const transit = supplyWithin(
    origin,
    stops.map((s) => ({ lon: s.lon, lat: s.lat, capacity: s.tph })),
    r
  );
  const rail = stops.filter(
    (s) => s.rail && supplyWithin(origin, [{ ...s, capacity: 1 }], r).count > 0
  );

  const growth = (cur: number | null, prior: number | null) =>
    cur == null || prior == null || prior === 0
      ? "n/a"
      : `${(((cur - prior) / prior) * 100).toFixed(1)}%`;

  return text(
    [
      `# ${p.name}, ${p.county} County (${p.geoid})`,
      `Land ${p.landKm2} km², centroid ${p.cy}, ${p.cx}. Neighbors: ${p.neighbors.length}.`,
      ``,
      `## Demographics (ACS ${result.dataVintages.acs}, with ${result.dataVintages.acsPrior} for change)`,
      `- Population ${p.pop.toLocaleString("en-US")} (${growth(p.pop, p.pop2019)} since ${result.dataVintages.acsPrior})`,
      `- Housing units ${p.housingUnits.toLocaleString("en-US")} (${growth(p.housingUnits, p.housingUnits2019)}); vacancy ${fmtPct(p.vacancyRate)}`,
      `- Median household income ${fmtMoney(p.medianIncome)} (${growth(p.medianIncome, p.medianIncome2019)})`,
      `- Median gross rent ${fmtMoney(p.medianRent)} (${growth(p.medianRent, p.medianRent2019)})`,
      `- Poverty rate ${fmtPct(p.povertyRate)}; households with no vehicle ${fmtPct(p.noVehicleRate)}`,
      `- Age 65+ ${fmtPct(p.seniorShare)}; under 18 ${fmtPct(p.childShare)}`,
      ``,
      `## Scores (${describeParams(result.params)})`,
      `- Need ${t.need.toFixed(2)} (tertile ${t.needTertile}); components: ` +
        Object.entries(t.needBy)
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join(", "),
      `- Access ${t.access.toFixed(2)} (tertile ${t.accessTertile}); 2SFCA per 1,000 residents: ` +
        Object.entries(t.accessBy)
          .map(([k, v]) => `${k} ${v.toFixed(3)}`)
          .join(", "),
      `- Gap ${t.gap.toFixed(2)}, class ${t.biClass}${t.biClass === "N3A1" ? " (priority cell)" : ""}`,
      `- Local Moran's I ${t.lisa.I.toFixed(3)}, p ${t.lisa.p.toFixed(3)}: ${clusterWord(t)}`,
      ``,
      `## Within ${r} km of the centroid`,
      `- Groceries ${within("grocery")}, pharmacies ${within("pharmacy")}, clinics ${within("clinic")}`,
      `- Transit stops ${transit.count}, combined ${transit.capacity.toFixed(1)} weekday trips/hour`,
      `- Rail stations: ${rail.length > 0 ? rail.map((s) => s.name).join("; ") : "none"}`,
    ].join("\n")
  );
}
