/**
 * The supply side: points of interest and transit stops, with optional
 * scenario overrides applied. Every analysis that touches supply goes
 * through here so what-if, coverage, and site selection agree.
 */

import type { Supply } from "../spatial/catchment";
import { loadPois, loadStops } from "../data/load";
import { EMPTY_OVERRIDES } from "./params";
import type { AccessDomain, SupplyOverrides } from "./types";

export interface SupplyPoint extends Supply {
  id: string;
  name: string;
  domain: AccessDomain;
  /** True for a facility added by a scenario. */
  hypothetical: boolean;
}

const DEFAULT_STOP_TPH = 6;

export function supplyFor(
  domain: AccessDomain,
  overrides: SupplyOverrides = EMPTY_OVERRIDES,
  options: { minTph?: number } = {}
): SupplyPoint[] {
  const removed = new Set(overrides.remove);
  const out: SupplyPoint[] = [];

  if (domain === "transit") {
    for (const s of loadStops()) {
      if (removed.has(s.id)) continue;
      if (options.minTph != null && s.tph < options.minTph) continue;
      out.push({
        id: s.id,
        name: s.name,
        domain,
        lon: s.lon,
        lat: s.lat,
        capacity: s.tph,
        hypothetical: false,
      });
    }
  } else {
    for (const p of loadPois()) {
      if (p.category !== domain || removed.has(p.id)) continue;
      out.push({
        id: p.id,
        name: p.name,
        domain,
        lon: p.lon,
        lat: p.lat,
        capacity: 1,
        hypothetical: false,
      });
    }
  }

  overrides.add.forEach((f, i) => {
    if (f.domain !== domain) return;
    const capacity = f.capacity ?? (domain === "transit" ? DEFAULT_STOP_TPH : 1);
    if (options.minTph != null && domain === "transit" && capacity < options.minTph) return;
    out.push({
      id: `new-${i}`,
      name: f.label ?? `Proposed ${domain}`,
      domain,
      lon: f.lon,
      lat: f.lat,
      capacity,
      hypothetical: true,
    });
  });

  return out;
}

export function overridesKey(overrides: SupplyOverrides): string {
  if (overrides.add.length === 0 && overrides.remove.length === 0) return "";
  return JSON.stringify(overrides);
}
