"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMargin } from "@/lib/model";
import { useSvgViewport } from "@/app/mapViewport";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type StateFeature = {
  type: "Feature";
  properties: { GEOID?: string; STATE?: string; STUSAB?: string; NAME?: string; BASENAME?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
};
type FeatureCollection = { type: "FeatureCollection"; features: StateFeature[] };

type RaceRow = {
  state: string;
  republican?: string | null;
  democrat?: string | null;
  margin?: number | null;
  rating?: string | null;
  source?: string | null;
  asOf?: string | null;
  note?: string | null;
};
type StatewideBundle = {
  generatedAt?: string | null;
  convention: string;
  senate: RaceRow[];
  governors: RaceRow[];
  note?: string;
};

const STATE_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};
const VALID = new Set(Object.values(STATE_ABBR));

const STATE_GEOMETRY_URLS = [
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/8/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/9/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=4&outSR=4326&f=geojson",
];

async function fetchStateGeometryFallback(): Promise<FeatureCollection | null> {
  for (const url of STATE_GEOMETRY_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store", mode: "cors" });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
        const features = data.features.filter((feature: StateFeature) => VALID.has(stateId(feature) ?? ""));
        if (features.length >= 51) return { ...data, features } as FeatureCollection;
      }
    } catch {
      // Try the next official Census endpoint.
    }
  }
  return null;
}

function stateId(feature: StateFeature) {
  const direct = String(feature.properties?.STUSAB ?? "").toUpperCase();
  if (VALID.has(direct)) return direct;
  const fips = String(feature.properties?.STATE ?? feature.properties?.GEOID ?? "").padStart(2, "0").slice(0, 2);
  return STATE_ABBR[fips] ?? null;
}

function allPoints(feature: StateFeature): [number, number][] {
  const out: [number, number][] = [];
  const walk = (node: any) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") out.push([node[0], node[1]]);
    else node.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  return out;
}

function normalizedLon(lon: number, state: string) {
  if (state === "AK" && lon > 0) return lon - 360;
  return lon;
}

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
function boundsFor(features: StateFeature[], region: "main" | "AK" | "HI"): Bounds {
  const vals: [number, number][] = [];
  for (const f of features) {
    const state = stateId(f) ?? "";
    const include = region === "main" ? state !== "AK" && state !== "HI" : state === region;
    if (!include) continue;
    for (const [lon, lat] of allPoints(f)) vals.push([normalizedLon(lon, state), lat]);
  }
  if (!vals.length) return { minX: -125, maxX: -66, minY: 24, maxY: 50 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of vals) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}

function pathFor(feature: StateFeature, bounds: Record<"main" | "AK" | "HI", Bounds>) {
  const state = stateId(feature) ?? "";
  const region: "main" | "AK" | "HI" = state === "AK" ? "AK" : state === "HI" ? "HI" : "main";
  const rect = region === "main"
    ? { x: 20, y: 15, w: 960, h: 505 }
    : region === "AK" ? { x: 40, y: 535, w: 285, h: 145 } : { x: 345, y: 565, w: 190, h: 90 };
  const b = bounds[region];
  const scale = Math.min(rect.w / Math.max(.001, b.maxX - b.minX), rect.h / Math.max(.001, b.maxY - b.minY));
  const usedW = (b.maxX - b.minX) * scale;
  const usedH = (b.maxY - b.minY) * scale;
  const offX = rect.x + (rect.w - usedW) / 2;
  const offY = rect.y + (rect.h - usedH) / 2;
  const pt = ([lon0, lat]: [number, number]) => {
    const lon = normalizedLon(lon0, state);
    return [offX + (lon - b.minX) * scale, offY + (b.maxY - lat) * scale];
  };
  const ringPath = (ring: [number, number][]) => ring.map((p, i) => `${i ? "L" : "M"}${pt(p)[0].toFixed(2)},${pt(p)[1].toFixed(2)}`).join(" ") + " Z";
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates.map(ringPath).join(" ");
  return feature.geometry.coordinates.flatMap((poly: [number, number][][]) => poly.map(ringPath)).join(" ");
}

