/**
 * Plain-language readings of the scores, shared by the map card and the
 * MCP tools so a person and a model see the same words for the same
 * numbers. Words come from percentile ranks, so they line up with the
 * tertile flags: the bottom third is always "poor" or "very poor".
 */

import type { Cluster } from "../spatial/moran";
import type { TractResult } from "./types";

export type Band = "very low" | "low" | "average" | "high" | "very high";

/** Band from a percentile rank (0–100). */
export function band(pct: number): Band {
  if (pct < 15) return "very low";
  if (pct < 34) return "low";
  if (pct <= 66) return "average";
  if (pct <= 85) return "high";
  return "very high";
}

const ACCESS_WORDS: Record<Band, string> = {
  "very low": "very poor",
  low: "poor",
  average: "typical",
  high: "good",
  "very high": "very good",
};

export function needWords(pct: number): string {
  return `${band(pct)} need`;
}

export function accessWords(pct: number): string {
  return `${ACCESS_WORDS[band(pct)]} access`;
}

/** "more need than 72% of tracts" / "less need than 80% of tracts". */
export function needRank(pct: number): string {
  const p = Math.round(pct);
  if (p >= 100) return "the most need of any tract";
  if (p <= 0) return "the least need of any tract";
  return p >= 50 ? `more need than ${p}% of tracts` : `less need than ${100 - p}% of tracts`;
}

/** "worse access than 88% of tracts" / "better access than 70% of tracts". */
export function accessRank(pct: number): string {
  const p = Math.round(pct);
  if (p >= 100) return "the best access of any tract";
  if (p <= 0) return "the worst access of any tract";
  return p >= 50 ? `better access than ${p}% of tracts` : `worse access than ${100 - p}% of tracts`;
}

/** "Lithonia, DeKalb County" or just "Unincorporated DeKalb County". */
export function placeLabel(place: string | undefined, county: string): string {
  if (!place) return `${county} County`;
  return place.startsWith("Unincorporated") ? place : `${place}, ${county} County`;
}

export type Flag = "Priority" | "Watch" | "Not flagged";

export function flag(t: Pick<TractResult, "needTertile" | "accessTertile">): Flag {
  if (t.needTertile === 3 && t.accessTertile === 1) return "Priority";
  if ((t.needTertile === 3 && t.accessTertile === 2) || (t.needTertile === 2 && t.accessTertile === 1)) {
    return "Watch";
  }
  return "Not flagged";
}

type Scored = Pick<TractResult, "needPct" | "accessPct" | "needTertile" | "accessTertile">;

/** One sentence that says what the numbers add up to. */
export function verdict(t: Scored): string {
  const n = band(t.needPct);
  const a = ACCESS_WORDS[band(t.accessPct)];
  switch (flag(t)) {
    case "Priority":
      return `Priority: ${n} need and ${a} access.`;
    case "Watch":
      return t.needTertile === 3
        ? `Worth watching: ${n} need, and access is only ${a}.`
        : `Worth watching: ${a} access, though need is ${n}.`;
    default:
      if (t.accessTertile === 1) return `Not flagged: access is ${a}, but need is ${n}.`;
      if (t.needTertile === 3) return `Not flagged: need is ${n}, but access is ${a}.`;
      return `Not flagged: ${n} need with ${a} access.`;
  }
}

/** Describe a change in an index between baseline and scenario. */
export function changeWords(delta: number, what = "access"): string {
  const d = Math.abs(delta);
  const dir = delta > 0 ? "better" : "worse";
  if (d < 0.02) return `${what} unchanged`;
  if (d < 0.15) return `${what} slightly ${dir}`;
  if (d < 0.5) return `${what} ${dir}`;
  return `${what} much ${dir}`;
}

export function clusterSentence(c: Cluster): string {
  switch (c) {
    case "HH":
      return "Part of a run of neighbouring tracts where need outruns access.";
    case "LL":
      return "Part of a run of neighbouring tracts where access keeps up with need.";
    case "HL":
      return "An outlier: need outruns access here, but not in the tracts around it.";
    case "LH":
      return "An outlier: access keeps up here, though the tracts around it struggle.";
    default:
      return "Not part of any wider pattern; its neighbours are a mix.";
  }
}

/** Describe global Moran's I for a non-technical reader. */
export function clusteringWords(I: number, p: number): string {
  if (p > 0.05) return "Gaps are scattered rather than clustered.";
  if (I >= 0.3) return "Gaps cluster strongly: whole areas, not isolated tracts.";
  if (I >= 0.15) return "Gaps cluster moderately.";
  return "Gaps cluster weakly.";
}

export function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}
