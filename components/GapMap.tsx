"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature } from "geojson";
import "leaflet/dist/leaflet.css";
import type { TractCollection } from "@/lib/data/load";
import type {
  AccessDomain,
  FacilitySpec,
  Poi,
  Stop,
  TractProps,
  TractResult,
} from "@/lib/analysis/types";
import {
  ACCESS_BINS,
  binColor,
  CLUSTER_COLORS,
  COVERAGE_COLORS,
  DELTA_BINS,
  DOMAIN_COLORS,
  DOMAIN_LABELS,
  GAP_BINS,
  GROWTH_BINS,
  NEED_BINS,
  NO_DATA_COLOR,
  fmtNum,
  fmtZ,
  type Mode,
} from "./scales";
import styles from "./GapMap.module.css";

export interface Overlays {
  rail: boolean;
  grocery: boolean;
  pharmacy: boolean;
  clinic: boolean;
}

export interface CoverageView {
  covered: Record<string, boolean>;
  clusterOf: Record<string, number>;
}

export interface MapPoint {
  lon: number;
  lat: number;
  label: string;
}

interface Props {
  tracts: TractCollection;
  results: Map<string, TractResult>;
  resultsVersion: number;
  deltaAccess: Map<string, number> | null;
  coverage: CoverageView | null;
  mode: Mode;
  showPriority: boolean;
  overlays: Overlays;
  pois: Poi[];
  railStations: Stop[];
  facilities: FacilitySpec[];
  placing: AccessDomain | null;
  searchMarker: MapPoint | null;
  flyTo: MapPoint | null;
  selected: string | null;
  onSelect: (geoid: string | null) => void;
  onPlace: (lon: number, lat: number) => void;
  onRemoveFacility: (index: number) => void;
}

const CENTER: [number, number] = [33.78, -84.38];
// Esri's gray canvas: muted enough for a choropleth, free without a key.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const TILES = {
  light: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  dark: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  labelsLight: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
  labelsDark: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
};
const ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeDark(onChange: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** The OS colour scheme is external state, so read it through a store subscription. */
function useDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  );
}

function fillFor(
  mode: Mode,
  r: TractResult | undefined,
  p: TractProps,
  delta: number | undefined,
  cov: CoverageView | null
): string {
  if (p.pop === 0) return NO_DATA_COLOR;
  if (mode === "coverage") {
    if (!cov) return NO_DATA_COLOR;
    if (cov.covered[p.geoid]) return COVERAGE_COLORS.covered;
    const rank = cov.clusterOf[p.geoid];
    return rank && rank <= 3 ? COVERAGE_COLORS.topCluster : COVERAGE_COLORS.uncovered;
  }
  if (mode === "delta") return binColor(delta, DELTA_BINS);
  if (!r) return NO_DATA_COLOR;
  switch (mode) {
    case "need":
      return binColor(r.need, NEED_BINS);
    case "access":
      return binColor(r.access, ACCESS_BINS);
    case "growth":
      return binColor(r.popGrowth, GROWTH_BINS);
    case "clusters":
      return CLUSTER_COLORS[r.lisa.cluster];
    default:
      return binColor(r.gap, GAP_BINS);
  }
}

function tooltipHtml(
  p: TractProps,
  r: TractResult | undefined,
  delta: number | undefined,
  cov: CoverageView | null
): string {
  const head = `<strong>${p.name}</strong><br/>${p.county} County · pop ${fmtNum(p.pop)}`;
  if (!r) return head;
  const extra: string[] = [];
  if (delta != null) extra.push(`Δ access ${fmtZ(delta)}`);
  if (cov) {
    extra.push(
      cov.covered[p.geoid]
        ? "covered"
        : `uncovered${cov.clusterOf[p.geoid] ? ` · hole #${cov.clusterOf[p.geoid]}` : ""}`
    );
  }
  return (
    `${head}<br/>` +
    `need ${fmtZ(r.need)} · access ${fmtZ(r.access)} · gap ${fmtZ(r.gap)}<br/>` +
    `class ${r.biClass}${r.biClass === "N3A1" ? " (priority)" : ""} · cluster ${r.lisa.cluster}` +
    (extra.length ? `<br/>${extra.join(" · ")}` : "")
  );
}

/** Map-level interactions that need the Leaflet instance. */
function MapEvents({
  placing,
  onPlace,
}: {
  placing: AccessDomain | null;
  onPlace: (lon: number, lat: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (placing) onPlace(e.latlng.lng, e.latlng.lat);
    },
  });
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = placing ? "crosshair" : "";
    return () => {
      el.style.cursor = "";
    };
  }, [map, placing]);
  return null;
}

