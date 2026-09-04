"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMargin } from "@/lib/model";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type DistrictRow = {
  id: string;
  republican: string | null;
  democrat: string | null;
  margin: number;
  marginLabel: string;
  republicanOdds: number | null;
  democraticOdds: number | null;
  rating: string | null;
};

type HillcastBundle = {
  generatedAt: string;
  sourceFile: string;
  sourceAsOf?: string | null;
  districtCount: number;
  hillcastNationalMargin: number;
  hillcastNationalAsOf?: string | null;
  convention: string;
  districts: DistrictRow[];
};

type DemographicKey = "whiteNH" | "black" | "hispanic" | "asian" | "other";
type DemoRow = { id: string; totalCvapApprox: number; shares: Record<DemographicKey, number> };
type DemographicBundle = {
  generatedAt: string;
  source: string;
  geography: string;
  methodNote: string;
  nationalShares: Record<DemographicKey, number>;
  districts: DemoRow[];
};

type Feature = {
  type: "Feature";
  properties: { STATE?: string; CD119?: string; GEOID?: string; NAME?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
};
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

type ScenarioSetting = { margin: number; turnout: number };

const CENSUS_GEOMETRY_URLS = [
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/7/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=4&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/6/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=4&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/5/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=4&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/8/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=4&outSR=4326&f=geojson",
];

async function fetchGeometryFallback(): Promise<FeatureCollection | null> {
  for (const url of CENSUS_GEOMETRY_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store", mode: "cors" });
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.type === "FeatureCollection" && Array.isArray(data.features) && data.features.length >= 430) {
        return data as FeatureCollection;
      }
    } catch {
      // Try the next official Census endpoint.
    }
  }
  return null;
}

const GROUPS: { key: DemographicKey; label: string }[] = [
  { key: "whiteNH", label: "White non-Hispanic" },
  { key: "black", label: "Black" },
  { key: "hispanic", label: "Hispanic" },
  { key: "asian", label: "Asian" },
  { key: "other", label: "Other / residual" },
];

const STATE_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};

function districtId(feature: Feature) {
  const state = STATE_ABBR[String(feature.properties?.STATE ?? "").padStart(2, "0")];
  if (!state) return null;
  const raw = String(feature.properties?.CD119 ?? "00");
  return `${state}-${raw === "00" ? "01" : raw.padStart(2, "0")}`;
}

