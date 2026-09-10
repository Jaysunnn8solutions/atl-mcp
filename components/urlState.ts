/**
 * Shareable view state in the URL hash. Only runs on the client (the
 * dashboard is loaded without SSR), so reading `window` is safe.
 */

import type { AccessDomain, FacilitySpec } from "@/lib/analysis/types";
import type { Overlays } from "./GapMap";
import type { Mode } from "./scales";
import type { Params } from "./Sidebar";

export interface ViewState {
  mode: Mode;
  params: Params;
  showPriority: boolean;
  overlays: Overlays;
  selected: string | null;
  scenario: FacilitySpec[];
  coverageDomain: AccessDomain;
  minTph: number;
}

export const DEFAULT_PARAMS: Params = {
  radiusKm: 1.6,
  decay: "gaussian",
  wPoverty: 1,
  wNoVehicle: 1,
  wSeniors: 0.5,
  wChildren: 0.5,
  wGrowth: 1,
};

export const DEFAULT_VIEW: ViewState = {
  mode: "gap",
  params: DEFAULT_PARAMS,
  showPriority: true,
  overlays: { rail: true, grocery: false, pharmacy: false, clinic: false },
  selected: null,
  scenario: [],
  coverageDomain: "grocery",
  minTph: 4,
};

const MODES = new Set<Mode>(["gap", "need", "access", "growth", "clusters", "coverage", "delta"]);
const DOMAINS = new Set<AccessDomain>(["grocery", "pharmacy", "clinic", "transit"]);

function num(s: string | null, fallback: number, lo: number, hi: number): number {
  const n = Number(s);
  return s != null && Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
}

export function readHash(): ViewState {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const modeRaw = h.get("mode") as Mode | null;
  const w = (h.get("w") ?? "").split(",").map(Number);
  const wOk = w.length === 5 && w.every((x) => Number.isFinite(x) && x >= 0 && x <= 5);
  const ov = new Set((h.get("ov") ?? "").split(",").filter(Boolean));
  const scenario: FacilitySpec[] = [];
  for (const item of (h.get("scn") ?? "").split("|").filter(Boolean)) {
    const m = /^(grocery|pharmacy|clinic|transit)@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(item);
    if (m) scenario.push({ domain: m[1] as AccessDomain, lat: Number(m[2]), lon: Number(m[3]) });
  }
  const covRaw = h.get("cov") as AccessDomain | null;
  return {
    mode: modeRaw && MODES.has(modeRaw) ? modeRaw : DEFAULT_VIEW.mode,
    params: {
      radiusKm: num(h.get("r"), DEFAULT_PARAMS.radiusKm, 0.25, 5),
      decay: h.get("d") === "binary" ? "binary" : "gaussian",
      wPoverty: wOk ? w[0] : DEFAULT_PARAMS.wPoverty,
      wNoVehicle: wOk ? w[1] : DEFAULT_PARAMS.wNoVehicle,
      wSeniors: wOk ? w[2] : DEFAULT_PARAMS.wSeniors,
      wChildren: wOk ? w[3] : DEFAULT_PARAMS.wChildren,
      wGrowth: wOk ? w[4] : DEFAULT_PARAMS.wGrowth,
    },
    showPriority: h.get("pri") !== "0",
    overlays: h.has("ov")
      ? { rail: ov.has("rail"), grocery: ov.has("grocery"), pharmacy: ov.has("pharmacy"), clinic: ov.has("clinic") }
      : DEFAULT_VIEW.overlays,
    selected: /^13\d{9}$/.test(h.get("sel") ?? "") ? h.get("sel") : null,
    scenario: scenario.slice(0, 50),
    coverageDomain: covRaw && DOMAINS.has(covRaw) ? covRaw : DEFAULT_VIEW.coverageDomain,
    minTph: num(h.get("tph"), DEFAULT_VIEW.minTph, 0, 60),
  };
}

export function writeHash(v: ViewState): void {
  if (typeof window === "undefined") return;
  const h = new URLSearchParams();
  if (v.mode !== DEFAULT_VIEW.mode) h.set("mode", v.mode);
  const p = v.params;
  if (p.radiusKm !== DEFAULT_PARAMS.radiusKm) h.set("r", String(p.radiusKm));
  if (p.decay !== DEFAULT_PARAMS.decay) h.set("d", p.decay);
  const w = [p.wPoverty, p.wNoVehicle, p.wSeniors, p.wChildren, p.wGrowth];
  const dw = [DEFAULT_PARAMS.wPoverty, DEFAULT_PARAMS.wNoVehicle, DEFAULT_PARAMS.wSeniors, DEFAULT_PARAMS.wChildren, DEFAULT_PARAMS.wGrowth];
  if (w.some((x, i) => x !== dw[i])) h.set("w", w.join(","));
  if (!v.showPriority) h.set("pri", "0");
  const ov = (Object.keys(v.overlays) as Array<keyof Overlays>).filter((k) => v.overlays[k]);
  const dov = (Object.keys(DEFAULT_VIEW.overlays) as Array<keyof Overlays>).filter((k) => DEFAULT_VIEW.overlays[k]);
  if (ov.join(",") !== dov.join(",")) h.set("ov", ov.join(","));
  if (v.selected) h.set("sel", v.selected);
  if (v.scenario.length) {
    h.set("scn", v.scenario.map((f) => `${f.domain}@${f.lat.toFixed(5)},${f.lon.toFixed(5)}`).join("|"));
  }
  if (v.coverageDomain !== DEFAULT_VIEW.coverageDomain) h.set("cov", v.coverageDomain);
  if (v.minTph !== DEFAULT_VIEW.minTph) h.set("tph", String(v.minTph));
  // Keep the scenario separators readable in a shared link.
  const next = h.toString().replace(/%40/g, "@").replace(/%2C/g, ",").replace(/%7C/g, "|");
  const current = window.location.hash.replace(/^#/, "");
  if (next !== current) {
    window.history.replaceState(null, "", next ? `#${next}` : window.location.pathname);
  }
}
