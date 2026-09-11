/**
 * Types and constants for the budget planner that are safe to import in
 * the browser (no filesystem, no solver).
 */

import type { AccessDomain } from "./types";

export type CostTable = Record<AccessDomain, number>;

/** Mock capital costs in dollars. Editable everywhere they are used. */
export const DEFAULT_COSTS: CostTable = {
  grocery: 12_000_000,
  pharmacy: 2_500_000,
  clinic: 6_000_000,
  transit: 2_000_000,
};

export interface BudgetOptions {
  /** Dollars available. */
  budget: number;
  costs: CostTable;
  radiusKm: number;
  /** Only residents in tracts with median income at or below this count. Null means everyone. */
  incomeCap: number | null;
  /** population: every focus resident counts 1. need: scaled by the need index. */
  weighting: "population" | "need";
  /** Restrict purchases to these types. */
  domains: AccessDomain[];
  minTph?: number;
}

export interface BudgetPick {
  domain: AccessDomain;
  geoid: string;
  name: string;
  county: string;
  place: string;
  lon: number;
  lat: number;
  cost: number;
  /** Weighted focus residents newly covered for this type when bought. */
  gain: number;
  /** Raw focus residents newly covered for this type when bought. */
  residents: number;
  /** Order of purchase (1 = first). */
  step: number;
}

export interface BudgetDomainSummary {
  count: number;
  spent: number;
  /** Focus residents newly covered for this type. */
  residentsGained: number;
  /** Share of focus residents with this type in reach, before and after. */
  coverageBefore: number;
  coverageAfter: number;
}

export interface BudgetResult {
  options: BudgetOptions;
  picks: BudgetPick[];
  spent: number;
  remaining: number;
  /** Residents in the focus group (below the income cap). */
  focusPop: number;
  totalPop: number;
  /** Focus residents who gained at least one new service type. */
  residentsGainedAny: number;
  byDomain: Record<AccessDomain, BudgetDomainSummary>;
  improvedBySwap: boolean;
}
