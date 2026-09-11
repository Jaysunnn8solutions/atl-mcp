import { loadTracts } from "../data/load";
import { hashFromInput, parseViewHash, viewToToolArgs } from "../view-state";
import { analyze, clusterWord, describeParams, readOnly, text, z } from "./shared";

export const loadViewConfig = {
  title: "Load a map link",
  description:
    "Read a link copied from the atl-mcp map (or the settings block its Copy " +
    "button produces) and return the parameters, scenario facilities and " +
    "selected tract it encodes, as the exact arguments to pass to the other " +
    "tools. Use this whenever a person pastes a map URL so your answers match " +
    "what they are looking at.",
  inputSchema: z
    .object({
      link: z
        .string()
        .min(1)
        .max(4000)
        .describe("A map URL, its #hash, or the pasted settings text."),
    })
    .strict(),
  annotations: readOnly,
};

export function loadViewHandler({ link }: { link: string }) {
  // A pasted settings block carries the link on its last line; find it.
  const urlMatch = /https?:\/\/\S+/.exec(link);
  const hash = hashFromInput(urlMatch ? urlMatch[0] : link);
  const view = parseViewHash(hash);
  const args = viewToToolArgs(view);
  const result = analyze(view.params, { add: view.scenario });

  const lines = [
    `View loaded${hash ? "" : " (link carried no settings, so these are the defaults)"}.`,
    ``,
    `Pass these arguments to every analysis tool:`,
    "```json",
    JSON.stringify(args, null, 2),
    "```",
    ``,
    `- Layer shown: ${view.mode}${view.mode === "coverage" ? ` (${view.coverageDomain}${view.coverageDomain === "transit" ? `, stops with ≥ ${view.minTph} trips/hour` : ""})` : ""}.`,
    `- Settings: ${describeParams(result.params)}.`,
    `- Scenario: ${view.scenario.length ? `${view.scenario.length} hypothetical ${view.scenario.length === 1 ? "facility" : "facilities"} (${view.scenario.map((f) => f.domain).join(", ")})` : "none"}.`,
    `- With these settings: ${result.summary.priorityCount} priority tracts, ${result.summary.hotspotCount} in high-gap clusters.`,
  ];

  if (view.selected) {
    const p = loadTracts().features.find((f) => f.properties.geoid === view.selected)?.properties;
    const t = result.tracts.find((r) => r.geoid === view.selected);
    if (p && t) {
      lines.push(
        `- Selected tract: ${p.name}, ${p.county} (${p.geoid}) — need ${t.need.toFixed(2)}, ` +
          `access ${t.access.toFixed(2)}, gap ${t.gap.toFixed(2)}, class ${t.biClass}, ${clusterWord(t)}. ` +
          `Call get_tract for the full profile.`
      );
    }
  }

  return text(lines.join("\n"));
}
