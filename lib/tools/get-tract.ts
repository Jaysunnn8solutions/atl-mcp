import { supplyWithin } from "../spatial/catchment";
import { findTract, loadPois, loadStops } from "../data/load";
import {
  accessRank,
  accessWords,
  changeWords,
  clusterSentence,
  flag,
  needRank,
  needWords,
  placeLabel,
  verdict,
} from "../analysis/interpret";
import {
  analyze,
  describeParams,
  describeScenario,
  error,
  fmtMoney,
  fmtPct,
  geoidSchema,
  readOnly,
  resolveOverrides,
  scenarioShape,
  text,
  toolParamsShape,
  type ScenarioArgs,
  type ToolParams,
  z,
} from "./shared";

export const getTractConfig = {
  title: "Get a tract profile",
  description:
    "Full profile for one census tract by 11-digit GEOID: where it is, a " +
    "plain-language verdict, demographics for both vintages, growth, need and " +
    "access with their components, what is within the catchment radius, and " +
    "cluster status. Accepts scenario facilities to show before/after. GEOIDs " +
    "come from find_priority_tracts, tracts_near or search_place.",
  inputSchema: z
    .object({
      geoid: geoidSchema,
      ...toolParamsShape,
      ...scenarioShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams, ScenarioArgs {
  geoid: string;
}

export function getTractHandler({ geoid, add, remove, ...params }: Args) {
  const feature = findTract(geoid);
  if (!feature) {
    return error(`No tract ${geoid} in the study area (Fulton, DeKalb, Clayton).`);
  }
  const p = feature.properties;
  const overrides = resolveOverrides({ add, remove });
  const scenarioActive = overrides.add.length > 0 || overrides.remove.length > 0;
  const base = analyze(params);
  const result = scenarioActive ? analyze(params, { add, remove }) : base;
  const t = result.tracts.find((r) => r.geoid === geoid)!;
  const b = base.tracts.find((r) => r.geoid === geoid)!;
  const origin = { lon: p.cx, lat: p.cy };
  const r = result.params.radiusKm;

  const pois = loadPois();
  const stops = loadStops();
  const within = (cat: "grocery" | "pharmacy" | "clinic") =>
    supplyWithin(
      origin,
      [
        ...pois.filter((x) => x.category === cat).map((x) => ({ ...x, capacity: 1 })),
        ...overrides.add.filter((f) => f.domain === cat).map((f) => ({ lon: f.lon, lat: f.lat, capacity: 1 })),
      ],
      r
    ).count;
  const transit = supplyWithin(
    origin,
    [
      ...stops.map((s) => ({ lon: s.lon, lat: s.lat, capacity: s.tph })),
      ...overrides.add.filter((f) => f.domain === "transit").map((f) => ({ lon: f.lon, lat: f.lat, capacity: f.capacity ?? 6 })),
    ],
    r
  );

  const growth = (cur: number | null, prior: number | null) =>
    cur == null || prior == null || prior === 0
      ? "n/a"
      : `${(((cur - prior) / prior) * 100).toFixed(1)}%`;

  const plain = [
    `## In plain terms`,
    `- Where: ${placeLabel(p.place, p.county)}. ${p.nearestRail.km} km to ${p.nearestRail.name} station. About ${p.pop.toLocaleString("en-US")} residents.`,
    `- **${verdict(t)}** (${flag(t)})`,
    `- Need: ${needWords(t.needPct)}, ${needRank(t.needPct)}.`,
    `- Access: ${accessWords(t.accessPct)}, ${accessRank(t.accessPct)}.`,
    `- ${clusterSentence(t.lisa.cluster)}`,
  ];
  if (scenarioActive) {
    plain.push(
      `- With the scenario: ${changeWords(t.access - b.access)} (was ${accessRank(b.accessPct)}, now ${accessRank(t.accessPct)}; flag ${flag(b)} → ${flag(t)}).`
    );
  }

  return text(
    [
      `# ${p.name}, ${p.county} County (${p.geoid})`,
      `Land ${p.landKm2} km², centroid ${p.cy}, ${p.cx}. Neighbours: ${p.neighbors.length}.`,
      ``,
      ...plain,
      ``,
      `## Within ${r} km of the centroid${scenarioActive ? " (scenario included)" : ""}`,
      `- Groceries ${within("grocery")}, pharmacies ${within("pharmacy")}, clinics ${within("clinic")}`,
      `- Transit stops ${transit.count}, combined ${transit.capacity.toFixed(1)} weekday trips/hour`,
      ``,
      `## Demographics (ACS ${result.dataVintages.acs}, with ${result.dataVintages.acsPrior} for change)`,
      `- Population ${p.pop.toLocaleString("en-US")} (${growth(p.pop, p.pop2019)} since ${result.dataVintages.acsPrior})`,
      `- Housing units ${p.housingUnits.toLocaleString("en-US")} (${growth(p.housingUnits, p.housingUnits2019)}); vacancy ${fmtPct(p.vacancyRate)}`,
      `- Median household income ${fmtMoney(p.medianIncome)} (${growth(p.medianIncome, p.medianIncome2019)})`,
      `- Median gross rent ${fmtMoney(p.medianRent)} (${growth(p.medianRent, p.medianRent2019)})`,
      `- Poverty rate ${fmtPct(p.povertyRate)}; households with no vehicle ${fmtPct(p.noVehicleRate)}`,
      `- Age 65+ ${fmtPct(p.seniorShare)}; under 18 ${fmtPct(p.childShare)}`,
      ``,
      `## Technical detail (${describeParams(result.params)})${describeScenario(overrides)}`,
      `- Need index ${t.need.toFixed(2)} (tertile ${t.needTertile}); components: ` +
        Object.entries(t.needBy)
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join(", "),
      `- Access index ${t.access.toFixed(2)} (tertile ${t.accessTertile}); 2SFCA per 1,000 residents: ` +
        Object.entries(t.accessBy)
          .map(([k, v]) => `${k} ${v.toFixed(3)}`)
          .join(", "),
      `- Gap ${t.gap.toFixed(2)}, class ${t.biClass}; local Moran's I ${t.lisa.I.toFixed(3)}, p ${t.lisa.p.toFixed(3)} (${t.lisa.cluster})`,
      `- Indexes are z-scores across all 600 tracts: 0 is average, +1 well above, −1 well below.`,
    ].join("\n")
  );
}
