/**
 * Stage 4: MARTA stops with scheduled weekday service frequency.
 *
 * "Near a station" is a weak measure of transit access: a stop with two
 * buses an hour is not the same as one with twelve. GTFS stop_times gives
 * every scheduled arrival, so each stop gets trips per hour on a typical
 * weekday. Rail platforms are rolled up into their parent station.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import type { Stop } from "../lib/analysis/types";
import { DATA_DIR, MARTA_GTFS_URL } from "./config";
import { parseCsvObjects } from "./lib/csv";
import { fetchCached, log } from "./lib/http";

/** Service hours over which trips are averaged (05:00–23:00). */
const SERVICE_HOURS = 18;

function isTuesday(yyyymmdd: string): boolean {
  const d = new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8))
  );
  return d.getDay() === 2;
}

/**
 * Service ids that run on a typical weekday. Prefer calendar.txt rows that
 * run on Tuesdays in the feed's latest window. Some feeds leave calendar.txt
 * all zeros and define service entirely through calendar_dates.txt; in that
 * case take the Tuesday with the most service additions.
 */
function pickWeekdayServices(
  calendar: Array<Record<string, string>>,
  calendarDates: Array<Record<string, string>>
): Set<string> {
  const byEnd = [...calendar].sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
  const latestEnd = byEnd[0]?.end_date ?? "";
  const ids = new Set<string>();
  for (const c of calendar) {
    if (c.tuesday === "1" && c.end_date === latestEnd) ids.add(c.service_id);
  }
  if (ids.size === 0) {
    for (const c of calendar) if (c.tuesday === "1") ids.add(c.service_id);
  }
  if (ids.size > 0) return ids;

  const byDate = new Map<string, Set<string>>();
  for (const d of calendarDates) {
    if (d.exception_type !== "1" || !isTuesday(d.date)) continue;
    const set = byDate.get(d.date) ?? new Set<string>();
    set.add(d.service_id);
    byDate.set(d.date, set);
  }
  let best: Set<string> = new Set();
  for (const set of byDate.values()) if (set.size > best.size) best = set;
  log(`calendar.txt had no weekday service; using calendar_dates with ${best.size} services`);
  return best;
}

export async function buildTransit(): Promise<Stop[]> {
  const zip = await fetchCached(MARTA_GTFS_URL, "marta-gtfs.zip");
  const files = unzipSync(new Uint8Array(zip));
  const read = (name: string) => {
    const f = files[name];
    if (!f) throw new Error(`GTFS feed is missing ${name}`);
    return Buffer.from(f).toString("utf8");
  };

  const stops = parseCsvObjects(read("stops.txt"));
  const routes = parseCsvObjects(read("routes.txt"));
  const trips = parseCsvObjects(read("trips.txt"));
  const calendar = files["calendar.txt"] ? parseCsvObjects(read("calendar.txt")) : [];
  const calendarDates = files["calendar_dates.txt"]
    ? parseCsvObjects(read("calendar_dates.txt"))
    : [];

  const railRoutes = new Set(
    routes.filter((r) => r.route_type === "1" || r.route_type === "0").map((r) => r.route_id)
  );
  const weekdayServices = pickWeekdayServices(calendar, calendarDates);
  const weekdayTrips = new Map<string, { rail: boolean }>();
  for (const t of trips) {
    if (weekdayServices.has(t.service_id)) {
      weekdayTrips.set(t.trip_id, { rail: railRoutes.has(t.route_id) });
    }
  }
  log(`GTFS: ${stops.length} stops, ${weekdayTrips.size} weekday trips, ${railRoutes.size} rail routes`);

  // stop_times is the big one (millions of rows). Stream it line by line
  // rather than materializing objects for every row.
  const stopTimes = read("stop_times.txt");
  const arrivals = new Map<string, number>();
  const railStops = new Set<string>();
  let headerDone = false;
  let tripIdx = -1;
  let stopIdx = -1;
  let start = 0;
  while (start < stopTimes.length) {
    let end = stopTimes.indexOf("\n", start);
    if (end === -1) end = stopTimes.length;
    const line = stopTimes.slice(start, end).replace(/\r$/, "");
    start = end + 1;
    if (line.length === 0) continue;
    const cols = line.split(",");
    if (!headerDone) {
      tripIdx = cols.indexOf("trip_id");
      stopIdx = cols.indexOf("stop_id");
      headerDone = true;
      continue;
    }
    const trip = weekdayTrips.get(cols[tripIdx]);
    if (!trip) continue;
    const stopId = cols[stopIdx];
    arrivals.set(stopId, (arrivals.get(stopId) ?? 0) + 1);
    if (trip.rail) railStops.add(stopId);
  }

  // Roll platforms up to parent stations.
  const byId = new Map(stops.map((s) => [s.stop_id, s]));
  const agg = new Map<string, { name: string; lat: number; lon: number; count: number; rail: boolean }>();
  for (const [stopId, count] of arrivals) {
    const s = byId.get(stopId);
    if (!s) continue;
    const parent = s.parent_station ? byId.get(s.parent_station) : undefined;
    const key = parent ? parent.stop_id : stopId;
    const rec = parent ?? s;
    const a = agg.get(key) ?? {
      name: rec.stop_name?.trim() || `Stop ${key}`,
      lat: Number(rec.stop_lat),
      lon: Number(rec.stop_lon),
      count: 0,
      rail: false,
    };
    a.count += count;
    if (railStops.has(stopId)) a.rail = true;
    agg.set(key, a);
  }

  const out: Stop[] = [...agg.entries()]
    .map(([id, a]) => ({
      id,
      name: a.name,
      lon: Math.round(a.lon * 1e6) / 1e6,
      lat: Math.round(a.lat * 1e6) / 1e6,
      tph: Math.round((a.count / SERVICE_HOURS) * 100) / 100,
      rail: a.rail,
    }))
    .filter((s) => s.tph > 0);

  const rail = out.filter((s) => s.rail).length;
  log(`stops with weekday service: ${out.length} (${rail} rail stations)`);

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, "stops.json"), JSON.stringify(out));
  log(`wrote data/stops.json`);
  return out;
}
