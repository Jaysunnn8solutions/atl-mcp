import { domainSchema } from "../analysis/params";
import { selectSites } from "../analysis/site-selection";
import {
  describeScenario,
  fmtInt,
  readOnly,
  resolveOverrides,
  resolveParams,
  scenarioShape,
  text,
  toolParamsShape,
  type ScenarioArgs,
  type ToolParams,
  z,
} from "./shared";

export const siteSelectionConfig = {
  title: "Select new sites",
  description:
    "Location allocation: choose k new sites for a supply type that cover the " +
    "most currently-uncovered population (or need-weighted population) within " +
    "the catchment radius. Solves the maximal covering location problem with " +
    "greedy construction plus swap local search over tract centroids. Returns " +
    "sites you can pass straight to what_if as `add`.",
  inputSchema: z
    .object({
      domain: domainSchema,
      k: z.number().int().min(1).max(10).default(3),
      weighting: z
        .enum(["population", "need"])
        .default("need")
        .describe("population: people covered. need: people × (1 + need index), favouring high-need tracts."),
      minTph: z.number().min(0).max(60).optional().describe("Transit only: stops below this frequency don't count as existing coverage."),
      ...toolParamsShape,
      ...scenarioShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams, ScenarioArgs {
  domain: "grocery" | "pharmacy" | "clinic" | "transit";
  k: number;
  weighting: "population" | "need";
  minTph?: number;
}

export function siteSelectionHandler({ domain, k, weighting, minTph, add, remove, ...params }: Args) {
  const overrides = resolveOverrides({ add, remove });
  const p = resolveParams(params);
  const r = selectSites({ domain, k, radiusKm: p.radiusKm, weighting, minTph }, p, overrides);

  const unit = weighting === "population" ? "residents" : "need-weighted residents";
  const before = r.totalWeight > 0 ? (r.baselineCovered / r.totalWeight) * 100 : 0;
  const after = r.totalWeight > 0 ? (r.finalCovered / r.totalWeight) * 100 : 0;

  const lines = r.sites.map((s, i) => {
    return (
      `${i + 1}. Near ${s.name}, ${s.county} — ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}; ` +
      `newly covers ${fmtInt(s.gain)} ${unit} across ${s.coveredUnits.length} tracts`
    );
  });

  const addJson = JSON.stringify(
    r.sites.map((s) => ({ domain, lon: s.lon, lat: s.lat, label: `Proposed near ${s.name}` }))
  );

  return text(
    [
      `Best ${r.sites.length} new ${domain} sites at ${p.radiusKm} km (${weighting} weighting).` +
        describeScenario(overrides),
      `Coverage ${before.toFixed(1)}% → ${after.toFixed(1)}% of ${fmtInt(r.totalWeight)} ${unit}` +
        (r.improvedByLocalSearch ? "; swap search improved on greedy." : "."),
      ``,
      ...(lines.length ? lines : ["Everything is already covered at this radius."]),
      ``,
      `Sites are tract centroids, so read them as "somewhere in this tract". ` +
        `To see the effect on the access index, call what_if with add=${addJson}`,
    ].join("\n")
  );
}
