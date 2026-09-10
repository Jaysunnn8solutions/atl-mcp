"use client";

import type { AnalysisResult, TractProps, TractResult } from "@/lib/analysis/types";
import { Legend } from "./Legend";
import type { Overlays } from "./GapMap";
import { fmtMoney, fmtNum, fmtPct, fmtZ, MODES, type Mode } from "./scales";
import styles from "./Sidebar.module.css";

export interface Params {
  radiusKm: number;
  decay: "binary" | "gaussian";
  wPoverty: number;
  wNoVehicle: number;
  wSeniors: number;
  wChildren: number;
  wGrowth: number;
}

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  params: Params;
  onParams: (p: Params) => void;
  showPriority: boolean;
  onShowPriority: (v: boolean) => void;
  overlays: Overlays;
  onOverlays: (o: Overlays) => void;
  analysis: AnalysisResult | null;
  loading: boolean;
  selected: { props: TractProps; result: TractResult | undefined } | null;
  onClearSelection: () => void;
}

const WEIGHTS: Array<{ key: keyof Params; label: string }> = [
  { key: "wPoverty", label: "Poverty" },
  { key: "wNoVehicle", label: "No vehicle" },
  { key: "wSeniors", label: "Seniors" },
  { key: "wChildren", label: "Children" },
  { key: "wGrowth", label: "Growth" },
];

const CLUSTER_WORDS: Record<TractResult["lisa"]["cluster"], string> = {
  HH: "high-gap cluster",
  LL: "low-gap cluster",
  HL: "high gap, low neighbours",
  LH: "low gap, high neighbours",
  ns: "no significant cluster",
};

