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
  accessRank,
  accessWords,
  changeWords,
  clusterSentence,
  clusteringWords,
  flag,
  needRank,
  needWords,
  pct,
  placeLabel,
  verdict,
} from "@/lib/analysis/interpret";
import { ACCESS_DOMAINS } from "@/lib/analysis/types";
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

export interface WithinReach {
  radiusKm: number;
  grocery: number;
  pharmacy: number;
  clinic: number;
  /** Combined weekday transit trips per hour at stops within the radius. */
  tph: number;
  rail: string[];
}

export interface SelectedTract {
  props: TractProps;
  result: TractResult | undefined;
  baseline: TractResult | undefined;
  withinReach: WithinReach;
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
  scenarioAnalysis: AnalysisResult | null;
  /** Residents living in priority tracts under the shown results. */
  priorityPop: number;
  /** Residents whose access improved under the scenario. */
  improvedPop: number;
  loading: boolean;
  selected: SelectedTract | null;
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

const WEIGHTS: Array<{ key: keyof Params; label: string; hint: string }> = [
  { key: "wPoverty", label: "Poverty", hint: "share of people below the poverty line" },
  { key: "wNoVehicle", label: "No car", hint: "households without a vehicle" },
  { key: "wSeniors", label: "Seniors", hint: "share aged 65 and over" },
  { key: "wChildren", label: "Children", hint: "share under 18" },
  { key: "wGrowth", label: "Growth", hint: "population change since 2019" },
];

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
          Which neighbourhoods need groceries, pharmacies, clinics and transit the most, and how
          far they are from having them. Fulton, DeKalb and Clayton counties, by census tract.
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
          sel={selected}
          scenarioActive={scenarioActive}
          vintages={analysis?.dataVintages}
          onClose={props.onClearSelection}
        />
      ) : (
        <Summary
          analysis={analysis}
          scenario={scenarioAnalysis}
          priorityPop={props.priorityPop}
          improvedPop={props.improvedPop}
          loading={loading}
        />
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
        <h2>How far people can travel</h2>
        <label className={styles.range}>
          <span>
            Reach <strong>{params.radiusKm.toFixed(1)} km</strong>
            <em>{(params.radiusKm * 0.621371).toFixed(1)} mi</em>
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
        <p className={styles.blurb}>
          About 0.8 km is a ten-minute walk; 1.6 km is a mile; 3 km or more assumes a car or bus.
        </p>
        <div className={styles.segmented}>
          {(["gaussian", "binary"] as const).map((d) => (
            <button
              key={d}
              className={params.decay === d ? styles.active : ""}
              onClick={() => onParams({ ...params, decay: d })}
            >
              {d === "gaussian" ? "Closer counts more" : "Everything in reach counts equally"}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>What counts as need</h2>
        {WEIGHTS.map(({ key, label, hint }) => (
          <label key={key} className={styles.range} title={hint}>
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
        <p className={styles.blurb}>Higher weight means that factor counts for more of a tract&apos;s need score.</p>
      </section>

      <section>
        <h2>Show on the map</h2>
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
          A screening tool, not a recommendation. Distances are straight-line. Data: ACS{" "}
          {analysis?.dataVintages.acs ?? "…"} and {analysis?.dataVintages.acsPrior ?? "…"} 5-year
          estimates, OpenStreetMap, MARTA GTFS.{" "}
          <a href="https://github.com/Jaysunnn8solutions/atl-mcp">Source and method</a>. The same
          analysis is available to AI assistants at <code>/mcp</code>.
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
        The settings block carries the reach, weights and any scenario facilities, so answers in
        chat match the map.
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
            Only count stops with at least <strong>{minTph} trips/hr</strong>
          </span>
          <input type="range" min={0} max={20} step={1} value={minTph} onChange={(e) => onMinTph(Number(e.target.value))} />
        </label>
      )}
      {coverage && share != null && (
        <>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{share.toFixed(0)}%</span>
              <span className={styles.tileLabel}>of residents have one in reach</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{fmtCompact(coverage.totalPop - coverage.coveredPop)}</span>
              <span className={styles.tileLabel}>residents have none</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{coverage.clusters.length}</span>
              <span className={styles.tileLabel}>separate holes</span>
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
      <h2>Try adding something</h2>
      <p className={styles.blurb}>
        Pick a type, then click the map to place a new facility. Or let the solver propose
        locations that reach the most people who have none today.
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
  priorityPop,
  improvedPop,
  loading,
}: {
  analysis: AnalysisResult | null;
  scenario: AnalysisResult | null;
  priorityPop: number;
  improvedPop: number;
  loading: boolean;
}) {
  if (!analysis) {
    return (
      <section>
        <h2>The picture</h2>
        <p className={styles.blurb}>{loading ? "Computing…" : "No results."}</p>
      </section>
    );
  }
  const shown = scenario ?? analysis;
  const r = shown.params.radiusKm;
  return (
    <section aria-busy={loading}>
      <h2>
        {scenario ? "With your scenario" : "The picture"}
        {loading && <span className={styles.spinner}>updating</span>}
      </h2>
      {scenario ? (
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtCompact(improvedPop)}</span>
            <span className={styles.tileLabel}>residents gain access</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>
              {analysis.summary.priorityCount} → {shown.summary.priorityCount}
            </span>
            <span className={styles.tileLabel}>priority tracts</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtCompact(priorityPop)}</span>
            <span className={styles.tileLabel}>residents still in them</span>
          </div>
        </div>
      ) : (
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{shown.summary.priorityCount}</span>
            <span className={styles.tileLabel}>priority tracts</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{fmtCompact(priorityPop)}</span>
            <span className={styles.tileLabel}>residents in them</span>
          </div>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{shown.summary.hotspotCount}</span>
            <span className={styles.tileLabel}>tracts in problem areas</span>
          </div>
        </div>
      )}
      <p className={styles.blurb}>
        A priority tract is in the neediest third and the worst-served third at once.{" "}
        {clusteringWords(shown.global.I, shown.global.p)}
      </p>

      <h3>Residents with at least one within {r.toFixed(1)} km</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Type</th>
            {scenario && <th>Before</th>}
            <th>{scenario ? "After" : "Share"}</th>
          </tr>
        </thead>
        <tbody>
          {ACCESS_DOMAINS.map((d) => (
            <tr key={d}>
              <td>{DOMAIN_LABELS[d].replace(" stop", "")}</td>
              {scenario && <td>{pct(analysis.summary.coverageShare[d])}</td>}
              <td>
                <strong>{pct(shown.summary.coverageShare[d])}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {scenario && (
        <p className={styles.blurb}>
          Judge a scenario by these shares and by residents gaining access. The priority count
          is relative, so it moves less: lifting the worst tracts moves the cut line too.
        </p>
      )}

      <h3>By county</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>County</th>
            <th>Tracts</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {shown.summary.byCounty.map((c) => (
            <tr key={c.county}>
              <td>{c.county}</td>
              <td>{c.tracts}</td>
              <td>{c.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.blurb}>Click a tract for its story.</p>
    </section>
  );
}

function change(cur: number | null, prior: number | null): string {
  if (cur == null || prior == null || prior === 0) return "";
  const pctChange = ((cur - prior) / prior) * 100;
  return ` (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%)`;
}

function TractDetail({
  sel,
  scenarioActive,
  vintages,
  onClose,
}: {
  sel: SelectedTract;
  scenarioActive: boolean;
  vintages: AnalysisResult["dataVintages"] | undefined;
  onClose: () => void;
}) {
  const { props: p, result: r, baseline: b, withinReach: w } = sel;
  const f = r ? flag(r) : null;
  const flagClass =
    f === "Priority" ? styles.flagPriority : f === "Watch" ? styles.flagWatch : styles.flagNone;
  return (
    <section className={styles.detail}>
      <div className={styles.detailHead}>
        <h2>{p.name}</h2>
        <button onClick={onClose} aria-label="Close tract detail">
          ×
        </button>
      </div>
      <p className={styles.where}>
        {placeLabel(p.place, p.county)} · {fmtNum(p.pop)} residents
        {p.nearestRail && (
          <>
            <br />
            {p.nearestRail.km} km to {p.nearestRail.name} station
          </>
        )}
      </p>

      {r && (
        <>
          <p className={styles.verdict}>
            <span className={`${styles.flag} ${flagClass}`}>{f}</span> {verdict(r)}
          </p>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{needWords(r.needPct).replace(" need", "")}</span>
              <span className={styles.tileLabel}>need · {needRank(r.needPct)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>{accessWords(r.accessPct).replace(" access", "")}</span>
              <span className={styles.tileLabel}>access · {accessRank(r.accessPct)}</span>
            </div>
          </div>
          {scenarioActive && b && (
            <p className={styles.blurb}>
              With your scenario: {changeWords(r.access - b.access)}. Before it, {accessRank(b.accessPct)}
              {flag(b) !== f ? `; flag changed from ${flag(b)} to ${f}` : ""}.
            </p>
          )}
          <p className={styles.blurb}>{clusterSentence(r.lisa.cluster)}</p>
        </>
      )}

      <h3>Within {w.radiusKm.toFixed(1)} km{scenarioActive ? " (including your scenario)" : ""}</h3>
      <dl className={styles.facts}>
        <dt>Groceries</dt>
        <dd>{w.grocery}</dd>
        <dt>Pharmacies</dt>
        <dd>{w.pharmacy}</dd>
        <dt>Clinics and hospitals</dt>
        <dd>{w.clinic}</dd>
        <dt>Bus and rail trips per hour</dt>
        <dd>{Math.round(w.tph)}</dd>
        <dt>Rail stations</dt>
        <dd>{w.rail.length ? w.rail.map((s) => s.replace(/ STATION$/i, "")).join(", ") : "none"}</dd>
      </dl>

      <h3>People and money</h3>
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
        <dt>Below poverty line</dt>
        <dd>{fmtPct(p.povertyRate)}</dd>
        <dt>Households with no car</dt>
        <dd>{fmtPct(p.noVehicleRate)}</dd>
        <dt>Age 65 and over</dt>
        <dd>{fmtPct(p.seniorShare)}</dd>
        <dt>Under 18</dt>
        <dd>{fmtPct(p.childShare)}</dd>
        <dt>Vacant homes</dt>
        <dd>{fmtPct(p.vacancyRate)}</dd>
      </dl>
      <p className={styles.blurb}>
        Changes in brackets compare {vintages?.acsPrior ?? "2019"} with {vintages?.acs ?? "2024"}.
      </p>

      {r && (
        <details className={styles.technical}>
          <summary>Technical detail</summary>
          <dl className={styles.facts}>
            <dt>Need index</dt>
            <dd>{fmtZ(r.need)}</dd>
            <dt>Access index</dt>
            <dd>
              {fmtZ(r.access)}
              {scenarioActive && b ? ` (was ${fmtZ(b.access)})` : ""}
            </dd>
            <dt>Gap</dt>
            <dd>{fmtZ(r.gap)}</dd>
            <dt>Class</dt>
            <dd>{r.biClass}</dd>
            <dt>Local Moran&apos;s I</dt>
            <dd>
              {r.lisa.I.toFixed(2)} (p {r.lisa.p.toFixed(3)}, {r.lisa.cluster})
            </dd>
            {(Object.entries(r.accessBy) as Array<[string, number]>).map(([k, v]) => (
              <div key={k} className={styles.factRow}>
                <dt>2SFCA {k} per 1,000</dt>
                <dd>{v.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.blurb}>
            Indexes are z-scores across all 600 tracts: 0 is average, +1 well above, −1 well below.
            GEOID {p.geoid}, {p.landKm2} km².
          </p>
        </details>
      )}
    </section>
  );
}
