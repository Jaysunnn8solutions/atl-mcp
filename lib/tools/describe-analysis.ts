import { loadManifest, loadPois, loadStops } from "../data/load";
import { analyze, readOnly, text, z } from "./shared";

export const describeAnalysisConfig = {
  title: "Describe the analysis",
  description:
    "Explain what this server measures, which data it uses, and the current " +
    "headline numbers. Call this first to understand what the other tools return.",
  inputSchema: z.object({}).strict(),
  annotations: readOnly,
};

export function describeAnalysisHandler() {
  const m = loadManifest();
  const r = analyze({});
  const pois = loadPois();
  const stops = loadStops();
  const byCat = pois.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return text(
    [
      `# Metro Atlanta resource gap screen`,
      ``,
      `Study area: ${m.counties.map((c) => c.name).join(", ")} counties, Georgia ` +
        `(${m.counts.tracts} census tracts, ${m.boundaryVintage} boundaries).`,
      ``,
      `## What is measured`,
      `- **Need** per tract: a weighted composite of poverty rate, households with ` +
        `no vehicle, share aged 65+, share under 18, and population growth ` +
        `${m.acsPriorVintage}→${m.acsVintage}. Each component is standardized (z-score).`,
      `- **Access** per tract: two-step floating catchment area (2SFCA) accessibility to ` +
        `groceries, pharmacies, clinics, and scheduled transit service, averaged after ` +
        `standardizing. Transit supply is weighted by weekday trips per hour at each stop.`,
      `- **Gap** = need − access. Positive means need outruns access.`,
      `- Tracts are split into thirds on need and on access. The priority cell is ` +
        `highest-need, lowest-access (class N3A1).`,
      `- Local Moran's I on the gap identifies significant clusters (HH = high-gap cluster).`,
      ``,
      `## Data`,
      `- ACS 5-year ${m.acsVintage} and ${m.acsPriorVintage} (prior vintage apportioned from 2010 to 2020 tracts by land area).`,
      `- OpenStreetMap points of interest: ${JSON.stringify(byCat)}.`,
      `- MARTA GTFS: ${stops.length} stops with weekday service, ${stops.filter((s) => s.rail).length} rail stations.`,
      `- Built ${m.generatedAt.slice(0, 10)}.`,
      ``,
      `## Headline (default parameters)`,
      `- ${r.summary.priorityCount} priority tracts, ${r.summary.hotspotCount} in significant high-gap clusters.`,
      `- Global Moran's I on the gap: ${r.global.I} (z = ${r.global.z}, p ${r.global.p === 0 ? "< 0.0001" : `= ${r.global.p}`}). ` +
        `Positive and significant means gaps cluster geographically rather than scattering.`,
      ...r.summary.byCounty.map(
        (c) =>
          `- ${c.county}: ${c.tracts} tracts, ${c.priority} priority, ` +
          `mean need ${c.meanNeed}, mean access ${c.meanAccess}`
      ),
      ``,
      `This is a screening tool. It surfaces candidates for closer study; it does not ` +
        `establish that any tract needs a specific intervention.`,
    ].join("\n")
  );
}