export function Sidebar(props: Props) {
  const { mode, onMode, params, onParams, analysis, loading, selected } = props;
  const modeInfo = MODES.find((m) => m.id === mode)!;

  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <h1>Atlanta resource gap screen</h1>
        <p>
          Where need is high or rising, and access to groceries, pharmacies, clinics and
          transit is low. Fulton, DeKalb and Clayton counties by census tract.
        </p>
      </header>

      <section>
        <div className={styles.segmented} role="tablist" aria-label="Map layer">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              className={mode === m.id ? styles.active : ""}
              onClick={() => onMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className={styles.blurb}>{modeInfo.blurb}</p>
        <Legend mode={mode} showPriority={props.showPriority} />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={props.showPriority}
            onChange={(e) => props.onShowPriority(e.target.checked)}
          />
          Outline priority tracts
        </label>
      </section>

      {selected ? (
        <TractDetail
          p={selected.props}
          r={selected.result}
          vintages={analysis?.dataVintages}
          onClose={props.onClearSelection}
        />
      ) : (
        <Summary analysis={analysis} loading={loading} />
      )}

      <section>
        <h2>Catchment</h2>
        <label className={styles.range}>
          <span>
            Radius <strong>{params.radiusKm.toFixed(2)} km</strong>
            <em>{(params.radiusKm * 0.621371).toFixed(2)} mi</em>
          </span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={params.radiusKm}
            onChange={(e) => onParams({ ...params, radiusKm: Number(e.target.value) })}
          />
        </label>
        <div className={styles.segmented}>
          {(["gaussian", "binary"] as const).map((d) => (
            <button
              key={d}
              className={params.decay === d ? styles.active : ""}
              onClick={() => onParams({ ...params, decay: d })}
            >
              {d === "gaussian" ? "Distance decay" : "Hard cutoff"}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Need weights</h2>
        {WEIGHTS.map(({ key, label }) => (
          <label key={key} className={styles.range}>
            <span>
              {label} <strong>{(params[key] as number).toFixed(1)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={params[key] as number}
              onChange={(e) => onParams({ ...params, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </section>

      <section>
        <h2>Overlays</h2>
        {(
          [
            ["rail", "MARTA rail stations"],
            ["grocery", "Groceries"],
            ["pharmacy", "Pharmacies"],
            ["clinic", "Clinics and hospitals"],
          ] as Array<[keyof Overlays, string]>
        ).map(([key, label]) => (
          <label key={key} className={styles.check}>
            <input
              type="checkbox"
              checked={props.overlays[key]}
              onChange={(e) => props.onOverlays({ ...props.overlays, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>
          Screening tool, not a recommendation. ACS {analysis?.dataVintages.acs ?? "…"} and{" "}
          {analysis?.dataVintages.acsPrior ?? "…"} 5-year estimates, OpenStreetMap, MARTA GTFS.{" "}
          <a href="https://github.com/Jaysunnn8solutions/atl-mcp">Source and method</a>. The same
          analysis is exposed as MCP tools at <code>/mcp</code>.
        </p>
      </footer>
    </aside>
  );
}

function Summary({ analysis, loading }: { analysis: AnalysisResult | null; loading: boolean }) {
  if (!analysis) {
    return (
      <section>
        <h2>Summary</h2>
        <p className={styles.blurb}>{loading ? "Computing…" : "No results."}</p>
      </section>
    );
  }
  const s = analysis.summary;
  return (
    <section aria-busy={loading}>
      <h2>Summary {loading && <span className={styles.spinner}>updating</span>}</h2>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileValue}>{s.priorityCount}</span>
          <span className={styles.tileLabel}>priority tracts</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileValue}>{s.hotspotCount}</span>
          <span className={styles.tileLabel}>in high-gap clusters</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileValue}>{analysis.global.I.toFixed(2)}</span>
          <span className={styles.tileLabel}>
            Moran&apos;s I{" "}
            {analysis.global.p < 0.01 ? "(p < 0.01)" : `(p = ${analysis.global.p.toFixed(2)})`}
          </span>
        </div>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>County</th>
            <th>Tracts</th>
            <th>Priority</th>
            <th>Need</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {s.byCounty.map((c) => (
            <tr key={c.county}>
              <td>{c.county}</td>
              <td>{c.tracts}</td>
              <td>{c.priority}</td>
              <td>{fmtZ(c.meanNeed)}</td>
              <td>{fmtZ(c.meanAccess)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.blurb}>Click a tract for its profile.</p>
    </section>
  );
}

function change(cur: number | null, prior: number | null): string {
  if (cur == null || prior == null || prior === 0) return "";
  const pct = ((cur - prior) / prior) * 100;
  return ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
}

function TractDetail({
  p,
  r,
  vintages,
  onClose,
}: {
  p: TractProps;
  r: TractResult | undefined;
  vintages: AnalysisResult["dataVintages"] | undefined;
  onClose: () => void;
}) {
  return (
    <section className={styles.detail}>
      <div className={styles.detailHead}>
        <h2>{p.name}</h2>
        <button onClick={onClose} aria-label="Close tract detail">
          ×
        </button>
      </div>
      <p className={styles.blurb}>
        {p.county} County · {p.geoid} · {p.landKm2} km²
      </p>
      {r && (
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtZ(r.need)}</span>
            <span className={styles.tileLabel}>need · tertile {r.needTertile}</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtZ(r.access)}</span>
            <span className={styles.tileLabel}>access · tertile {r.accessTertile}</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtZ(r.gap)}</span>
            <span className={styles.tileLabel}>gap · {r.biClass}</span>
          </div>
        </div>
      )}
      {r && (
        <p className={styles.blurb}>
          {CLUSTER_WORDS[r.lisa.cluster]}
          {r.lisa.cluster !== "ns" && ` (local I ${r.lisa.I.toFixed(2)}, p ${r.lisa.p.toFixed(3)})`}
          {r.biClass === "N3A1" && ". Priority cell."}
        </p>
      )}
      <dl className={styles.facts}>
        <dt>Population</dt>
        <dd>
          {fmtNum(p.pop)}
          {change(p.pop, p.pop2019)}
        </dd>
        <dt>Housing units</dt>
        <dd>
          {fmtNum(p.housingUnits)}
          {change(p.housingUnits, p.housingUnits2019)}
        </dd>
        <dt>Median income</dt>
        <dd>
          {fmtMoney(p.medianIncome)}
          {change(p.medianIncome, p.medianIncome2019)}
        </dd>
        <dt>Median rent</dt>
        <dd>
          {fmtMoney(p.medianRent)}
          {change(p.medianRent, p.medianRent2019)}
        </dd>
        <dt>Poverty</dt>
        <dd>{fmtPct(p.povertyRate)}</dd>
        <dt>No vehicle</dt>
        <dd>{fmtPct(p.noVehicleRate)}</dd>
        <dt>Age 65+</dt>
        <dd>{fmtPct(p.seniorShare)}</dd>
        <dt>Under 18</dt>
        <dd>{fmtPct(p.childShare)}</dd>
        <dt>Vacancy</dt>
        <dd>{fmtPct(p.vacancyRate)}</dd>
      </dl>
      {r && (
        <>
          <h3>Access per 1,000 residents</h3>
          <dl className={styles.facts}>
            {(Object.entries(r.accessBy) as Array<[string, number]>).map(([k, v]) => (
              <div key={k} className={styles.factRow}>
                <dt>{k}</dt>
                <dd>{v.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className={styles.blurb}>
        Change figures compare ACS {vintages?.acsPrior ?? "2019"} to {vintages?.acs ?? "2024"}.
      </p>
    </section>
  );
}
