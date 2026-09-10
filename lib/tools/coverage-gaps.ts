import { coverage } from "../analysis/coverage";
import { domainSchema } from "../analysis/params";
import { loadTracts } from "../data/load";
import {
  analyze,
  describeScenario,
  fmtInt,
  readOnly,
  resolveOverrides,
  scenarioShape,
  text,
  toolParamsShape,
  type ScenarioArgs,
  type ToolParams,
  z,
} from "./shared";

export const coverageGapsConfig = {
  title: "Find coverage gaps",
  description:
    "Population outside every catchment for one supply type, grouped into " +
    "contiguous clusters of uncovered tracts and ranked by population. Answers " +
    "'where are the holes' for groceries, pharmacies, clinics or transit. " +
    "Accepts scenario additions/removals to test a fix.",
  inputSchema: z
    .object({
      domain: domainSchema,
      minTph: z
        .number()
        .min(0)
        .max(60)
        .optional()
        .describe("Transit only: ignore stops with fewer weekday trips per hour than this."),
      limit: z.number().int().min(1).max(20).default(5).describe("Clusters to list."),
      ...toolParamsShape,
      ...scenarioShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams, ScenarioArgs {
  domain: "grocery" | "pharmacy" | "clinic" | "transit";
  minTph?: number;
  limit: number;
}

export function coverageGapsHandler({ domain, minTph, limit, add, remove, ...params }: Args) {
  const overrides = resolveOverrides({ add, remove });
  const analysis = analyze(params, { add, remove });
  const radiusKm = analysis.params.radiusKm;
  const c = coverage({ domain, radiusKm, minTph }, overrides);
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));
  const need = new Map(analysis.tracts.map((t) => [t.geoid, t.need]));

  const share = c.totalPop > 0 ? (c.coveredPop / c.totalPop) * 100 : 0;
  const head =
    `${domain} coverage at ${radiusKm} km` +
    (minTph != null ? ` (stops with ≥ ${minTph} trips/hour)` : "") +
    `: ${share.toFixed(1)}% of ${fmtInt(c.totalPop)} residents within reach of ` +
    `${c.supplyCount} supply points; ${fmtInt(c.totalPop - c.coveredPop)} residents in ` +
    `${c.uncoveredTracts} uncovered tracts forming ${c.clusters.length} contiguous clusters.` +
    describeScenario(overrides);

  const lines = c.clusters.slice(0, limit).map((cl) => {
    const counties = Object.entries(cl.counties)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    const meanNeed =
      cl.tracts.reduce((s, g) => s + (need.get(g) ?? 0), 0) / Math.max(1, cl.tracts.length);
    const top = [...cl.tracts]
      .sort((a, b) => (props.get(b)!.pop ?? 0) - (props.get(a)!.pop ?? 0))
      .slice(0, 3)
      .map((g) => `${props.get(g)!.name} (${g})`)
      .join("; ");
    return (
      `${cl.rank}. ${fmtInt(cl.pop)} residents in ${cl.tracts.length} tracts (${counties}); ` +
      `mean need ${meanNeed.toFixed(2)}; centre ${cl.lat.toFixed(4)}, ${cl.lon.toFixed(4)}. ` +
      `Largest: ${top}`
    );
  });

  return text(
    [
      head,
      ``,
      ...(lines.length ? lines : ["No uncovered tracts."]),
      ``,
      `Coverage is binary (any supply within the radius of the tract centroid). ` +
        `Use site_selection to place new supply, or what_if to test a specific location.`,
    ].join("\n")
  );
}
