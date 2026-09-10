/**
 * Colour scales for the map. Values follow the dataviz reference palette:
 * one hue per sequential context (blue for need, orange for access), a
 * blue↔red diverging pair with a neutral midpoint, and two categorical
 * slots for clusters. Text never wears a series colour.
 */

import type { Cluster } from "@/lib/spatial/moran";

export type Mode = "gap" | "need" | "access" | "growth" | "clusters";

export const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  {
    id: "gap",
    label: "Gap",
    blurb: "Need minus access. Red where need outruns access, blue where access outruns need.",
  },
  { id: "need", label: "Need", blurb: "Composite of poverty, no-vehicle households, seniors, children and growth." },
  { id: "access", label: "Access", blurb: "Catchment accessibility to groceries, pharmacies, clinics and transit." },
  { id: "growth", label: "Growth", blurb: "Population change 2019 to 2024, apportioned onto 2020 tracts." },
  { id: "clusters", label: "Clusters", blurb: "Local Moran's I on the gap. Where high gaps sit next to high gaps." },
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
  { label: "access well ahead", color: "#1c5cab", upto: -1 },
  { label: "access ahead", color: "#9ec5f4", upto: -0.4 },
  { label: "balanced", color: "#f0efec", upto: 0.4 },
  { label: "need ahead", color: "#f2a4a3", upto: 1 },
  { label: "need well ahead", color: "#b83232" },
];

export const GROWTH_BINS: Bin[] = [
  { label: "lost more than 15%", color: "#b83232", upto: -0.15 },
  { label: "lost 5 to 15%", color: "#f2a4a3", upto: -0.05 },
  { label: "within 5%", color: "#f0efec", upto: 0.05 },
  { label: "grew 5 to 25%", color: "#9ec5f4", upto: 0.25 },
  { label: "grew more than 25%", color: "#1c5cab" },
];

export const CLUSTER_COLORS: Record<Cluster, string> = {
  HH: "#eb6834",
  LL: "#2a78d6",
  HL: "#f5b592",
  LH: "#9ec5f4",
  ns: NEUTRAL,
};

export const CLUSTER_BINS: Bin[] = [
  { label: "high-gap cluster (HH)", color: CLUSTER_COLORS.HH },
  { label: "low-gap cluster (LL)", color: CLUSTER_COLORS.LL },
  { label: "high gap, low neighbours (HL)", color: CLUSTER_COLORS.HL },
  { label: "low gap, high neighbours (LH)", color: CLUSTER_COLORS.LH },
  { label: "not significant", color: CLUSTER_COLORS.ns },
];

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
  return x == null ? "n/a" : x.toLocaleString("en-US");
}

export function fmtZ(x: number): string {
  return (x >= 0 ? "+" : "") + x.toFixed(2);
}
