import { DEFAULT_COSTS, planBudget } from "../analysis/budget";
import { domainSchema } from "../analysis/params";
import { ACCESS_DOMAINS, type AccessDomain } from "../analysis/types";
import { pct, placeLabel } from "../analysis/interpret";
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

const money = (d: number) =>
  d >= 1_000_000 ? `$${(d / 1_000_000).toFixed(d % 1_000_000 ? 1 : 0)}M` : `$${fmtInt(d)}`;

export const planBudgetConfig = {
  title: "Plan a budget",
  description:
    "Given a budget in dollars and a cost per facility type, choose the mix of " +
    "new groceries, pharmacies, clinics and transit stops that gives the most " +
    "lower-income residents at least one of each essential service within " +
    "reach. Greedy by benefit per dollar with a swap pass. Costs are mock " +
    "defaults and can be overridden. Returns picks you can pass to what_if as " +
    "`add`.",
  inputSchema: z
    .object({
      budget: z.number().min(100_000).max(10_000_000_000).describe("Dollars available, e.g. 100000000 for $100M."),
      costGrocery: z.number().positive().optional().describe(`Cost of one grocery store. Default ${money(DEFAULT_COSTS.grocery)}.`),
      costPharmacy: z.number().positive().optional().describe(`Default ${money(DEFAULT_COSTS.pharmacy)}.`),
      costClinic: z.number().positive().optional().describe(`Default ${money(DEFAULT_COSTS.clinic)}.`),
      costTransit: z.number().positive().optional().describe(`Cost of a frequent-service stop. Default ${money(DEFAULT_COSTS.transit)}.`),
      incomeCap: z
        .number()
        .min(0)
        .max(500_000)
        .nullable()
        .default(65_000)
        .describe("Only residents in tracts with median household income at or below this count. null for everyone."),
      weighting: z.enum(["population", "need"]).default("need"),
      domains: z.array(domainSchema).min(1).default(ACCESS_DOMAINS).describe("Types the budget may buy."),
      minTph: z
        .number()
        .min(0)
        .max(60)
        .default(4)
        .describe("Existing stops below this many weekday trips per hour don't count as transit coverage."),
      ...toolParamsShape,
      ...scenarioShape,
    })
    .strict(),
  annotations: readOnly,
};

interface Args extends ToolParams, ScenarioArgs {
  budget: number;
  costGrocery?: number;
  costPharmacy?: number;
  costClinic?: number;
  costTransit?: number;
  incomeCap: number | null;
  weighting: "population" | "need";
  domains: AccessDomain[];
  minTph: number;
}

export function planBudgetHandler({
  budget,
  costGrocery,
  costPharmacy,
  costClinic,
  costTransit,
  incomeCap,
  weighting,
  domains,
  minTph,
  add,
  remove,
  ...params
}: Args) {
  const overrides = resolveOverrides({ add, remove });
  const p = resolveParams(params);
  const costs = {
    grocery: costGrocery ?? DEFAULT_COSTS.grocery,
    pharmacy: costPharmacy ?? DEFAULT_COSTS.pharmacy,
    clinic: costClinic ?? DEFAULT_COSTS.clinic,
    transit: costTransit ?? DEFAULT_COSTS.transit,
  };
  const r = planBudget(
    { budget, costs, radiusKm: p.radiusKm, incomeCap, weighting, domains, minTph },
    p,
    overrides
  );

  const focus =
    incomeCap == null
      ? `all ${fmtInt(r.totalPop)} residents`
      : `${fmtInt(r.focusPop)} residents of tracts with median income at or below ${money(incomeCap)} (${pct(r.focusPop / r.totalPop)} of the population)`;

  const byType = ACCESS_DOMAINS.filter((d) => domains.includes(d)).map((d) => {
    const s = r.byDomain[d];
    return (
      `- ${d}: ${s.count} × ${money(costs[d])} = ${money(s.spent)}; ` +
      `${fmtInt(s.residentsGained)} more focus residents within ${p.radiusKm} km ` +
      `(${pct(s.coverageBefore)} → ${pct(s.coverageAfter)} of the focus group)`
    );
  });

  const picks = r.picks.map(
    (k) =>
      `${k.step}. ${k.domain} near ${k.name}, ${placeLabel(k.place, k.county)} — ${money(k.cost)}; ` +
      `${fmtInt(k.residents)} focus residents gain a ${k.domain} in reach (${k.lat.toFixed(4)}, ${k.lon.toFixed(4)})`
  );

  const addJson = JSON.stringify(
    r.picks.map((k) => ({ domain: k.domain, lon: k.lon, lat: k.lat, label: `Budget: ${k.domain} near ${k.name}` }))
  );

  return text(
    [
      `Budget plan: ${money(budget)}, reach ${p.radiusKm} km, ${weighting} weighting. Focus: ${focus}.${describeScenario(overrides)}`,
      ``,
      `Spent ${money(r.spent)} of ${money(budget)} on ${r.picks.length} facilities; ${money(r.remaining)} left over` +
        (r.remaining > 0 && r.picks.length > 0 ? " (nothing affordable adds more coverage)" : "") +
        `.`,
      `${fmtInt(r.residentsGainedAny)} focus residents gain at least one essential service they lacked${r.improvedBySwap ? "; the swap pass improved on greedy" : ""}.`,
      ``,
      `By type:`,
      ...byType,
      ``,
      `Purchases in order:`,
      ...(picks.length ? picks : ["- none"]),
      ``,
      `Costs are mock capital figures; override them with costGrocery etc. Sites are tract centroids. ` +
        `To see the effect on the access index, call what_if with add=${addJson}`,
    ].join("\n")
  );
}