function colorForMargin(margin: number | null | undefined) {
  if (margin == null || !Number.isFinite(margin)) return "#37415a";
  if (margin >= 15) return "#2458b8";
  if (margin >= 5) return "#4f7bd2";
  if (margin >= .5) return "#8da8e8";
  if (margin > -.5) return "#b3b8c6";
  if (margin > -5) return "#e7a09a";
  if (margin > -15) return "#cf615a";
  return "#a93634";
}

export default function StatewideMapFoundation() {
  const [mode, setMode] = useState<"senate" | "governors">("senate");
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [bundle, setBundle] = useState<StatewideBundle | null>(null);
  const [selectedState, setSelectedState] = useState("PA");
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewport = useSvgViewport({ x: 0, y: 0, width: 1000, height: 700 }, 180);

  async function load() {
    try {
      const [gResponse, rResponse] = await Promise.all([
        fetch(`${BASE_PATH}/data/states.geojson?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/statewide-races.json?v=${Date.now()}`, { cache: "no-store" }),
      ]);
      let g = gResponse.ok ? await gResponse.json() : null;
      let fallback = false;
      if (!g?.features || g.features.length < 51) {
        g = await fetchStateGeometryFallback();
        fallback = Boolean(g);
      }
      const b = rResponse.ok ? await rResponse.json() : { convention: "positive = Democratic; negative = Republican", senate: [], governors: [] };
      setGeo(g);
      setBundle(b);
      if (!g) setLoadNote("State geometry is not available yet. Run the geometry refresh Action or retry from the browser.");
      else if (fallback) setLoadNote("State geometry loaded directly from Census because the committed file was unavailable.");
      else setLoadNote(null);
    } catch (error) {
      setLoadNote(error instanceof Error ? error.message : "Could not load statewide map foundation");
    }
  }

  useEffect(() => { void load(); }, []);

  const bounds = useMemo(() => geo ? { main: boundsFor(geo.features, "main"), AK: boundsFor(geo.features, "AK"), HI: boundsFor(geo.features, "HI") } : null, [geo]);
  const races = bundle?.[mode] ?? [];
  const raceMap = useMemo(() => new Map(races.map((row) => [row.state.toUpperCase(), row])), [races]);
  const selected = raceMap.get(selectedState);
  const stateName = geo?.features.find((feature) => stateId(feature) === selectedState)?.properties?.NAME ?? selectedState;
  const counts = useMemo(() => {
    let d = 0, r = 0, toss = 0, tracked = 0;
    for (const row of races) {
      if (row.margin == null || !Number.isFinite(row.margin)) continue;
      tracked++;
      if (row.margin >= .5) d++; else if (row.margin <= -.5) r++; else toss++;
    }
    return { d, r, toss, tracked };
  }, [races]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await paneRef.current?.requestFullscreen();
    } catch {}
  }

  return (
    <section className="shell card statewideMapCard">
      <div className="districtHeader">
        <div>
          <div className="eyebrow">STATEWIDE MAP FOUNDATION</div>
          <h3>Senate and gubernatorial map groundwork</h3>
          <p className="small">The geometry, zoom/pan controls, race schema, and weekly CSV ingestion path are ready. Add statewide projections later without redesigning the map system.</p>
        </div>
        <div className="districtCounts"><span>D-led <b>{counts.d}</b></span><span>R-led <b>{counts.r}</b></span><span>Within 0.5 <b>{counts.toss}</b></span><span>Tracked <b>{counts.tracked}</b></span></div>
      </div>

      <div className="statewideModeTabs" role="tablist" aria-label="Statewide election map type">
        <button className={mode === "senate" ? "active" : ""} onClick={() => { setMode("senate"); viewport.reset(); }}>U.S. Senate</button>
        <button className={mode === "governors" ? "active" : ""} onClick={() => { setMode("governors"); viewport.reset(); }}>Governors</button>
      </div>

      <div className="statewideMapGrid">
        <div className="mapPane" ref={paneRef}>
          <div className="mapToolbar">
            <div className="mapToolbarTitle"><strong>{mode === "senate" ? "2026 Senate map" : "2026 gubernatorial map"}</strong><span>{viewport.zoomPercent}% zoom</span></div>
            <div className="mapToolbarButtons">
              <button type="button" aria-label="Zoom in" onClick={() => viewport.zoomCenter(svgRef.current, .78)}>＋</button>
              <button type="button" aria-label="Zoom out" onClick={() => viewport.zoomCenter(svgRef.current, 1.28)}>−</button>
              <button type="button" onClick={viewport.reset}>Reset</button>
              <button type="button" onClick={() => void toggleFullscreen()}>Fullscreen</button>
            </div>
          </div>
          <div className="mapInteractionHint">Scroll to zoom · drag to pan · click a state to inspect</div>
          {geo && bounds ? (
            <svg
              ref={svgRef}
              className={`statewideMap ${viewport.dragging ? "dragging" : ""}`}
              viewBox={`${viewport.view.x} ${viewport.view.y} ${viewport.view.width} ${viewport.view.height}`}
              role="img"
              aria-label={mode === "senate" ? "Interactive Senate map foundation" : "Interactive governor map foundation"}
              onWheel={viewport.onWheel}
              onPointerDown={viewport.onPointerDown}
              onPointerMove={viewport.onPointerMove}
              onPointerUp={viewport.onPointerUp}
              onPointerCancel={viewport.onPointerCancel}
              onDoubleClick={(event) => viewport.zoomCenter(event.currentTarget, .72)}
            >
              {geo.features.map((feature, i) => {
                const id = stateId(feature);
                if (!id) return null;
                const row = raceMap.get(id);
                return <path key={`${id}-${i}`} d={pathFor(feature, bounds)} fill={colorForMargin(row?.margin)} fillRule="evenodd" className={`stateShape ${selectedState === id ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); setSelectedState(id); }}><title>{id}: {row?.margin != null ? formatMargin(row.margin) : "No projection loaded"}</title></path>;
              })}
            </svg>
          ) : <div className="mapPlaceholder"><div>State geometry is not available in this deployment.</div><button className="secondary" onClick={() => void load()}>Retry Census map</button></div>}
          <div className="mapLegend"><span><i className="legendDStrong" />D+15</span><span><i className="legendD" />D+5</span><span><i className="legendT" />No race / tossup</span><span><i className="legendR" />R+5</span><span><i className="legendRStrong" />R+15</span></div>
        </div>

        <aside className="districtInspector">
          <div className="eyebrow">{selectedState}</div>
          <div className="statewideStateName">{stateName}</div>
          {selected ? <>
            <div className="districtMargin">{selected.margin != null ? formatMargin(selected.margin) : "—"}</div>
            <div className="districtBreakdown">
              <div><span>Rating</span><b>{selected.rating ?? "—"}</b></div>
              <div><span>As of</span><b>{selected.asOf ?? "—"}</b></div>
            </div>
            <p className="small"><strong>Republican:</strong> {selected.republican ?? "Not listed"}<br/><strong>Democrat:</strong> {selected.democrat ?? "Not listed"}</p>
            {selected.source && <p className="small"><strong>Source:</strong> {selected.source}</p>}
          </> : <>
            <div className="statewideEmpty">No {mode === "senate" ? "Senate" : "governor"} projection loaded for this state yet.</div>
            <p className="small">Upload a dated CSV to <code>data/statewide_uploads/</code>. The build will normalize it into the map automatically.</p>
          </>}
        </aside>
      </div>
      <p className="small districtFootnote">State boundaries use U.S. Census January 1, 2024 generalized state geography. Gray states currently mean “no projection loaded,” not tossup. {loadNote ?? ""}</p>
    </section>
  );
}
