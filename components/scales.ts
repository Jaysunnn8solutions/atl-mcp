/**
 * Colour scales for the map. Values follow the dataviz reference palette:
 * one hue per sequential context (blue for need, orange for access), a
 * blue↔red diverging pair with a neutral midpoint, and two categorical
 * slots for clusters. Text never wears a series colour.
 */

import type { AccessDomain } from "@/lib/analysis/types";
import type { Cluster } from "@/lib/spatial/moran";

export type Mode = "gap" | "need" | "access" | "growth" | "clusters" | "coverage" | "delta";

export const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  {
    id: "gap",
    label: "Gap",
    blurb: "Red where people need more than they can reach; blue where services outrun need.",
  },
  { id: "need", label: "Need", blurb: "How much each tract needs services, from poverty, car ownership, age mix and growth." },
  { id: "access", label: "Access", blurb: "How easily residents can reach groceries, pharmacies, clinics and frequent transit." },
  { id: "growth", label: "Growth", blurb: "How the population has changed since 2019." },
  { id: "clusters", label: "Problem areas", blurb: "Runs of neighbouring tracts where need outruns access, so the problem is an area, not a tract." },
  { id: "coverage", label: "Coverage", blurb: "Tracts with none of the chosen service within reach, grouped into holes." },
  { id: "delta", label: "Δ Access", blurb: "How much your scenario changed access, tract by tract." },
];

export interface Bin {
  label: string;
  color: string;
  /** Upper bound (exclusive); the last bin is open. */
  upto?: number;
}

const BLUE = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const ORANGE = ["#fbe3d6", "#f5b592", "#eb6834", "#b84a1f", "#7a2f11"];
const NEUTRAL = "#e1e0d9";
const NO_DATA = "#c3c2b7";

const Z_BREAKS = [-1, -0.4, 0.4, 1];
const Z_LABELS = ["well below average", "below", "near average", "above", "well above average"];

export const NEED_BINS: Bin[] = Z_LABELS.map((label, i) => ({
  label,
  color: BLUE[i],
  upto: Z_BREAKS[i],
}));

export const ACCESS_BINS: Bin[] = Z_LABELS.map((label, i) => ({
  label,
  color: ORANGE[i],
  upto: Z_BREAKS[i],
}));

/** Diverging: red arm = need outruns access, blue arm = access outruns need. */
export const GAP_BINS: Bin[] = [
  { label: "well served for its need", color: "#1c5cab", upto: -1 },
  { label: "served a little better than needed", color: "#9ec5f4", upto: -0.4 },
  { label: "roughly balanced", color: "#f0efec", upto: 0.4 },
  { label: "needs more than it can reach", color: "#f2a4a3", upto: 1 },
  { label: "needs much more than it can reach", color: "#b83232" },
];

export const GROWTH_BINS: Bin[] = [
  { label: "lost more than 15%", color: "#b83232", upto: -0.15 },
  { label: "lost 5 to 15%", color: "#f2a4a3", upto: -0.05 },
  { label: "within 5%", color: "#f0efec", upto: 0.05 },
  { label: "grew 5 to 25%", color: "#9ec5f4", upto: 0.25 },
  { label: "grew more than 25%", color: "#1c5cab" },
];

/** Diverging: blue = access improved under the scenario. */
export const DELTA_BINS: Bin[] = [
  { label: "access much worse", color: "#b83232", upto: -0.5 },
  { label: "access slightly worse", color: "#f2a4a3", upto: -0.05 },
  { label: "no real change", color: "#f0efec", upto: 0.05 },
  { label: "access better", color: "#9ec5f4", upto: 0.5 },
  { label: "access much better", color: "#1c5cab" },
];

export const CLUSTER_COLORS: Record<Cluster, string> = {
  HH: "#eb6834",
  LL: "#2a78d6",
  HL: "#f5b592",
  LH: "#9ec5f4",
  ns: NEUTRAL,
};

export const CLUSTER_BINS: Bin[] = [
  { label: "problem area: need outruns access here and next door", color: CLUSTER_COLORS.HH },
  { label: "well-served area", color: CLUSTER_COLORS.LL },
  { label: "struggling tract inside a well-served area", color: CLUSTER_COLORS.HL },
  { label: "well-served tract inside a problem area", color: CLUSTER_COLORS.LH },
  { label: "no clear pattern", color: CLUSTER_COLORS.ns },
];

export const COVERAGE_COLORS = {
  covered: NEUTRAL,
  uncovered: ORANGE[2],
  topCluster: ORANGE[3],
};

export const COVERAGE_BINS: Bin[] = [
  { label: "has at least one within reach", color: COVERAGE_COLORS.covered },
  { label: "has none within reach", color: COVERAGE_COLORS.uncovered },
  { label: "has none, and is in one of the three biggest holes", color: COVERAGE_COLORS.topCluster },
];

/** Point colours for supply overlays and scenario facilities (categorical slots). */
export const DOMAIN_COLORS: Record<AccessDomain, string> = {
  grocery: "#008300",
  pharmacy: "#4a3aa7",
  clinic: "#e87ba4",
  transit: "#2a78d6",
};

export const DOMAIN_LABELS: Record<AccessDomain, string> = {
  grocery: "Grocery",
  pharmacy: "Pharmacy",
  clinic: "Clinic",
  transit: "Transit stop",
};

export function binColor(value: number | null | undefined, bins: Bin[]): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  for (const b of bins) {
    if (b.upto === undefined || value < b.upto) return b.color;
  }
  return bins[bins.length - 1].color;
}

export function binsFor(mode: Mode): Bin[] {
  switch (mode) {
    case "need":
      return NEED_BINS;
    case "access":
      return ACCESS_BINS;
    case "growth":
      return GROWTH_BINS;
    case "clusters":
      return CLUSTER_BINS;
    case "coverage":
      return COVERAGE_BINS;
    case "delta":
      return DELTA_BINS;
    default:
      return GAP_BINS;
  }
}

export const NO_DATA_COLOR = NO_DATA;

export function fmtPct(x: number | null | undefined, digits = 1): string {
  return x == null ? "n/a" : `${(x * 100).toFixed(digits)}%`;
}

export function fmtMoney(x: number | null | undefined): string {
  return x == null ? "n/a" : `$${Math.round(x).toLocaleString("en-US")}`;
}

export function fmtNum(x: number | null | undefined): string {
  return x == null ? "n/a" : Math.round(x).toLocaleString("en-US");
}

/** Compact figure for stat tiles: 1,244,337 → "1.24M", 31,944 → "31.9k". */
export function fmtCompact(x: number): string {
  const abs = Math.abs(x);
  if (abs >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(x / 1e3).toFixed(1)}k`;
  return Math.round(x).toLocaleString("en-US");
}

export function fmtZ(x: number): string {
  return (x >= 0 ? "+" : "") + x.toFixed(2);
}
