/**
 * Prompts: reusable workflows a client can offer as slash-commands. Each
 * one tells the model which tools to call and what shape the answer
 * should take, so a user gets a consistent brief without knowing the tools.
 */

import { domainSchema } from "../analysis/params";
import { geoidSchema, z } from "./shared";

function userMessage(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export const briefTractPrompt = {
  name: "brief_tract",
  config: {
    title: "Brief me on a tract",
    description: "A one-page brief on one census tract: who lives there, what has changed, how it scores, and what would move the needle.",
    argsSchema: z.object({ geoid: geoidSchema }),
  },
  handler: ({ geoid }: { geoid: string }) =>
    userMessage(
      [
        `Write a one-page brief on census tract ${geoid} in the Atlanta resource gap screen.`,
        ``,
        `Steps:`,
        `1. Call get_tract for ${geoid}.`,
        `2. Call find_similar for ${geoid} with minAccessAdvantage 1 to find look-alike tracts that are doing better on access.`,
        `3. Call tracts_near with the tract's centroid (lon/lat from step 1) and withinKm 2 for context on its surroundings.`,
        ``,
        `Structure: Who lives here (population, growth since the prior vintage, income, rent, poverty, vehicles, age mix). ` +
          `How it scores (need, access by domain, gap, class, cluster) and which components drive that. ` +
          `Peers that do better and what they have that this tract lacks. ` +
          `What would move the needle (which supply type, roughly where). ` +
          `Caveats: this is a screening tool using straight-line distance and 5-year ACS estimates; say so in one sentence.`,
        `Use plain language and put numbers in a short table where helpful.`,
      ].join("\n")
    ),
};

export const compareCountiesPrompt = {
  name: "county_comparison",
  config: {
    title: "Compare the three counties",
    description: "Which county has the biggest resource gap problem, and where inside it.",
  },
  handler: () =>
    userMessage(
      [
        `Compare Fulton, DeKalb and Clayton counties in the Atlanta resource gap screen.`,
        ``,
        `Call compare_counties, then find_priority_tracts with priorityOnly true for each county (limit 5). ` +
          `Report which county has the highest mean need, lowest mean access, and most priority tracts; ` +
          `then name the top priority tracts in each and whether they sit in a high-gap cluster. ` +
          `Finish with one paragraph on what the pattern suggests, and one sentence of caveats about the method.`,
      ].join("\n")
    ),
};

export const sitePlanPrompt = {
  name: "site_plan",
  config: {
    title: "Plan new sites for a supply type",
    description: "Find the coverage holes for one supply type, propose sites, and test their effect.",
    argsSchema: z.object({
      domain: domainSchema,
      k: z.number().int().min(1).max(10).default(3),
    }),
  },
  handler: ({ domain, k }: { domain: string; k: number }) =>
    userMessage(
      [
        `Plan ${k} new ${domain} sites in Fulton, DeKalb and Clayton counties.`,
        ``,
        `1. Call coverage_gaps for ${domain} to see where the largest uncovered clusters are.`,
        `2. Call site_selection for ${domain} with k ${k} and need weighting.`,
        `3. Call what_if with the sites from step 2 as \`add\` to measure the change in access, priority tracts and hotspots.`,
        `4. Optionally call plan_visit with the affected tracts to suggest a site-visit order.`,
        ``,
        `Report: the holes, the proposed sites (as "near tract X" plus coordinates), who they newly cover, ` +
          `and what changes in the overall picture. Note that sites are tract centroids and distances are straight-line.`,
      ].join("\n")
    ),
};
