import { overridesSchema } from "../analysis/params";
import { loadTracts } from "../data/load";
import { PRIORITY_CLASS } from "../analysis/classify";
import {
  analyze,
  describeParams,
  describeScenario,
  fmtInt,
  readOnly,
  resolveOverrides,
  text,
  toolParamsShape,
  type ToolParams,
  z,
} from "./shared";

export const whatIfConfig = {
  title: "Test a scenario",
  description:
    "Recompute the whole analysis with hypothetical facilities or stops added " +
    "(and/or existing ones removed) and report what changes: access gains by " +
    "tract, priority-tract and hotspot counts before and after. Feed it the " +
    "sites from site_selection, or a lon/lat of your own.",
  inputSchema: z
    .object({
      add: overridesSchema.shape.add,
      remove: overridesSchema.shape.remove,
      limit: z.number().int().min(1).max(30).default(10).describe("Tracts to list."),
      ...toolParamsShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  add: z.output<typeof overridesSchema>["add"];
  remove: string[];
  limit: number;
}

export function whatIfHandler({ add, remove, limit, ...params }: Args) {
  const overrides = resolveOverrides({ add, remove });
  if (overrides.add.length === 0 && overrides.remove.length === 0) {
    return text("Nothing to test: pass at least one facility in `add` or an id in `remove`.");
  }
  const base = analyze(params);
  const scen = analyze(params, { add, remove });
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));
  const baseBy = new Map(base.tracts.map((t) => [t.geoid, t]));

  const deltas = scen.tracts
    .map((t) => {
      const b = baseBy.get(t.geoid)!;
      return {
        geoid: t.geoid,
        dAccess: t.access - b.access,
        dGap: t.gap - b.gap,
        from: b,
        to: t,
      };
    })
    .filter((d) => Math.abs(d.dAccess) > 0.005)
    .sort((a, b) => b.dAccess - a.dAccess);

  const gained = deltas.filter((d) => d.dAccess > 0);
  const lost = deltas.filter((d) => d.dAccess < 0);
  const popGained = gained.reduce((s, d) => s + (props.get(d.geoid)!.pop ?? 0), 0);
  const leftPriority = deltas.filter(
    (d) => d.from.biClass === PRIORITY_CLASS && d.to.biClass !== PRIORITY_CLASS
  );
  const enteredPriority = deltas.filter(
    (d) => d.from.biClass !== PRIORITY_CLASS && d.to.biClass === PRIORITY_CLASS
  );

  const lines = deltas.slice(0, limit).map((d) => {
    const p = props.get(d.geoid)!;
    const cls = d.from.biClass === d.to.biClass ? d.to.biClass : `${d.from.biClass} → ${d.to.biClass}`;
    return (
      `- ${p.name}, ${p.county} (${d.geoid}): access ${d.from.access.toFixed(2)} → ${d.to.access.toFixed(2)} ` +
      `(${d.dAccess >= 0 ? "+" : ""}${d.dAccess.toFixed(2)}), gap ${d.to.gap.toFixed(2)}, class ${cls}; pop ${fmtInt(p.pop)}`
    );
  });

  return text(
    [
      `Scenario result (${describeParams(base.params)}).${describeScenario(overrides)}`,
      ``,
      `- Tracts with higher access: ${gained.length} (${fmtInt(popGained)} residents); lower: ${lost.length}.`,
      `- Priority tracts: ${base.summary.priorityCount} → ${scen.summary.priorityCount} ` +
        `(${leftPriority.length} left the priority cell, ${enteredPriority.length} entered it).`,
      `- High-gap cluster tracts: ${base.summary.hotspotCount} → ${scen.summary.hotspotCount}.`,
      `- Global Moran's I on the gap: ${base.global.I} → ${scen.global.I}.`,
      ``,
      `Largest access changes:`,
      ...(lines.length ? lines : ["- none beyond rounding"]),
      ``,
      `Access is standardized across all tracts, so adding supply in one place can nudge ` +
        `others down slightly by shifting the mean; tertile boundaries can move for the same reason.`,
    ].join("\n")
  );
}
