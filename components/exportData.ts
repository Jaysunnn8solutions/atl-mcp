import type { TractResult } from "@/lib/analysis/types";
import type { TractCollection } from "@/lib/data/load";

const COLUMNS = [
  "geoid", "name", "county", "pop", "medianIncome", "medianRent", "povertyRate",
  "noVehicleRate", "seniorShare", "childShare", "popGrowth", "need", "access", "gap",
  "needTertile", "accessTertile", "biClass", "cluster", "lisaI", "lisaP",
  "accessGrocery", "accessPharmacy", "accessClinic", "accessTransit",
] as const;

function rowFor(tracts: TractCollection, r: TractResult, geoid: string): Array<string | number | null> {
  const p = tracts.features.find((f) => f.properties.geoid === geoid)?.properties;
  if (!p) return [];
  return [
    p.geoid, p.name, p.county, p.pop, p.medianIncome, p.medianRent, p.povertyRate,
    p.noVehicleRate, p.seniorShare, p.childShare, r.popGrowth, r.need, r.access, r.gap,
    r.needTertile, r.accessTertile, r.biClass, r.lisa.cluster, r.lisa.I, r.lisa.p,
    r.accessBy.grocery, r.accessBy.pharmacy, r.accessBy.clinic, r.accessBy.transit,
  ];
}

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(tracts: TractCollection, results: Map<string, TractResult>): string {
  const lines = [COLUMNS.join(",")];
  for (const f of tracts.features) {
    const r = results.get(f.properties.geoid);
    if (!r) continue;
    lines.push(rowFor(tracts, r, f.properties.geoid).map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function toGeoJson(tracts: TractCollection, results: Map<string, TractResult>): string {
  const fc = {
    type: "FeatureCollection",
    features: tracts.features.map((f) => {
      const r = results.get(f.properties.geoid);
      const { neighbors: _neighbors, ...props } = f.properties;
      void _neighbors;
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: r
          ? {
              ...props,
              need: r.need,
              access: r.access,
              gap: r.gap,
              biClass: r.biClass,
              cluster: r.lisa.cluster,
              lisaI: r.lisa.I,
              lisaP: r.lisa.p,
              popGrowth: r.popGrowth,
              ...Object.fromEntries(Object.entries(r.accessBy).map(([k, v]) => [`access_${k}`, v])),
            }
          : props,
      };
    }),
  };
  return JSON.stringify(fc);
}

export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