function FlyTo({ target }: { target: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 12), { duration: 0.8 });
  }, [map, target]);
  return null;
}

export default function GapMap({
  tracts,
  results,
  resultsVersion,
  deltaAccess,
  coverage,
  mode,
  showPriority,
  overlays,
  pois,
  railStations,
  facilities,
  placing,
  searchMarker,
  flyTo,
  selected,
  onSelect,
  onPlace,
  onRemoveFacility,
}: Props) {
  const dark = useDarkMode();

  // GeoJSON layers are created once per key; recreate when styling inputs change.
  const layerKey = [
    mode,
    resultsVersion,
    showPriority ? 1 : 0,
    selected ?? "",
    coverage ? Object.keys(coverage.clusterOf).length : "c",
    deltaAccess ? "d" : "",
  ].join("-");

  const style = useMemo(
    () =>
      (feature?: Feature): PathOptions => {
        const p = feature?.properties as TractProps;
        const r = results.get(p.geoid);
        const priority = showPriority && mode !== "coverage" && r?.biClass === "N3A1";
        const isSelected = selected === p.geoid;
        return {
          fillColor: fillFor(mode, r, p, deltaAccess?.get(p.geoid), mode === "coverage" ? coverage : null),
          fillOpacity: 0.78,
          color: isSelected ? "#0b0b0b" : priority ? (dark ? "#ffffff" : "#0b0b0b") : dark ? "#2c2c2a" : "#ffffff",
          weight: isSelected ? 3 : priority ? 2 : 0.6,
          opacity: 1,
        };
      },
    [mode, results, showPriority, selected, dark, deltaAccess, coverage]
  );

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const p = feature.properties as TractProps;
    layer.bindTooltip(
      tooltipHtml(p, results.get(p.geoid), deltaAccess?.get(p.geoid), mode === "coverage" ? coverage : null),
      { sticky: true, className: styles.tooltip, direction: "top", offset: [0, -8] }
    );
    layer.on({
      click: () => {
        if (placing) return; // the map click handler places a facility instead
        onSelect(selected === p.geoid ? null : p.geoid);
      },
    });
  };

  const visiblePois = pois.filter((poi) => overlays[poi.category]);
  const stroke = dark ? "#1a1a19" : "#ffffff";
  const ink = dark ? "#ffffff" : "#0b0b0b";

  return (
    <MapContainer center={CENTER} zoom={10} minZoom={9} maxZoom={16} className={styles.map}>
      <MapEvents placing={placing} onPlace={onPlace} />
      <FlyTo target={flyTo} />
      <TileLayer key={dark ? "dark" : "light"} url={dark ? TILES.dark : TILES.light} attribution={ATTRIBUTION} />
      <GeoJSON key={layerKey} data={tracts} style={style} onEachFeature={onEachFeature} />
      <TileLayer
        key={dark ? "labels-dark" : "labels-light"}
        url={dark ? TILES.labelsDark : TILES.labelsLight}
        pane="markerPane"
        opacity={0.9}
      />
      {visiblePois.map((poi) => (
        <CircleMarker
          key={poi.id}
          center={[poi.lat, poi.lon]}
          radius={4}
          pathOptions={{ color: stroke, weight: 1, fillColor: DOMAIN_COLORS[poi.category], fillOpacity: 0.95 }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            {poi.name} · {poi.category}
          </Tooltip>
        </CircleMarker>
      ))}
      {overlays.rail &&
        railStations.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={6}
            pathOptions={{ color: ink, weight: 2, fillColor: stroke, fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {s.name} · {s.tph.toFixed(0)} trips/hr
            </Tooltip>
          </CircleMarker>
        ))}
      {facilities.map((f, i) => (
        <CircleMarker
          key={`f-${i}-${f.lat}-${f.lon}`}
          center={[f.lat, f.lon]}
          radius={9}
          pathOptions={{ color: ink, weight: 2, fillColor: DOMAIN_COLORS[f.domain], fillOpacity: 1, dashArray: "3 3" }}
          eventHandlers={{ click: () => onRemoveFacility(i) }}
        >
          <Tooltip direction="top" offset={[0, -9]}>
            {f.label ?? `Proposed ${DOMAIN_LABELS[f.domain].toLowerCase()}`} · click to remove
          </Tooltip>
        </CircleMarker>
      ))}
      {searchMarker && (
        <CircleMarker
          center={[searchMarker.lat, searchMarker.lon]}
          radius={9}
          pathOptions={{ color: ink, weight: 2, fillColor: "#eda100", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -9]} permanent>
            {searchMarker.label}
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
