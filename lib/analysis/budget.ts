/**
 * Budget planner: given a pot of money and a cost per facility type, which
 * mix of new groceries, pharmacies, clinics and transit stops gives the
 * most lower-income residents at least one of each essential service?
 *
 * This is a budgeted, multi-type maximal covering problem. The solver is
 * greedy by benefit per dollar (each step buys the candidate with the best
 * newly-covered weight per dollar that still fits), followed by a swap
 * pass that tries to replace each purchase with a better one of the same
 * type. Costs are inputs, not facts: defaults are rough capital figures
 * meant to be edited.
 */

import type { Point } from "../spatial/catchment";
import { haversineKm } from "../spatial/stats";
import { tractUnits, type CoverageUnit } from "./coverage";
import { EMPTY_OVERRIDES } from "./params";
import { runAnalysisCached } from "./run";
import { supplyFor } from "./supply";
import { ACCESS_DOMAINS, type AccessDomain, type AnalysisParams, type SupplyOverrides } from "./types";
import { loadTracts } from "../data/load";

import {
  DEFAULT_COSTS,
  type BudgetDomainSummary,
  type BudgetOptions,
  type BudgetPick,
  type BudgetResult,
  type CostTable,
} from "./budget-types";

export { DEFAULT_COSTS };
export type { BudgetDomainSummary, BudgetOptions, BudgetPick, BudgetResult, CostTable };

function reach(point: Point, units: CoverageUnit[], radiusKm: number): number[] {
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.cos((point.lat * Math.PI) / 180));
  const out: number[] = [];
  for (let j = 0; j < units.length; j++) {
    const u = units[j];
    if (Math.abs(u.lat - point.lat) > dLat || Math.abs(u.lon - point.lon) > dLon) continue;
    if (haversineKm(point.lon, point.lat, u.lon, u.lat) <= radiusKm) out.push(j);
  }
  return out;
}

