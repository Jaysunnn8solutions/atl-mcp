"use client";

import { useState, type FormEvent } from "react";
import type {
  AccessDomain,
  AnalysisResult,
  FacilitySpec,
  TractProps,
  TractResult,
} from "@/lib/analysis/types";
import type { CoverageResult } from "@/lib/analysis/coverage";
import type { GeoMatch } from "@/lib/geocode";
import type { Overlays, MapPoint } from "./GapMap";
import { Legend } from "./Legend";
import {
  DOMAIN_COLORS,
  DOMAIN_LABELS,
  fmtCompact,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtZ,
  MODES,
  type Mode,
} from "./scales";
import styles from "./Sidebar.module.css";

import type { Params } from "@/lib/view-state";
export type { Params };

const DOMAINS: AccessDomain[] = ["grocery", "pharmacy", "clinic", "transit"];

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
  scenarioAnalysis: AnalysisResult | null;
  loading: boolean;
  selected: { props: TractProps; result: TractResult | undefined; baseline: TractResult | undefined } | null;
  onClearSelection: () => void;
  // Search
  onSearch: (q: string) => Promise<GeoMatch[]>;
  onGoTo: (p: MapPoint) => void;
  // Coverage
  coverageDomain: AccessDomain;
  onCoverageDomain: (d: AccessDomain) => void;
  minTph: number;
  onMinTph: (n: number) => void;
  coverage: CoverageResult | null;
  // Scenario
  scenario: FacilitySpec[];
  placing: AccessDomain | null;
  onPlacing: (d: AccessDomain | null) => void;
  onRemoveFacility: (i: number) => void;
  onClearScenario: () => void;
  onSuggestSites: (domain: AccessDomain, k: number) => Promise<void>;
  suggesting: boolean;
  // Export and share
  onExport: (kind: "csv" | "geojson") => void;
  /** Returns the text that was (or should be) copied and whether the clipboard accepted it. */
  onCopy: (kind: "link" | "settings") => Promise<{ text: string; copied: boolean }>;
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
  const { mode, onMode, params, onParams, analysis, scenarioAnalysis, loading, selected } = props;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const scenarioActive = props.scenario.length > 0;
  const modes = MODES.filter((m) => m.id !== "delta" || scenarioActive);

  return (
    <aside className={styles.sidebar}>
      <header className={styles.header}>
        <h1>Atlanta resource gap screen</h1>
        <p>
          Where need is high or rising, and access to groceries, pharmacies, clinics and
          transit is low. Fulton, DeKalb and Clayton counties by census tract.
        </p>
      </header>

      <SearchBox onSearch={props.onSearch} onGoTo={props.onGoTo} />

      <section>
        <div className={`${styles.segmented} ${styles.wrap}`} role="tablist" aria-label="Map layer">
          {modes.map((m) => (
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
        {mode === "coverage" && (
          <CoverageControls
            domain={props.coverageDomain}
            onDomain={props.onCoverageDomain}
            minTph={props.minTph}
            onMinTph={props.onMinTph}
            coverage={props.coverage}
            onGoTo={props.onGoTo}
          />
        )}
        <Legend mode={mode} showPriority={props.showPriority} />
        {mode !== "coverage" && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={props.showPriority}
              onChange={(e) => props.onShowPriority(e.target.checked)}
            />
            Outline priority tracts
          </label>
        )}
      </section>

      {selected ? (
        <TractDetail
          p={selected.props}
          r={selected.result}
          baseline={selected.baseline}
          scenarioActive={scenarioActive}
          vintages={analysis?.dataVintages}
          onClose={props.onClearSelection}
        />
      ) : (
        <Summary analysis={analysis} scenario={scenarioAnalysis} loading={loading} />
      )}

      <ScenarioPanel
        scenario={props.scenario}
        placing={props.placing}
        onPlacing={props.onPlacing}
        onRemove={props.onRemoveFacility}
        onClear={props.onClearScenario}
        onSuggest={props.onSuggestSites}
        suggesting={props.suggesting}
      />

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

      <SharePanel onCopy={props.onCopy} onExport={props.onExport} ready={!!analysis} scenarioActive={scenarioActive} />

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

function SharePanel({
  onCopy,
  onExport,
  ready,
  scenarioActive,
}: {
  onCopy: Props["onCopy"];
  onExport: Props["onExport"];
  ready: boolean;
  scenarioActive: boolean;
}) {
  const [status, setStatus] = useState<{ kind: "link" | "settings"; copied: boolean; text: string } | null>(null);
  const copy = async (kind: "link" | "settings") => {
    const r = await onCopy(kind);
    setStatus({ kind, ...r });
  };
  return (
    <section>
      <h2>Share and export</h2>
      <div className={styles.buttonRow}>
        <button className={styles.button} onClick={() => copy("settings")} disabled={!ready}>
          Copy settings for Claude
        </button>
        <button className={styles.button} onClick={() => copy("link")} disabled={!ready}>
          Copy link
        </button>
      </div>
      {status && status.copied && (
        <p className={styles.blurb}>
          {status.kind === "settings"
            ? "Copied. Paste it into a chat that has the atl-mcp server attached, then ask your question."
            : "Link copied."}
        </p>
      )}
      {status && !status.copied && (
        <textarea
          className={styles.copyBox}
          readOnly
          value={status.text}
          rows={4}
          aria-label="Text to copy"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <p className={styles.blurb}>
        The settings block carries the radius, weights and any scenario facilities as the exact
        arguments the MCP tools accept, so answers in chat match the map.
      </p>
      <div className={styles.buttonRow}>
        <button className={styles.button} onClick={() => onExport("csv")} disabled={!ready}>
          CSV
        </button>
        <button className={styles.button} onClick={() => onExport("geojson")} disabled={!ready}>
          GeoJSON
        </button>
      </div>
      <p className={styles.blurb}>
        Current results{scenarioActive ? " (scenario applied)" : ""}, one row per tract.
      </p>
    </section>
  );
}

function SearchBox({
  onSearch,
  onGoTo,
}: {
  onSearch: (q: string) => Promise<GeoMatch[]>;
  onGoTo: (p: MapPoint) => void;
}) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<GeoMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const m = await onSearch(q.trim());
      setMatches(m);
      if (m.length === 1) {
        onGoTo({ lon: m[0].lon, lat: m[0].lat, label: m[0].label });
        setMatches(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <form onSubmit={submit} className={styles.search}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a neighbourhood, address or station"
          aria-label="Search a place"
        />
        <button type="submit" className={styles.button} disabled={busy}>
          {busy ? "…" : "Go"}
        </button>
      </form>
      {matches && matches.length === 0 && <p className={styles.blurb}>Nothing found inside metro Atlanta.</p>}
      {matches && matches.length > 1 && (
        <ul className={styles.matches}>
          {matches.map((m) => (
            <li key={`${m.lat},${m.lon}`}>
              <button
                className={styles.linkButton}
                onClick={() => {
                  onGoTo({ lon: m.lon, lat: m.lat, label: m.label });
                  setMatches(null);
                }}
              >
                {m.label}
                {m.kind ? <span className={styles.muted}> · {m.kind}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoverageControls({
  domain,
  onDomain,
  minTph,
  onMinTph,
  coverage,
  onGoTo,
}: {
  domain: AccessDomain;
  onDomain: (d: AccessDomain) => void;
  minTph: number;
  onMinTph: (n: number) => void;
  coverage: CoverageResult | null;
  onGoTo: (p: MapPoint) => void;
}) {
  const share = coverage && coverage.totalPop > 0 ? (coverage.coveredPop / coverage.totalPop) * 100 : null;
  return (
    <div className={styles.subpanel}>
      <div className={styles.segmented}>
        {DOMAINS.map((d) => (
          <button key={d} className={domain === d ? styles.active : ""} onClick={() => onDomain(d)}>
            {DOMAIN_LABELS[d].replace(" stop", "")}
          </button>
        ))}
      </div>
      {domain === "transit" && (
        <label className={styles.range}>
          <span>
            Minimum service <strong>{minTph} trips/hr</strong>
          </span>
          <input type="range" min={0} max={20} step={1} value={minTph} onChange={(e) => onMinTph(Number(e.target.value))} />
        </label>
      )}
      {coverage && share != null && (
        <>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{share.toFixed(0)}%</span>
              <span className={styles.tileLabel}>residents covered</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{fmtCompact(coverage.totalPop - coverage.coveredPop)}</span>
              <span className={styles.tileLabel}>residents uncovered</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{coverage.clusters.length}</span>
              <span className={styles.tileLabel}>holes</span>
            </div>
          </div>
          {coverage.clusters.length > 0 && (
            <ul className={styles.holes}>
              {coverage.clusters.slice(0, 5).map((c) => (
                <li key={c.rank}>
                  <button
                    className={styles.linkButton}
                    onClick={() => onGoTo({ lon: c.lon, lat: c.lat, label: `Hole #${c.rank}` })}
                  >
                    <strong>#{c.rank}</strong> {fmtCompact(c.pop)} residents · {c.tracts.length} tract
                    {c.tracts.length === 1 ? "" : "s"} · {Object.keys(c.counties).join("/")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ScenarioPanel({
  scenario,
  placing,
  onPlacing,
  onRemove,
  onClear,
  onSuggest,
  suggesting,
}: {
  scenario: FacilitySpec[];
  placing: AccessDomain | null;
  onPlacing: (d: AccessDomain | null) => void;
  onRemove: (i: number) => void;
  onClear: () => void;
  onSuggest: (domain: AccessDomain, k: number) => Promise<void>;
  suggesting: boolean;
}) {
  const [suggestDomain, setSuggestDomain] = useState<AccessDomain>("clinic");
  const [k, setK] = useState(3);
  return (
    <section>
      <h2>Scenario</h2>
      <p className={styles.blurb}>
        Pick a type, then click the map to place a hypothetical facility. Or let the solver
        propose sites that cover the most uncovered need.
      </p>
      <div className={styles.chips}>
        {DOMAINS.map((d) => (
          <button
            key={d}
            className={`${styles.chip} ${placing === d ? styles.chipActive : ""}`}
            style={{ ["--chip" as string]: DOMAIN_COLORS[d] }}
            onClick={() => onPlacing(placing === d ? null : d)}
          >
            <span className={styles.dot} />
            {DOMAIN_LABELS[d]}
          </button>
        ))}
      </div>
      {placing && <p className={styles.blurb}>Click the map to add a {DOMAIN_LABELS[placing].toLowerCase()}. Click the chip again to stop.</p>}
      <div className={styles.suggest}>
        <select value={suggestDomain} onChange={(e) => setSuggestDomain(e.target.value as AccessDomain)} aria-label="Supply type to suggest">
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {DOMAIN_LABELS[d]}
            </option>
          ))}
        </select>
        <select value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="Number of sites">
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} site{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <button className={styles.button} onClick={() => onSuggest(suggestDomain, k)} disabled={suggesting}>
          {suggesting ? "Solving…" : "Suggest"}
        </button>
      </div>
      {scenario.length > 0 && (
        <>
          <ul className={styles.facilities}>
            {scenario.map((f, i) => (
              <li key={`${i}-${f.lat}-${f.lon}`}>
                <span className={styles.dot} style={{ background: DOMAIN_COLORS[f.domain] }} />
                <span className={styles.facilityLabel}>
                  {f.label ?? DOMAIN_LABELS[f.domain]}
                  <span className={styles.muted}>
                    {" "}
                    {f.lat.toFixed(3)}, {f.lon.toFixed(3)}
                  </span>
                </span>
                <button className={styles.iconButton} onClick={() => onRemove(i)} aria-label="Remove facility">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button className={styles.linkButton} onClick={onClear}>
            Clear scenario
          </button>
        </>
      )}
    </section>
  );
}

function Summary({
  analysis,
  scenario,
  loading,
}: {
  analysis: AnalysisResult | null;
  scenario: AnalysisResult | null;
  loading: boolean;
}) {
  if (!analysis) {
    return (
      <section>
        <h2>Summary</h2>
        <p className={styles.blurb}>{loading ? "Computing…" : "No results."}</p>
      </section>
    );
  }
  const shown = scenario ?? analysis;
  const s = shown.summary;
  const arrow = (a: number, b: number, digits = 0) =>
    scenario ? (
      <span className={styles.muted}>
        {" "}
        {a.toFixed(digits)} →
      </span>
    ) : null;
  return (
    <section aria-busy={loading}>
      <h2>
        Summary{scenario && <span className={styles.spinner}>scenario</span>}
        {loading && <span className={styles.spinner}>updating</span>}
      </h2>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileValue}>
            {arrow(analysis.summary.priorityCount, s.priorityCount)}
            {s.priorityCount}
          </span>
          <span className={styles.tileLabel}>priority tracts</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileValue}>
            {arrow(analysis.summary.hotspotCount, s.hotspotCount)}
            {s.hotspotCount}
          </span>
          <span className={styles.tileLabel}>in high-gap clusters</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileValue}>{shown.global.I.toFixed(2)}</span>
          <span className={styles.tileLabel}>
            Moran&apos;s I {shown.global.p < 0.01 ? "(p < 0.01)" : `(p = ${shown.global.p.toFixed(2)})`}
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
  baseline,
  scenarioActive,
  vintages,
  onClose,
}: {
  p: TractProps;
  r: TractResult | undefined;
  baseline: TractResult | undefined;
  scenarioActive: boolean;
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
            <span className={styles.tileLabel}>
              access · tertile {r.accessTertile}
              {scenarioActive && baseline ? ` · was ${fmtZ(baseline.access)}` : ""}
            </span>
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
