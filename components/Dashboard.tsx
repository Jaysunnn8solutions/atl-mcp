"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccessDomain,
  AnalysisResult,
  FacilitySpec,
  Poi,
  Stop,
  TractResult,
} from "@/lib/analysis/types";
import type { CoverageResult } from "@/lib/analysis/coverage";
import type { SiteSelectionResult } from "@/lib/analysis/site-selection";
import type { TractCollection } from "@/lib/data/load";
import type { GeoMatch } from "@/lib/geocode";
import GapMap, { type MapPoint, type Overlays } from "./GapMap";
import { Sidebar, type Params } from "./Sidebar";
import { download, toCsv, toGeoJson } from "./exportData";
import type { Mode } from "./scales";
import { DOMAIN_LABELS } from "./scales";
import { currentLink, readHash, writeHash } from "./urlState";
import { viewToClipboardText } from "@/lib/view-state";
import styles from "./Dashboard.module.css";

function queryFor(p: Params): string {
  const q = new URLSearchParams();
  q.set("radiusKm", p.radiusKm.toFixed(2));
  q.set("decay", p.decay);
  q.set("wPoverty", String(p.wPoverty));
  q.set("wNoVehicle", String(p.wNoVehicle));
  q.set("wSeniors", String(p.wSeniors));
  q.set("wChildren", String(p.wChildren));
  q.set("wGrowth", String(p.wGrowth));
  return q.toString();
}

function bodyFor(p: Params, scenario: FacilitySpec[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    radiusKm: p.radiusKm,
    decay: p.decay,
    wPoverty: p.wPoverty,
    wNoVehicle: p.wNoVehicle,
    wSeniors: p.wSeniors,
    wChildren: p.wChildren,
    wGrowth: p.wGrowth,
    add: scenario,
    remove: [],
    ...extra,
  });
}

