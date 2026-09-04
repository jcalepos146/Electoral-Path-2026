"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMargin } from "@/lib/model";
import demographicBaseline from "@/data/demographic-baseline-2026.json";
import { useSvgViewport } from "@/app/mapViewport";

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

type BaselineData = {
  label: string;
  asOf: string;
  overallTurnout: number;
  turnoutMeasure: string;
  turnoutNote: string;
  groups: Record<DemographicKey, { label: string; margin: number; basis: string }>;
  sources: { name: string; asOf: string; url: string }[];
};

const BASELINE = demographicBaseline as BaselineData;

const CENSUS_GEOMETRY_URLS = [
  // Prefer the 5M/500K layers now that the map supports zooming; 20M is a compact fallback.
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/6/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/5/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/7/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=4&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/8/query?where=1%3D1&outFields=GEOID%2CSTATE%2CCD119%2CBASENAME%2CNAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=1000&geometryPrecision=5&outSR=4326&f=geojson",
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

function projectedSettings(): Record<DemographicKey, ScenarioSetting> {
  return {
    whiteNH: { margin: BASELINE.groups.whiteNH.margin, turnout: 100 },
    black: { margin: BASELINE.groups.black.margin, turnout: 100 },
    hispanic: { margin: BASELINE.groups.hispanic.margin, turnout: 100 },
    asian: { margin: BASELINE.groups.asian.margin, turnout: 100 },
    other: { margin: BASELINE.groups.other.margin, turnout: 100 },
  };
}

function neutralSettings(): Record<DemographicKey, ScenarioSetting> {
  return { whiteNH: { margin: 0, turnout: 100 }, black: { margin: 0, turnout: 100 }, hispanic: { margin: 0, turnout: 100 }, asian: { margin: 0, turnout: 100 }, other: { margin: 0, turnout: 100 } };
}

function districtTurnoutRate(shares: Record<DemographicKey, number> | undefined, groupTurnout: Record<DemographicKey, number>) {
  if (!shares) return 0;
  return GROUPS.reduce((sum, { key }) => sum + (Math.max(0, Number(shares[key] ?? 0)) / 100) * Math.max(0, groupTurnout[key] ?? 0), 0);
}

function leadCounts(values: Iterable<{ margin: number }>) {
  let d = 0, r = 0, toss = 0;
  for (const value of values) {
    if (value.margin >= 0.5) d++;
    else if (value.margin <= -0.5) r++;
    else toss++;
  }
  return { d, r, toss };
}

function seatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

export default function DistrictScenarioMap({ rawNationalMargin, projectedNationalMargin }: { rawNationalMargin: number; projectedNationalMargin: number }) {
  const [hillcast, setHillcast] = useState<HillcastBundle | null>(null);
  const [demographics, setDemographics] = useState<DemographicBundle | null>(null);
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<DemographicKey, ScenarioSetting>>(projectedSettings());
  const [overallTurnout, setOverallTurnout] = useState(BASELINE.overallTurnout);
  const [preserveNational, setPreserveNational] = useState(true);
  const [anchorMode, setAnchorMode] = useState<"projected" | "raw">("projected");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapPaneRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewport = useSvgViewport({ x: 0, y: 0, width: 1000, height: 700 }, 135);

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
      setSelectedId((current) => current && h.districts?.some((row: DistrictRow) => row.id === current) ? current : h.districts?.[0]?.id ?? null);

      if (!d && !g) {
        setLoadNote("Census demographic data and district geometry are unavailable. The map can be retried without redeploying.");
      } else if (!g) {
        setLoadNote("The committed district geometry file is not available yet and the browser fallback could not reach Census. Run the dedicated “Refresh election map geometry” GitHub Action once.");
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

  const demoMap = useMemo(() => new Map(demographics?.districts.map((d) => [d.id, d]) ?? []), [demographics]);
  const baselineSettings = useMemo(() => projectedSettings(), []);

  // Convert the relative turnout sliders into absolute implied turnout rates. The national
  // average is rescaled back to the overall turnout assumption, so moving one group's
  // turnout changes composition while the overall control changes total participation.
  const impliedTurnout = useMemo(() => {
    const shares = demographics?.nationalShares;
    if (!shares) {
      return Object.fromEntries(GROUPS.map(({ key }) => [key, Math.min(100, overallTurnout * settings[key].turnout / 100)])) as Record<DemographicKey, number>;
    }
    const relativeNational = GROUPS.reduce((sum, { key }) => sum + Math.max(0, shares[key] ?? 0) * Math.max(0, settings[key].turnout / 100), 0);
    const scale = relativeNational > 0 ? overallTurnout * 100 / relativeNational : overallTurnout;
    return Object.fromEntries(GROUPS.map(({ key }) => [key, Math.min(100, scale * Math.max(0, settings[key].turnout / 100))])) as Record<DemographicKey, number>;
  }, [demographics, settings, overallTurnout]);

  const baselineImpliedTurnout = useMemo(() => {
    return Object.fromEntries(GROUPS.map(({ key }) => [key, BASELINE.overallTurnout])) as Record<DemographicKey, number>;
  }, []);

  const baselineNationalDemoMargin = useMemo(
    () => demographicMargin(demographics?.nationalShares, baselineSettings),
    [demographics, baselineSettings],
  );
  const scenarioNationalDemoMargin = useMemo(
    () => demographicMargin(demographics?.nationalShares, settings),
    [demographics, settings],
  );
  const demographicNationalSwing = demographics ? scenarioNationalDemoMargin - baselineNationalDemoMargin : 0;

  const pollingAnchor = anchorMode === "projected" ? projectedNationalMargin : rawNationalMargin;
  // Baseline demographic projections are treated as the zero point. If demographic mode is
  // allowed to move the national vote, only the change away from that baseline is added.
  const scenarioNationalMargin = preserveNational ? pollingAnchor : pollingAnchor + demographicNationalSwing;
  const baselineNationalResidual = hillcast ? pollingAnchor - hillcast.hillcastNationalMargin : 0;
  const nationalResidual = hillcast ? scenarioNationalMargin - hillcast.hillcastNationalMargin : 0;

  const adjusted = useMemo(() => {
    type Adjusted = {
      row: DistrictRow;
      margin: number;
      baselineMargin: number;
      scenarioShift: number;
      baselineDemoMargin: number;
      demoMargin: number;
      localDemoSwing: number;
      demoEffect: number;
      turnoutRate: number;
      baselineTurnoutRate: number;
      projectedVotes: number | null;
    };
    const out = new Map<string, Adjusted>();
    if (!hillcast) return out;

    for (const row of hillcast.districts) {
      const demoRow = demoMap.get(row.id);
      const baselineDemoMargin = demographicMargin(demoRow?.shares, baselineSettings);
      const demoMargin = demographicMargin(demoRow?.shares, settings);
      const localDemoSwing = demographics ? demoMargin - baselineDemoMargin : 0;
      // The national component of the demographic swing is already handled by the national
      // anchor/residual. Subtracting it here leaves only the district-specific geographic effect.
      const demoEffect = demographics ? localDemoSwing - demographicNationalSwing : 0;
      const baselineMargin = row.margin + baselineNationalResidual;
      const margin = row.margin + nationalResidual + demoEffect;
      const turnoutRate = districtTurnoutRate(demoRow?.shares, impliedTurnout);
      const baselineTurnoutRate = districtTurnoutRate(demoRow?.shares, baselineImpliedTurnout);
      const projectedVotes = demoRow?.totalCvapApprox && turnoutRate
        ? Math.round(demoRow.totalCvapApprox * turnoutRate / 100)
        : null;
      out.set(row.id, {
        row,
        margin,
        baselineMargin,
        scenarioShift: margin - baselineMargin,
        baselineDemoMargin,
        demoMargin,
        localDemoSwing,
        demoEffect,
        turnoutRate,
        baselineTurnoutRate,
        projectedVotes,
      });
    }
    return out;
  }, [hillcast, demoMap, demographics, baselineSettings, settings, demographicNationalSwing, baselineNationalResidual, nationalResidual, impliedTurnout, baselineImpliedTurnout]);

  const baselineAdjusted = useMemo(() => {
    if (!hillcast) return new Map<string, { margin: number }>();
    return new Map(hillcast.districts.map((row) => [row.id, { margin: row.margin + baselineNationalResidual }]));
  }, [hillcast, baselineNationalResidual]);

  const bounds = useMemo(() => geo ? { main: boundsFor(geo.features, "main"), AK: boundsFor(geo.features, "AK"), HI: boundsFor(geo.features, "HI") } : null, [geo]);
  const selected = selectedId ? adjusted.get(selectedId) : undefined;
  const selectedDemo = selectedId ? demoMap.get(selectedId) : undefined;
  const counts = useMemo(() => leadCounts(adjusted.values()), [adjusted]);
  const baselineCounts = useMemo(() => leadCounts(baselineAdjusted.values()), [baselineAdjusted]);
  const districtShiftSummary = useMemo(() => {
    let movedD = 0, movedR = 0, unchanged = 0;
    for (const item of adjusted.values()) {
      if (item.scenarioShift > 0.05) movedD++;
      else if (item.scenarioShift < -0.05) movedR++;
      else unchanged++;
    }
    return { movedD, movedR, unchanged };
  }, [adjusted]);

  function setGroup(key: DemographicKey, field: "margin" | "turnout", value: number) {
    setSettings((old) => ({ ...old, [key]: { ...old[key], [field]: value } }));
  }

  function selectDistrict(id: string) {
    setSelectedId(id);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await mapPaneRef.current?.requestFullscreen();
    } catch {
      // Fullscreen is optional; zoom/pan still work if the browser blocks it.
    }
  }

  return (
    <section className="shell card districtScenarioCard">
      <div className="districtHeader">
        <div>
          <div className="eyebrow">DISTRICT SCENARIO ENGINE</div>
          <h3>HillCast district prior + national aggregate + real-time demographic swing</h3>
          <p className="small">HillCast supplies the district prior. The national anchor is applied only as a residual, while demographic sliders now calculate changes relative to the published 2026 demographic baseline. Moving a slider therefore shows a real-time district swing instead of replacing the prior with a second demographic model.</p>
        </div>
        <div className="districtCounts">
          <span>D-led <b>{counts.d}</b> <em>{seatDelta(counts.d - baselineCounts.d)}</em></span>
          <span>R-led <b>{counts.r}</b> <em>{seatDelta(counts.r - baselineCounts.r)}</em></span>
          <span>Within 0.5 <b>{counts.toss}</b> <em>{seatDelta(counts.toss - baselineCounts.toss)}</em></span>
        </div>
      </div>

      <div className="liveScenarioRibbon" aria-live="polite">
        <div><span>Polling anchor</span><b>{formatMargin(pollingAnchor)}</b></div>
        <div><span>Demographic national swing</span><b>{formatMargin(demographicNationalSwing)}</b></div>
        <div><span>Scenario national margin</span><b>{formatMargin(scenarioNationalMargin)}</b></div>
        <div><span>Districts shifting D</span><b>{districtShiftSummary.movedD}</b></div>
        <div><span>Districts shifting R</span><b>{districtShiftSummary.movedR}</b></div>
      </div>

      <div className="districtTopControls">
        <label>National anchor
          <select value={anchorMode} onChange={(e) => setAnchorMode(e.target.value as "projected" | "raw")}>
            <option value="projected">Historical-path Election Day projection ({formatMargin(projectedNationalMargin)})</option>
            <option value="raw">Current aggregate of aggregates ({formatMargin(rawNationalMargin)})</option>
          </select>
        </label>
        <label>Demographic mode
          <button type="button" className="toggle" onClick={() => setPreserveNational((v) => !v)}>{preserveNational ? "Preserve national anchor" : "Allow demographic national swing"}</button>
        </label>
        <label>District inspector
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value || null)}>
            {(hillcast?.districts ?? []).map((district) => <option key={district.id} value={district.id}>{district.id} · {district.marginLabel}</option>)}
          </select>
        </label>
        <div className="scenarioStat"><span>HillCast national baseline</span><b>{hillcast ? formatMargin(hillcast.hillcastNationalMargin) : "…"}</b></div>
        <div className="scenarioStat"><span>National residual applied</span><b>{hillcast ? formatMargin(nationalResidual) : "…"}</b></div>
      </div>

      <div className="demographicProjectionHeader">
        <div>
          <div className="eyebrow">2026 DEMOGRAPHIC PROJECTION BASELINE</div>
          <h4>Adjust projected group margins and turnout; the map recalculates immediately</h4>
          <p className="small">The baseline values are the zero point for scenario changes. A White margin shift from R+9.5 to R+5.0, for example, is treated as a 4.5-point Democratic movement within that group. Turnout changes reweight each district according to its demographic composition.</p>
        </div>
        <div className="overallTurnoutControl">
          <span>Projected overall turnout</span>
          <strong>{overallTurnout.toFixed(1)}%</strong>
          <small>{BASELINE.turnoutMeasure}</small>
          <input type="range" min="35" max="65" step="0.1" value={overallTurnout} onChange={(e) => setOverallTurnout(Number(e.target.value))} />
          <small>Overall turnout changes vote volume. Partisan margins move when group turnout differs from the baseline composition.</small>
        </div>
      </div>

      <div className="baselineMarginStrip">
        {GROUPS.map(({ key, label }) => (
          <div key={key}><span>{label}</span><b>{formatMargin(BASELINE.groups[key].margin)}</b></div>
        ))}
      </div>

      <div className="demographicSliders">
        {GROUPS.map(({ key, label }) => {
          const marginDelta = settings[key].margin - BASELINE.groups[key].margin;
          const turnoutDelta = impliedTurnout[key] - BASELINE.overallTurnout;
          return (
            <div className="demoSlider" key={key}>
              <strong>{label}</strong>
              <div className="demoBaselineLine"><span>Projected baseline</span><b>{formatMargin(BASELINE.groups[key].margin)}</b></div>
              <label>Scenario vote margin <span>{formatMargin(settings[key].margin)}</span>
                <input type="range" min="-100" max="100" step="0.5" value={settings[key].margin} onChange={(e) => setGroup(key, "margin", Number(e.target.value))} />
              </label>
              <div className="sliderDelta"><span>Margin shift</span><b>{formatMargin(marginDelta)}</b></div>
              <label>Relative turnout <span>{settings[key].turnout}%</span>
                <input type="range" min="50" max="150" step="1" value={settings[key].turnout} onChange={(e) => setGroup(key, "turnout", Number(e.target.value))} />
              </label>
              <div className="impliedTurnout"><span>Implied group turnout</span><b>{impliedTurnout[key].toFixed(1)}%</b></div>
              <div className="sliderDelta"><span>Turnout vs baseline</span><b>{turnoutDelta >= 0 ? "+" : ""}{turnoutDelta.toFixed(1)} pt</b></div>
            </div>
          );
        })}
      </div>
      <div className="scenarioActions">
        <button className="secondary" type="button" onClick={() => { setSettings(projectedSettings()); setOverallTurnout(BASELINE.overallTurnout); }}>Reset to 2026 projection</button>
        <button className="secondary" type="button" onClick={() => setSettings(neutralSettings())}>Set every group to tie</button>
        <span className="small">The published 2026 projection is the model&apos;s zero-change state. Sliders apply changes from that baseline in real time. Uniform changes to overall turnout alone do not create a partisan swing; differential group turnout does.</span>
      </div>

      <div className="districtMapGrid">
        <div className="mapPane" ref={mapPaneRef}>
          <div className="mapToolbar">
            <div className="mapToolbarTitle"><strong>119th Congressional Districts</strong><span>{viewport.zoomPercent}% zoom</span></div>
            <div className="mapToolbarButtons">
              <button type="button" aria-label="Zoom in" onClick={() => viewport.zoomCenter(svgRef.current, 0.78)}>＋</button>
              <button type="button" aria-label="Zoom out" onClick={() => viewport.zoomCenter(svgRef.current, 1.28)}>−</button>
              <button type="button" onClick={viewport.reset}>Reset</button>
              <button type="button" onClick={() => void toggleFullscreen()}>Fullscreen</button>
            </div>
          </div>
          <div className="mapInteractionHint">Click a district to inspect · scroll to zoom · drag to pan · double-click to zoom in</div>
          {geo && bounds ? (
            <svg
              ref={svgRef}
              className={`districtMap ${viewport.dragging ? "dragging" : ""}`}
              viewBox={`${viewport.view.x} ${viewport.view.y} ${viewport.view.width} ${viewport.view.height}`}
              role="img"
              aria-label="Zoomable interactive 119th Congressional District scenario map"
              onWheel={viewport.onWheel}
              onPointerDown={viewport.onPointerDown}
              onPointerMove={viewport.onPointerMove}
              onPointerUp={viewport.onPointerUp}
              onPointerCancel={viewport.onPointerCancel}
              onDoubleClick={(event) => viewport.zoomCenter(event.currentTarget, 0.72)}
            >
              {geo.features.map((feature, i) => {
                const id = districtId(feature);
                if (!id) return null;
                const item = adjusted.get(id);
                const label = `${id}: ${item ? formatMargin(item.margin) : "No model row"}`;
                return (
                  <path
                    key={`${id}-${i}`}
                    d={pathFor(feature, bounds)}
                    fill={colorForMargin(item?.margin ?? 0)}
                    fillRule="evenodd"
                    className={`districtShape ${selectedId === id ? "selected" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (viewport.shouldSuppressClick()) return;
                      selectDistrict(id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectDistrict(id);
                      }
                    }}
                  >
                    <title>{label}</title>
                  </path>
                );
              })}
            </svg>
          ) : <div className="mapPlaceholder"><div>District geometry is not available in this deployment.</div><button className="secondary" onClick={() => void loadDistrictData()}>Retry Census map</button><div className="small">The page checks the committed GeoJSON first, then tries official Census endpoints. The dedicated GitHub Action is the reliable long-term source.</div></div>}
          <div className="mapLegend"><span><i className="legendDStrong" />D+15</span><span><i className="legendD" />D+5</span><span><i className="legendT" />±0.5</span><span><i className="legendR" />R+5</span><span><i className="legendRStrong" />R+15</span></div>
        </div>

        <aside className="districtInspector" aria-live="polite">
          {selected ? <>
            <div className="eyebrow">{selected.row.id}</div>
            <div className="districtMargin">{formatMargin(selected.margin)}</div>
            <div className="districtScenarioDelta">Scenario shift <b>{formatMargin(selected.scenarioShift)}</b> from the unmodified 2026 baseline</div>
            <div className="districtBreakdown">
              <div><span>HillCast prior</span><b>{formatMargin(selected.row.margin)}</b></div>
              <div><span>National residual</span><b>{formatMargin(nationalResidual)}</b></div>
              <div><span>Local demographic swing</span><b>{formatMargin(selected.localDemoSwing)}</b></div>
              <div><span>National demographic swing</span><b>{formatMargin(demographicNationalSwing)}</b></div>
              <div><span>Geographic demo effect</span><b>{formatMargin(selected.demoEffect)}</b></div>
              <div><span>Baseline scenario margin</span><b>{formatMargin(selected.baselineMargin)}</b></div>
              <div className="finalProjectionRow"><span>Final scenario margin</span><b>{formatMargin(selected.margin)}</b></div>
            </div>
            <div className="turnoutInspector">
              <div><span>Estimated district turnout</span><b>{selected.turnoutRate ? `${selected.turnoutRate.toFixed(1)}%` : "—"}</b></div>
              <div><span>Baseline turnout</span><b>{selected.baselineTurnoutRate ? `${selected.baselineTurnoutRate.toFixed(1)}%` : "—"}</b></div>
              <div><span>Approx. votes cast</span><b>{selected.projectedVotes ? selected.projectedVotes.toLocaleString() : "—"}</b></div>
            </div>
            <p className="small"><strong>HillCast rating:</strong> {selected.row.rating ?? "—"}</p>
            <p className="small"><strong>Republican:</strong> {selected.row.republican ?? "Not listed"}<br/><strong>Democrat:</strong> {selected.row.democrat ?? "Not listed"}</p>
            {selectedDemo && <div className="demoShares">{GROUPS.map(({ key, label }) => <span key={key}>{label} <b>{selectedDemo.shares[key]?.toFixed(1) ?? "0.0"}%</b></span>)}</div>}
          </> : <p className="small">Click a district on the map or choose one from the district inspector menu.</p>}
        </aside>
      </div>

      <div className="demographicSourceNote">
        <strong>Baseline sources:</strong> {BASELINE.sources.map((source, i) => <span key={source.name}>{i ? " · " : ""}<a href={source.url} target="_blank" rel="noreferrer">{source.name}</a></span>)}
        <div className="small">{BASELINE.turnoutNote}</div>
      </div>

      <p className="small districtFootnote">The scenario engine is comparative: the demographic baseline itself produces no extra district adjustment. Only changes from the baseline margins and relative turnout create a demographic swing. In preserve-national mode the national component is removed and only geographic redistribution remains. District boundaries use Census 119th Congressional District geography. Demographic shares are generated from the 2024 ACS API as a lightweight CVAP approximation. {hillcast ? `Current district prior: ${hillcast.sourceFile}${hillcast.sourceAsOf ? ` (${hillcast.sourceAsOf})` : ""}.` : ""} {loadNote ?? ""}</p>
    </section>
  );
}