function allPoints(feature: Feature): [number, number][] {
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
function boundsFor(features: Feature[], region: "main" | "AK" | "HI"): Bounds {
  const vals: [number, number][] = [];
  for (const f of features) {
    const id = districtId(f);
    const state = id?.split("-")[0] ?? "";
    const include = region === "main" ? state !== "AK" && state !== "HI" : state === region;
    if (!include) continue;
    for (const [lon, lat] of allPoints(f)) vals.push([normalizedLon(lon, state), lat]);
  }
  if (!vals.length) return { minX: -125, maxX: -66, minY: 24, maxY: 50 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of vals) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}

function pathFor(feature: Feature, bounds: Record<"main" | "AK" | "HI", Bounds>) {
  const id = districtId(feature);
  const state = id?.split("-")[0] ?? "";
  const region: "main" | "AK" | "HI" = state === "AK" ? "AK" : state === "HI" ? "HI" : "main";
  const rect = region === "main"
    ? { x: 25, y: 18, w: 950, h: 500 }
    : region === "AK" ? { x: 35, y: 535, w: 280, h: 140 } : { x: 335, y: 565, w: 190, h: 90 };
  const b = bounds[region];
  const sx = rect.w / Math.max(0.001, b.maxX - b.minX);
  const sy = rect.h / Math.max(0.001, b.maxY - b.minY);
  const scale = Math.min(sx, sy);
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

function colorForMargin(m: number) {
  if (m >= 15) return "#2458b8";
  if (m >= 5) return "#4f7bd2";
  if (m >= 0.5) return "#8da8e8";
  if (m > -0.5) return "#b3b8c6";
  if (m > -5) return "#e7a09a";
  if (m > -15) return "#cf615a";
  return "#a93634";
}

function demographicMargin(shares: Record<DemographicKey, number> | undefined, settings: Record<DemographicKey, ScenarioSetting>) {
  if (!shares) return 0;
  let numerator = 0, denominator = 0;
  for (const { key } of GROUPS) {
    const weight = Math.max(0, Number(shares[key] ?? 0)) * Math.max(0, settings[key].turnout / 100);
    numerator += weight * settings[key].margin;
    denominator += weight;
  }
  return denominator ? numerator / denominator : 0;
}

function defaultSettings(): Record<DemographicKey, ScenarioSetting> {
  return { whiteNH: { margin: 0, turnout: 100 }, black: { margin: 0, turnout: 100 }, hispanic: { margin: 0, turnout: 100 }, asian: { margin: 0, turnout: 100 }, other: { margin: 0, turnout: 100 } };
}

export default function DistrictScenarioMap({ rawNationalMargin, projectedNationalMargin }: { rawNationalMargin: number; projectedNationalMargin: number }) {
  const [hillcast, setHillcast] = useState<HillcastBundle | null>(null);
  const [demographics, setDemographics] = useState<DemographicBundle | null>(null);
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<DemographicKey, ScenarioSetting>>(defaultSettings());
  const [preserveNational, setPreserveNational] = useState(true);
  const [anchorMode, setAnchorMode] = useState<"projected" | "raw">("projected");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function loadDistrictData() {
    try {
      const [hResponse, dResponse, gResponse] = await Promise.all([
        fetch(`${BASE_PATH}/data/hillcast-districts.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/district-demographics.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/cd119.geojson?v=${Date.now()}`, { cache: "no-store" }),
      ]);

      if (!hResponse.ok) throw new Error(`HillCast district HTTP ${hResponse.status}`);
      const h = await hResponse.json();
      const d = dResponse.ok ? await dResponse.json() : null;
      let g = gResponse.ok ? await gResponse.json() : null;
      let usedRuntimeGeometry = false;

      if (!g?.features || g.features.length < 430) {
        g = await fetchGeometryFallback();
        usedRuntimeGeometry = Boolean(g);
      }

      setHillcast(h);
      setDemographics(d);
      setGeo(g);
      setSelectedId(h.districts?.[0]?.id ?? null);

      if (!d && !g) {
        setLoadNote("Census demographic data and district geometry are unavailable. The map can be retried without redeploying.");
      } else if (!g) {
        setLoadNote("The committed district geometry file is not available yet and the browser fallback could not reach Census. Run the dedicated “Refresh congressional district geometry” GitHub Action once.");
      } else if (!d) {
        setLoadNote("Map geometry loaded, but Census demographic data were unavailable; demographic effects will remain neutral until the next successful refresh.");
      } else if (usedRuntimeGeometry) {
        setLoadNote("Map geometry loaded directly from the U.S. Census Bureau because the bundled geometry file was missing.");
      } else {
        setLoadNote(null);
      }
    } catch (e) {
      setLoadNote(e instanceof Error ? e.message : "Could not load district data");
    }
  }

  useEffect(() => {
    void loadDistrictData();
  }, []);

  const districtMap = useMemo(() => new Map(hillcast?.districts.map((d) => [d.id, d]) ?? []), [hillcast]);
  const demoMap = useMemo(() => new Map(demographics?.districts.map((d) => [d.id, d]) ?? []), [demographics]);
  const nationalDemoMargin = useMemo(() => demographicMargin(demographics?.nationalShares, settings), [demographics, settings]);
  const pollingAnchor = anchorMode === "projected" ? projectedNationalMargin : rawNationalMargin;
  const scenarioNationalMargin = preserveNational ? pollingAnchor : nationalDemoMargin;
  const nationalResidual = hillcast ? scenarioNationalMargin - hillcast.hillcastNationalMargin : 0;

  const adjusted = useMemo(() => {
    if (!hillcast) return new Map<string, { row: DistrictRow; margin: number; demoEffect: number; demoMargin: number }>();
    const out = new Map<string, { row: DistrictRow; margin: number; demoEffect: number; demoMargin: number }>();
    for (const row of hillcast.districts) {
      const demoRow = demoMap.get(row.id);
      const demoMargin = demographicMargin(demoRow?.shares, settings);
      const demoEffect = demographics ? demoMargin - nationalDemoMargin : 0;
      const margin = row.margin + nationalResidual + demoEffect;
      out.set(row.id, { row, margin, demoEffect, demoMargin });
    }
    return out;
  }, [hillcast, demoMap, demographics, settings, nationalDemoMargin, nationalResidual]);

  const bounds = useMemo(() => geo ? { main: boundsFor(geo.features, "main"), AK: boundsFor(geo.features, "AK"), HI: boundsFor(geo.features, "HI") } : null, [geo]);
  const selected = selectedId ? adjusted.get(selectedId) : undefined;
  const selectedDemo = selectedId ? demoMap.get(selectedId) : undefined;
  const counts = useMemo(() => {
    let d = 0, r = 0, toss = 0;
    for (const v of adjusted.values()) { if (v.margin >= 0.5) d++; else if (v.margin <= -0.5) r++; else toss++; }
    return { d, r, toss };
  }, [adjusted]);

  function setGroup(key: DemographicKey, field: "margin" | "turnout", value: number) {
    setSettings((old) => ({ ...old, [key]: { ...old[key], [field]: value } }));
  }

  return (
    <section className="shell card districtScenarioCard">
      <div className="districtHeader">
        <div>
          <div className="eyebrow">DISTRICT SCENARIO ENGINE</div>
          <h3>HillCast district prior + national aggregate + demographic redistribution</h3>
          <p className="small">Weekly HillCast CSVs set the district-level prior. Only the difference between the selected national anchor and HillCast&apos;s own national baseline is added to each district, which avoids adding the national environment twice.</p>
        </div>
        <div className="districtCounts"><span>D-led <b>{counts.d}</b></span><span>R-led <b>{counts.r}</b></span><span>Within 0.5 <b>{counts.toss}</b></span></div>
      </div>

      <div className="districtTopControls">
        <label>National anchor
          <select value={anchorMode} onChange={(e) => setAnchorMode(e.target.value as "projected" | "raw")}>
            <option value="projected">Historical-path Election Day projection ({formatMargin(projectedNationalMargin)})</option>
            <option value="raw">Current aggregate of aggregates ({formatMargin(rawNationalMargin)})</option>
          </select>
        </label>
        <label>Demographic mode
          <button className="toggle" onClick={() => setPreserveNational((v) => !v)}>{preserveNational ? "Preserve national anchor" : "Demographics set national margin"}</button>
        </label>
        <label>District inspector
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value || null)}>
            {(hillcast?.districts ?? []).map((district) => <option key={district.id} value={district.id}>{district.id} · {district.marginLabel}</option>)}
          </select>
        </label>
        <div className="scenarioStat"><span>HillCast national baseline</span><b>{hillcast ? formatMargin(hillcast.hillcastNationalMargin) : "…"}</b></div>
        <div className="scenarioStat"><span>National residual applied</span><b>{hillcast ? formatMargin(nationalResidual) : "…"}</b></div>
      </div>

      <div className="demographicSliders">
        {GROUPS.map(({ key, label }) => (
          <div className="demoSlider" key={key}>
            <strong>{label}</strong>
            <label>Vote margin <span>{formatMargin(settings[key].margin)}</span>
              <input type="range" min="-100" max="100" step="1" value={settings[key].margin} onChange={(e) => setGroup(key, "margin", Number(e.target.value))} />
            </label>
            <label>Turnout index <span>{settings[key].turnout}%</span>
              <input type="range" min="50" max="150" step="1" value={settings[key].turnout} onChange={(e) => setGroup(key, "turnout", Number(e.target.value))} />
            </label>
          </div>
        ))}
      </div>
      <div className="scenarioActions"><button className="secondary" onClick={() => setSettings(defaultSettings())}>Reset demographic sliders</button><span className="small">Positive group margins are Democratic; negative are Republican. A turnout index of 100 is neutral.</span></div>

      <div className="districtMapGrid">
        <div className="mapPane">
          {geo && bounds ? (
            <svg className="districtMap" viewBox="0 0 1000 700" role="img" aria-label="Interactive 119th Congressional District scenario map">
              {geo.features.map((feature, i) => {
                const id = districtId(feature);
                if (!id) return null;
                const item = adjusted.get(id);
                return <path key={`${id}-${i}`} d={pathFor(feature, bounds)} fill={colorForMargin(item?.margin ?? 0)} fillRule="evenodd" className={`districtShape ${selectedId === id ? "selected" : ""}`} onClick={() => setSelectedId(id)}><title>{id}: {item ? formatMargin(item.margin) : "No model row"}</title></path>;
              })}
            </svg>
          ) : <div className="mapPlaceholder"><div>District geometry is not available in this deployment.</div><button className="secondary" onClick={() => void loadDistrictData()}>Retry Census map</button><div className="small">The page checks the committed GeoJSON first, then tries official Census endpoints. The dedicated GitHub Action is the reliable long-term source.</div></div>}
          <div className="mapLegend"><span><i className="legendDStrong" />D+15</span><span><i className="legendD" />D+5</span><span><i className="legendT" />±0.5</span><span><i className="legendR" />R+5</span><span><i className="legendRStrong" />R+15</span></div>
        </div>

        <aside className="districtInspector">
          {selected ? <>
            <div className="eyebrow">{selected.row.id}</div>
            <div className="districtMargin">{formatMargin(selected.margin)}</div>
            <div className="districtBreakdown">
              <div><span>HillCast prior</span><b>{formatMargin(selected.row.margin)}</b></div>
              <div><span>National residual</span><b>{formatMargin(nationalResidual)}</b></div>
              <div><span>Demographic geographic effect</span><b>{formatMargin(selected.demoEffect)}</b></div>
            </div>
            <p className="small"><strong>HillCast rating:</strong> {selected.row.rating ?? "—"}</p>
            <p className="small"><strong>Republican:</strong> {selected.row.republican ?? "Not listed"}<br/><strong>Democrat:</strong> {selected.row.democrat ?? "Not listed"}</p>
            {selectedDemo && <div className="demoShares">{GROUPS.map(({ key, label }) => <span key={key}>{label} <b>{selectedDemo.shares[key]?.toFixed(1) ?? "0.0"}%</b></span>)}</div>}
          </> : <p className="small">Select a district on the map.</p>}
        </aside>
      </div>

      <p className="small districtFootnote">District boundaries use Census 119th Congressional District geography. Demographic shares are generated from the 2024 ACS API as a lightweight CVAP approximation; the build notes disclose the category-normalization limitation. {hillcast ? `Current district prior: ${hillcast.sourceFile}${hillcast.sourceAsOf ? ` (${hillcast.sourceAsOf})` : ""}.` : ""} {loadNote ?? ""}</p>
    </section>
  );
}
