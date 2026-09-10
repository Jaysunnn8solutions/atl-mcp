"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, Poi, Stop, TractResult } from "@/lib/analysis/types";
import type { TractCollection } from "@/lib/data/load";
import type { Overlays } from "./GapMap";
import { Sidebar, type Params } from "./Sidebar";
import type { Mode } from "./scales";
import styles from "./Dashboard.module.css";

// Leaflet touches `window` at import time, so the map is client-only.
const GapMap = dynamic(() => import("./GapMap"), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Loading map…</div>,
});

const DEFAULT_PARAMS: Params = {
  radiusKm: 1.6,
  decay: "gaussian",
  wPoverty: 1,
  wNoVehicle: 1,
  wSeniors: 0.5,
  wChildren: 0.5,
  wGrowth: 1,
};

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

export function Dashboard() {
  const [tracts, setTracts] = useState<TractCollection | null>(null);
  const [supply, setSupply] = useState<{ pois: Poi[]; railStations: Stop[] }>({
    pois: [],
    railStations: [],
  });
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("gap");
  const [showPriority, setShowPriority] = useState(true);
  const [overlays, setOverlays] = useState<Overlays>({
    rail: true,
    grocery: false,
    pharmacy: false,
    clinic: false,
  });
  const [selected, setSelected] = useState<string | null>(null);

  // Static inputs, fetched once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/tracts").then((r) => r.json() as Promise<TractCollection>),
      fetch("/api/pois").then(
        (r) => r.json() as Promise<{ pois: Poi[]; railStations: Stop[] }>
      ),
    ])
      .then(([t, s]) => {
        if (cancelled) return;
        setTracts(t);
        setSupply({ pois: s.pois, railStations: s.railStations });
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Analysis, refetched when parameters settle.
  const latest = useRef(0);
  useEffect(() => {
    const id = ++latest.current;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/analysis?${queryFor(params)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`analysis failed: HTTP ${r.status}`);
          return r.json() as Promise<AnalysisResult>;
        })
        .then((a) => {
          if (id !== latest.current) return;
          setAnalysis(a);
          setVersion((v) => v + 1);
          setLoading(false);
          setError(null);
        })
        .catch((e) => {
          if (id !== latest.current) return;
          setError(String(e));
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [params]);

  const results = useMemo(() => {
    const m = new Map<string, TractResult>();
    analysis?.tracts.forEach((t) => m.set(t.geoid, t));
    return m;
  }, [analysis]);

  const selectedInfo = useMemo(() => {
    if (!selected || !tracts) return null;
    const f = tracts.features.find((x) => x.properties.geoid === selected);
    if (!f) return null;
    return { props: f.properties, result: results.get(selected) };
  }, [selected, tracts, results]);

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
        loading={loading}
        selected={selectedInfo}
        onClearSelection={() => setSelected(null)}
      />
      <main className={styles.mapPane}>
        {error && <div className={styles.error}>{error}</div>}
        {tracts ? (
          <GapMap
            tracts={tracts}
            results={results}
            resultsVersion={version}
            mode={mode}
            showPriority={showPriority}
            overlays={overlays}
            pois={supply.pois}
            railStations={supply.railStations}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <div className={styles.mapLoading}>Loading tracts…</div>
        )}
      </main>
    </div>
  );
}
