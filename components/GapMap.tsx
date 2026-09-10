"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature } from "geojson";
import "leaflet/dist/leaflet.css";
import type { TractCollection } from "@/lib/data/load";
import type { Poi, Stop, TractProps, TractResult } from "@/lib/analysis/types";
import {
  ACCESS_BINS,
  binColor,
  CLUSTER_COLORS,
  GAP_BINS,
  GROWTH_BINS,
  NEED_BINS,
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

interface Props {
  tracts: TractCollection;
  results: Map<string, TractResult>;
  resultsVersion: number;
  mode: Mode;
  showPriority: boolean;
  overlays: Overlays;
  pois: Poi[];
  railStations: Stop[];
  selected: string | null;
  onSelect: (geoid: string | null) => void;
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

const POI_COLOR: Record<Poi["category"], string> = {
  grocery: "#008300",
  pharmacy: "#4a3aa7",
  clinic: "#e87ba4",
};

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

function fillFor(mode: Mode, r: TractResult | undefined, p: TractProps): string {
  if (!r || p.pop === 0) return "#c3c2b7";
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

function tooltipHtml(p: TractProps, r: TractResult | undefined): string {
  const head = `<strong>${p.name}</strong><br/>${p.county} County · pop ${fmtNum(p.pop)}`;
  if (!r) return head;
  return (
    `${head}<br/>` +
    `need ${fmtZ(r.need)} · access ${fmtZ(r.access)} · gap ${fmtZ(r.gap)}<br/>` +
    `class ${r.biClass}${r.biClass === "N3A1" ? " (priority)" : ""} · cluster ${r.lisa.cluster}`
  );
}

export default function GapMap({
  tracts,
  results,
  resultsVersion,
  mode,
  showPriority,
  overlays,
  pois,
  railStations,
  selected,
  onSelect,
}: Props) {
  const dark = useDarkMode();

  // GeoJSON layers are created once per key; recreate when styling inputs change.
  const layerKey = `${mode}-${resultsVersion}-${showPriority ? 1 : 0}-${selected ?? ""}`;

  const style = useMemo(
    () =>
      (feature?: Feature): PathOptions => {
        const p = feature?.properties as TractProps;
        const r = results.get(p.geoid);
        const priority = showPriority && r?.biClass === "N3A1";
        const isSelected = selected === p.geoid;
        return {
          fillColor: fillFor(mode, r, p),
          fillOpacity: 0.78,
          color: isSelected ? "#0b0b0b" : priority ? (dark ? "#ffffff" : "#0b0b0b") : dark ? "#2c2c2a" : "#ffffff",
          weight: isSelected ? 3 : priority ? 2 : 0.6,
          opacity: 1,
        };
      },
    [mode, results, showPriority, selected, dark]
  );

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const p = feature.properties as TractProps;
    layer.bindTooltip(tooltipHtml(p, results.get(p.geoid)), {
      sticky: true,
      className: styles.tooltip,
      direction: "top",
      offset: [0, -8],
    });
    layer.on({
      click: () => onSelect(selected === p.geoid ? null : p.geoid),
    });
  };

  const visiblePois = pois.filter((poi) => overlays[poi.category]);

  return (
    <MapContainer
      center={CENTER}
      zoom={10}
      minZoom={9}
      maxZoom={16}
      className={styles.map}
      preferCanvas
    >
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
          pathOptions={{
            color: dark ? "#1a1a19" : "#ffffff",
            weight: 1,
            fillColor: POI_COLOR[poi.category],
            fillOpacity: 0.95,
          }}
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
            pathOptions={{
              color: dark ? "#ffffff" : "#0b0b0b",
              weight: 2,
              fillColor: dark ? "#1a1a19" : "#ffffff",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {s.name} · {s.tph.toFixed(0)} trips/hr
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