/** Debounced fetch keyed on a serialized input; ignores stale responses. */
function useDebouncedFetch<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  delay: number,
  onDone: (value: T | null, error: string | null) => void
) {
  const latest = useRef(0);
  useEffect(() => {
    if (key === null) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetcher(controller.signal)
        .then((v) => {
          if (id === latest.current) onDone(v, null);
        })
        .catch((e: unknown) => {
          if (id === latest.current && !(e instanceof DOMException && e.name === "AbortError")) {
            onDone(null, e instanceof Error ? e.message : String(e));
          }
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // fetcher/onDone are stable callbacks; key captures every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export function Dashboard() {
  // View state, seeded from the URL hash (client-only component).
  const [initial] = useState(readHash);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [params, setParams] = useState<Params>(initial.params);
  const [showPriority, setShowPriority] = useState(initial.showPriority);
  const [overlays, setOverlays] = useState<Overlays>(initial.overlays);
  const [selected, setSelected] = useState<string | null>(initial.selected);
  const [scenario, setScenario] = useState<FacilitySpec[]>(initial.scenario);
  const [coverageDomain, setCoverageDomain] = useState<AccessDomain>(initial.coverageDomain);
  const [minTph, setMinTph] = useState(initial.minTph);
  const [placing, setPlacing] = useState<AccessDomain | null>(null);
  const [searchMarker, setSearchMarker] = useState<MapPoint | null>(null);
  const [flyTo, setFlyTo] = useState<MapPoint | null>(null);

  // Data.
  const [tracts, setTracts] = useState<TractCollection | null>(null);
  const [supply, setSupply] = useState<{ pois: Poi[]; railStations: Stop[] }>({ pois: [], railStations: [] });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [scenarioAnalysis, setScenarioAnalysis] = useState<AnalysisResult | null>(null);
  const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenarioActive = scenario.length > 0;

  // Keep the URL in sync with the view.
  useEffect(() => {
    writeHash({ mode, params, showPriority, overlays, selected, scenario, coverageDomain, minTph });
  }, [mode, params, showPriority, overlays, selected, scenario, coverageDomain, minTph]);

  // Static inputs, fetched once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson<TractCollection>("/api/tracts"),
      getJson<{ pois: Poi[]; railStations: Stop[] }>("/api/pois"),
    ])
      .then(([t, s]) => {
        if (cancelled) return;
        setTracts(t);
        setSupply({ pois: s.pois, railStations: s.railStations });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Baseline analysis.
  const baselineKey = queryFor(params);
  useDebouncedFetch(
    baselineKey,
    useCallback((signal: AbortSignal) => {
      setLoading(true);
      return getJson<AnalysisResult>(`/api/analysis?${baselineKey}`, { signal });
    }, [baselineKey]),
    250,
    useCallback((v: AnalysisResult | null, err: string | null) => {
      if (v) {
        setAnalysis(v);
        setVersion((n) => n + 1);
        setError(null);
      } else if (err) {
        setError(err);
      }
      setLoading(false);
    }, [])
  );

  // Scenario analysis, only when facilities are placed.
  const scenarioKey = scenarioActive ? bodyFor(params, scenario) : null;
  useDebouncedFetch(
    scenarioKey,
    useCallback(
      (signal: AbortSignal) =>
        getJson<AnalysisResult>("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: scenarioKey ?? "{}",
          signal,
        }),
      [scenarioKey]
    ),
    250,
    useCallback((v: AnalysisResult | null, err: string | null) => {
      if (v) {
        setScenarioAnalysis(v);
        setVersion((n) => n + 1);
      } else if (err) {
        setError(err);
      }
    }, [])
  );
  /** Replace the scenario; leaving the delta layer when nothing is left to compare. */
  const updateScenario = useCallback(
    (next: FacilitySpec[] | ((s: FacilitySpec[]) => FacilitySpec[])) => {
      setScenario((s) => {
        const value = typeof next === "function" ? next(s) : next;
        if (value.length === 0) setMode((m) => (m === "delta" ? "gap" : m));
        return value;
      });
    },
    []
  );

  // Coverage, only in coverage mode.
  const coverageKey =
    mode === "coverage"
      ? bodyFor(params, scenario, { domain: coverageDomain, minTph: coverageDomain === "transit" ? minTph : undefined })
      : null;
  useDebouncedFetch(
    coverageKey,
    useCallback(
      (signal: AbortSignal) =>
        getJson<CoverageResult>("/api/coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: coverageKey ?? "{}",
          signal,
        }),
      [coverageKey]
    ),
    200,
    useCallback((v: CoverageResult | null, err: string | null) => {
      if (v) {
        setCoverageResult(v);
        setVersion((n) => n + 1);
      } else if (err) {
        setError(err);
      }
    }, [])
  );

  // Derived maps for the map layer. A stale scenario result is ignored once
  // the scenario is cleared, so no effect is needed to reset it.
  const activeScenario = scenarioActive ? scenarioAnalysis : null;
  const shown = activeScenario ?? analysis;
  const results = useMemo(() => {
    const m = new Map<string, TractResult>();
    shown?.tracts.forEach((t) => m.set(t.geoid, t));
    return m;
  }, [shown]);
  const baselineResults = useMemo(() => {
    const m = new Map<string, TractResult>();
    analysis?.tracts.forEach((t) => m.set(t.geoid, t));
    return m;
  }, [analysis]);
  const deltaAccess = useMemo(() => {
    if (!activeScenario || !analysis) return null;
    const m = new Map<string, number>();
    activeScenario.tracts.forEach((t) => {
      const b = baselineResults.get(t.geoid);
      if (b) m.set(t.geoid, t.access - b.access);
    });
    return m;
  }, [activeScenario, analysis, baselineResults]);

  const selectedInfo = useMemo(() => {
    if (!selected || !tracts) return null;
    const f = tracts.features.find((x) => x.properties.geoid === selected);
    if (!f) return null;
    return { props: f.properties, result: results.get(selected), baseline: baselineResults.get(selected) };
  }, [selected, tracts, results, baselineResults]);

  // Actions.
  const onSearch = useCallback(async (q: string) => {
    const r = await getJson<{ matches: GeoMatch[] }>(`/api/geocode?q=${encodeURIComponent(q)}`);
    return r.matches;
  }, []);
  const onGoTo = useCallback((p: MapPoint) => {
    setSearchMarker(p);
    setFlyTo({ ...p });
  }, []);
  const onPlace = useCallback(
    (lon: number, lat: number) => {
      if (!placing) return;
      updateScenario((s) => [...s, { domain: placing, lon: round5(lon), lat: round5(lat) }]);
    },
    [placing, updateScenario]
  );
  const onSuggestSites = useCallback(
    async (domain: AccessDomain, k: number) => {
      setSuggesting(true);
      try {
        const r = await getJson<SiteSelectionResult>("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyFor(params, scenario, { domain, k, weighting: "need" }),
        });
        if (r.sites.length === 0) {
          setError(`Everything is already covered for ${DOMAIN_LABELS[domain].toLowerCase()} at this radius.`);
          return;
        }
        updateScenario((s) => [
          ...s,
          ...r.sites.map((site) => ({
            domain,
            lon: site.lon,
            lat: site.lat,
            label: `Proposed near ${site.name}`,
          })),
        ]);
        setFlyTo({ lon: r.sites[0].lon, lat: r.sites[0].lat, label: r.sites[0].name });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSuggesting(false);
      }
    },
    [params, scenario, updateScenario]
  );
  const onCopy = useCallback(
    async (kind: "link" | "settings") => {
      const view = { mode, params, showPriority, overlays, selected, scenario, coverageDomain, minTph };
      const link = currentLink(view);
      const text = kind === "link" ? link : viewToClipboardText(view, link);
      try {
        await navigator.clipboard.writeText(text);
        return { text, copied: true };
      } catch {
        return { text, copied: false };
      }
    },
    [mode, params, showPriority, overlays, selected, scenario, coverageDomain, minTph]
  );
  const onExport = useCallback(
    (kind: "csv" | "geojson") => {
      if (!tracts || results.size === 0) return;
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "csv") download(`atl-gap-${stamp}.csv`, toCsv(tracts, results), "text/csv");
      else download(`atl-gap-${stamp}.geojson`, toGeoJson(tracts, results), "application/geo+json");
    },
    [tracts, results]
  );

  return (
    <div className={styles.app}>
      <Sidebar
        mode={mode}
        onMode={setMode}
        params={params}
        onParams={setParams}
        showPriority={showPriority}
        onShowPriority={setShowPriority}
        overlays={overlays}
        onOverlays={setOverlays}
        analysis={analysis}
        scenarioAnalysis={activeScenario}
        loading={loading}
        selected={selectedInfo}
        onClearSelection={() => setSelected(null)}
        onSearch={onSearch}
        onGoTo={onGoTo}
        coverageDomain={coverageDomain}
        onCoverageDomain={setCoverageDomain}
        minTph={minTph}
        onMinTph={setMinTph}
        coverage={mode === "coverage" ? coverageResult : null}
        scenario={scenario}
        placing={placing}
        onPlacing={setPlacing}
        onRemoveFacility={(i) => updateScenario((s) => s.filter((_, j) => j !== i))}
        onClearScenario={() => {
          updateScenario([]);
          setPlacing(null);
        }}
        onSuggestSites={onSuggestSites}
        suggesting={suggesting}
        onExport={onExport}
        onCopy={onCopy}
      />
      <main className={styles.mapPane}>
        {error && (
          <div className={styles.error} role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {tracts ? (
          <GapMap
            tracts={tracts}
            results={results}
            resultsVersion={version}
            deltaAccess={deltaAccess}
            coverage={mode === "coverage" ? coverageResult : null}
            mode={mode}
            showPriority={showPriority}
            overlays={overlays}
            pois={supply.pois}
            railStations={supply.railStations}
            facilities={scenario}
            placing={placing}
            searchMarker={searchMarker}
            flyTo={flyTo}
            selected={selected}
            onSelect={setSelected}
            onPlace={onPlace}
            onRemoveFacility={(i) => updateScenario((s) => s.filter((_, j) => j !== i))}
          />
        ) : (
          <div className={styles.mapLoading}>Loading tracts…</div>
        )}
      </main>
    </div>
  );
}

function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}
