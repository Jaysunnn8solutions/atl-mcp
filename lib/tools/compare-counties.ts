import { loadTracts } from "../data/load";
import { mean } from "../spatial/stats";
import { analyze, describeParams, readOnly, text, toolParamsShape, type ToolParams, z } from "./shared";

export const compareCountiesConfig = {
  title: "Compare counties",
  description:
    "Summarize need, access, gap, priority-tract counts and cluster counts by " +
    "county, plus population-weighted demographics. Good for 'which county has " +
    "the biggest problem' questions.",
  inputSchema: z.object({ ...toolParamsShape }).strict(),
  annotations: readOnly,
};

export function compareCountiesHandler(params: ToolParams) {
  const result = analyze(params);
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));

  const lines = result.summary.byCounty.map((c) => {
    const tracts = result.tracts.filter((t) => props.get(t.geoid)!.county === c.county);
    const hh = tracts.filter((t) => t.lisa.cluster === "HH").length;
    const pop = tracts.reduce((s, t) => s + props.get(t.geoid)!.pop, 0);
    const growth = tracts
      .map((t) => t.popGrowth)
      .filter((g): g is number => g != null);
    return (
      `- **${c.county}**: ${c.tracts} tracts, pop ${pop.toLocaleString("en-US")}; ` +
      `mean need ${c.meanNeed.toFixed(2)}, mean access ${c.meanAccess.toFixed(2)}; ` +
      `${c.priority} priority tracts, ${hh} in high-gap clusters; ` +
      `median tract growth ${growth.length ? (median(growth) * 100).toFixed(1) : "n/a"}%`
    );
  });

  return text(
    [
      `County comparison (${describeParams(result.params)}).`,
      `Need and access are z-scores across all tracts, so a county mean near 0 is average for the study area.`,
      ``,
      ...lines,
      ``,
      `Global Moran's I on the gap: ${result.global.I} (p ${result.global.p === 0 ? "< 0.0001" : `= ${result.global.p}`}).`,
    ].join("\n")
  );
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : mean([s[mid - 1], s[mid]]);
}
