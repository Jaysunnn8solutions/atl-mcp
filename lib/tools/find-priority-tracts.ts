import { PRIORITY_CLASS } from "../analysis/classify";
import { loadTracts } from "../data/load";
import {
  analyze,
  clusterWord,
  describeParams,
  readOnly,
  text,
  toolParamsShape,
  type ToolParams,
  z,
} from "./shared";

export const findPriorityTractsConfig = {
  title: "Find priority tracts",
  description:
    "Rank tracts where need most outruns access. Returns the highest-gap tracts " +
    "with their bivariate class and cluster status. Optionally restrict to a " +
    "county or to tracts in the priority cell (highest need, lowest access). " +
    "Parameters are optional; omit them for the defaults the map uses.",
  inputSchema: z
    .object({
      ...toolParamsShape,
      county: z
        .enum(["Fulton", "DeKalb", "Clayton"])
        .optional()
        .describe("Restrict to one county."),
      priorityOnly: z
        .boolean()
        .default(false)
        .describe("Only tracts in the highest-need, lowest-access cell."),
      limit: z.number().int().min(1).max(50).default(15),
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  county?: "Fulton" | "DeKalb" | "Clayton";
  priorityOnly: boolean;
  limit: number;
}

export function findPriorityTractsHandler({ county, priorityOnly, limit, ...params }: Args) {
  const result = analyze(params);
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));

  const rows = result.tracts
    .filter((t) => {
      const p = props.get(t.geoid)!;
      if (county && p.county !== county) return false;
      if (priorityOnly && t.biClass !== PRIORITY_CLASS) return false;
      return p.pop > 0;
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);

  if (rows.length === 0) {
    return text("No tracts match those filters.");
  }

  const lines = rows.map((t, i) => {
    const p = props.get(t.geoid)!;
    return (
      `${i + 1}. ${p.name}, ${p.county} (${t.geoid}) — gap ${t.gap.toFixed(2)}, ` +
      `need ${t.need.toFixed(2)}, access ${t.access.toFixed(2)}, class ${t.biClass}, ` +
      `${clusterWord(t)}; pop ${p.pop.toLocaleString("en-US")}`
    );
  });

  return text(
    [
      `Top ${rows.length} tracts by gap (${describeParams(result.params)}` +
        `${county ? `; ${county} only` : ""}${priorityOnly ? "; priority cell only" : ""}).`,
      `Gap, need and access are in z-score units relative to all ${result.summary.tractCount} tracts.`,
      ``,
      ...lines,
      ``,
      `Use get_tract with a GEOID for the full profile.`,
    ].join("\n")
  );
}