export function planBudget(
  opts: BudgetOptions,
  params: AnalysisParams,
  overrides: SupplyOverrides = EMPTY_OVERRIDES
): BudgetResult {
  const units = tractUnits();
  const features = loadTracts().features;
  const props = features.map((f) => f.properties);
  const n = units.length;

  // ---- Who counts ----------------------------------------------------------
  const inFocus = props.map(
    (p) => opts.incomeCap == null || (p.medianIncome != null && p.medianIncome <= opts.incomeCap)
  );
  const focusPop = units.reduce((s, u, i) => s + (inFocus[i] ? u.pop : 0), 0);
  const totalPop = units.reduce((s, u) => s + u.pop, 0);

  let needFactor: number[] = units.map(() => 1);
  if (opts.weighting === "need") {
    const analysis = runAnalysisCached(params, overrides);
    needFactor = analysis.tracts.map((t) => Math.max(0.1, 1 + t.need));
  }
  const weight = units.map((u, i) => (inFocus[i] ? u.pop * needFactor[i] : 0));
  const rawPop = units.map((u, i) => (inFocus[i] ? u.pop : 0));

  // ---- Coverage state per type -------------------------------------------
  const candidates = units
    .map((u, i) => ({ id: u.geoid, lon: u.lon, lat: u.lat, index: i }))
    .filter((c) => units[c.index].pop > 0);
  const state = {} as Record<
    AccessDomain,
    { coverCount: number[]; reachOf: number[][]; baselineCovered: number }
  >;
  for (const domain of opts.domains) {
    const coverCount = new Array<number>(n).fill(0);
    for (const s of supplyFor(domain, overrides, { minTph: opts.minTph })) {
      for (const j of reach(s, units, opts.radiusKm)) coverCount[j]++;
    }
    let baselineCovered = 0;
    for (let j = 0; j < n; j++) if (coverCount[j] > 0) baselineCovered += rawPop[j];
    state[domain] = {
      coverCount,
      reachOf: candidates.map((c) => reach(c, units, opts.radiusKm)),
      baselineCovered,
    };
  }

  const gainOf = (domain: AccessDomain, ci: number) => {
    const st = state[domain];
    let g = 0;
    for (const j of st.reachOf[ci]) if (st.coverCount[j] === 0) g += weight[j];
    return g;
  };
  const rawGainOf = (domain: AccessDomain, ci: number) => {
    const st = state[domain];
    let g = 0;
    for (const j of st.reachOf[ci]) if (st.coverCount[j] === 0) g += rawPop[j];
    return g;
  };
  const buy = (domain: AccessDomain, ci: number) => {
    for (const j of state[domain].reachOf[ci]) state[domain].coverCount[j]++;
  };
  const sell = (domain: AccessDomain, ci: number) => {
    for (const j of state[domain].reachOf[ci]) state[domain].coverCount[j]--;
  };

  // ---- Greedy by benefit per dollar ------------------------------------------
  const chosen: Array<{ domain: AccessDomain; ci: number; gain: number; residents: number }> = [];
  const chosenSet = new Set<string>();
  let spent = 0;
  for (let step = 0; step < 500; step++) {
    let best: { domain: AccessDomain; ci: number; gain: number; ratio: number } | null = null;
    for (const domain of opts.domains) {
      const cost = opts.costs[domain];
      if (cost <= 0 || spent + cost > opts.budget) continue;
      for (let ci = 0; ci < candidates.length; ci++) {
        if (chosenSet.has(`${domain}:${ci}`)) continue;
        const g = gainOf(domain, ci);
        if (g <= 0) continue;
        const ratio = g / cost;
        if (!best || ratio > best.ratio + 1e-12) best = { domain, ci, gain: g, ratio };
      }
    }
    if (!best) break;
    chosen.push({ domain: best.domain, ci: best.ci, gain: best.gain, residents: rawGainOf(best.domain, best.ci) });
    chosenSet.add(`${best.domain}:${best.ci}`);
    buy(best.domain, best.ci);
    spent += opts.costs[best.domain];
  }

  // ---- Swap improvement within each type ------------------------------------
  let improved = false;
  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    for (const pick of chosen) {
      sell(pick.domain, pick.ci);
      const current = gainOf(pick.domain, pick.ci);
      let bestCi = pick.ci;
      let bestGain = current;
      for (let ci = 0; ci < candidates.length; ci++) {
        if (ci === pick.ci || chosenSet.has(`${pick.domain}:${ci}`)) continue;
        const g = gainOf(pick.domain, ci);
        if (g > bestGain + 1e-9) {
          bestGain = g;
          bestCi = ci;
        }
      }
      if (bestCi !== pick.ci) {
        chosenSet.delete(`${pick.domain}:${pick.ci}`);
        chosenSet.add(`${pick.domain}:${bestCi}`);
        pick.ci = bestCi;
        pick.gain = bestGain;
        pick.residents = rawGainOf(pick.domain, bestCi);
        any = true;
        improved = true;
      }
      buy(pick.domain, pick.ci);
    }
    if (!any) break;
  }

  // ---- Report -----------------------------------------------------------------
  const byDomain = {} as Record<AccessDomain, BudgetDomainSummary>;
  for (const domain of ACCESS_DOMAINS) {
    const st = state[domain];
    let after = 0;
    if (st) for (let j = 0; j < n; j++) if (st.coverCount[j] > 0) after += rawPop[j];
    const mine = chosen.filter((c) => c.domain === domain);
    byDomain[domain] = {
      count: mine.length,
      spent: mine.length * opts.costs[domain],
      residentsGained: st ? after - st.baselineCovered : 0,
      coverageBefore: st && focusPop > 0 ? st.baselineCovered / focusPop : 0,
      coverageAfter: st && focusPop > 0 ? after / focusPop : 0,
    };
  }

  // Residents who gained at least one new type: any domain newly covered.
  let residentsGainedAny = 0;
  for (let j = 0; j < n; j++) {
    if (!inFocus[j]) continue;
    let gained = false;
    for (const domain of opts.domains) {
      const st = state[domain];
      // Newly covered = covered now but not by existing supply alone.
      const existing = st.coverCount[j] - chosen.filter((c) => c.domain === domain && st.reachOf[c.ci].includes(j)).length;
      if (st.coverCount[j] > 0 && existing === 0) gained = true;
    }
    if (gained) residentsGainedAny += units[j].pop;
  }

  const picks: BudgetPick[] = chosen.map((c, i) => {
    const p = props[candidates[c.ci].index];
    return {
      domain: c.domain,
      geoid: p.geoid,
      name: p.name,
      county: p.county,
      place: p.place,
      lon: p.cx,
      lat: p.cy,
      cost: opts.costs[c.domain],
      gain: Math.round(c.gain),
      residents: c.residents,
      step: i + 1,
    };
  });

  return {
    options: opts,
    picks,
    spent,
    remaining: opts.budget - spent,
    focusPop,
    totalPop,
    residentsGainedAny,
    byDomain,
    improvedBySwap: improved,
  };
}
