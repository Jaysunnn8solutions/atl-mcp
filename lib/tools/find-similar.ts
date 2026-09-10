import { findSimilar } from "../analysis/similar";
import { loadTracts } from "../data/load";
import {
  analyze,
  clusterWord,
  error,
  geoidSchema,
  readOnly,
  text,
  toolParamsShape,
  tractLabel,
  type ToolParams,
  z,
} from "./shared";

export const findSimilarConfig = {
  title: "Find similar tracts",
  description:
    "Nearest neighbours in feature space: tracts whose need components, access " +
    "profile, income and rent most resemble a given tract. Exclude spatial " +
    "neighbours to find peers elsewhere in the region, and set minAccessAdvantage " +
    "to find look-alikes that are doing better on access — useful benchmarks.",
  inputSchema: z
    .object({
      geoid: geoidSchema,
      k: z.number().int().min(1).max(25).default(5),
      excludeNeighbors: z
        .boolean()
        .default(true)
        .describe("Skip tracts that share a border with the target."),
      minAccessAdvantage: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Only tracts whose access index exceeds the target's by at least this many z-units."),
      county: z.enum(["Fulton", "DeKalb", "Clayton"]).optional(),
      ...toolParamsShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams {
  geoid: string;
  k: number;
  excludeNeighbors: boolean;
  minAccessAdvantage?: number;
  county?: "Fulton" | "DeKalb" | "Clayton";
}

export function findSimilarHandler({
  geoid,
  k,
  excludeNeighbors,
  minAccessAdvantage,
  county,
  ...params
}: Args) {
  const result = analyze(params);
  const target = result.tracts.find((t) => t.geoid === geoid);
  if (!target) return error(`No tract ${geoid} in the study area.`);

  const matches = findSimilar(result, geoid, { k, excludeNeighbors, minAccessAdvantage, county });
  if (matches.length === 0) {
    return text("No tracts satisfy those filters. Relax minAccessAdvantage or the county filter.");
  }
  const props = new Map(loadTracts().features.map((f) => [f.properties.geoid, f.properties]));

  const lines = matches.map((m, i) => {
    const p = props.get(m.geoid)!;
    const diffs = m.biggestDifferences
      .map((d) => `${d.feature} ${d.delta >= 0 ? "+" : ""}${d.delta}`)
      .join(", ");
    return (
      `${i + 1}. ${p.name}, ${p.county} (${m.geoid}) — distance ${m.distance}; ` +
      `need ${m.result.need.toFixed(2)}, access ${m.result.access.toFixed(2)}, gap ${m.result.gap.toFixed(2)}, ` +
      `class ${m.result.biClass}, ${clusterWord(m.result)}; pop ${p.pop.toLocaleString("en-US")}. ` +
      `Largest differences: ${diffs}`
    );
  });

  return text(
    [
      `Tracts most similar to ${tractLabel(geoid)} (need ${target.need.toFixed(2)}, access ${target.access.toFixed(2)}, gap ${target.gap.toFixed(2)}).`,
      `Distance is Euclidean over 11 standardized features (five need components, four access domains, log income, log rent); 0 would be identical.` +
        (excludeNeighbors ? " Bordering tracts excluded." : "") +
        (minAccessAdvantage != null ? ` Only tracts with access at least ${minAccessAdvantage} z above the target.` : ""),
      ``,
      ...lines,
    ].join("\n")
  );
}
