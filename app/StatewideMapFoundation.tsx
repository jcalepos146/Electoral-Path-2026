"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMargin } from "@/lib/model";
import demographicBaseline from "@/data/demographic-baseline-2026.json";
import { useSvgViewport } from "@/app/mapViewport";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type StateFeature = {
  type: "Feature";
  properties: { GEOID?: string; STATE?: string; STUSAB?: string; NAME?: string; BASENAME?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
};
type FeatureCollection = { type: "FeatureCollection"; features: StateFeature[] };

type DemographicKey = "whiteNH" | "black" | "hispanic" | "asian" | "other";
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

const GROUPS: { key: DemographicKey; label: string }[] = [
  { key: "whiteNH", label: "White non-Hispanic" },
  { key: "black", label: "Black" },
  { key: "hispanic", label: "Hispanic" },
  { key: "asian", label: "Asian" },
  { key: "other", label: "Other / residual" },
];

type RaceRow = {
  state: string;
  republican?: string | null;
  democrat?: string | null;
  other?: string | null;
  margin: number;
  marginLabel?: string | null;
  rating?: string | null;
  democraticOdds?: number | null;
  republicanOdds?: number | null;
  source?: string | null;
  asOf?: string | null;
};
type StatewideBundle = {
  generatedAt?: string | null;
  convention: string;
  senateSourceFile?: string | null;
  senateSourceAsOf?: string | null;
  senateChartId?: string | null;
  senate: RaceRow[];
  note?: string;
};
type DemoRow = {
  id: string;
  totalCvapApprox: number;
  shares: Record<DemographicKey, number>;
};
type StateDemographicBundle = {
  generatedAt: string;
  source: string;
  geography: string;
  methodNote: string;
  nationalShares: Record<DemographicKey, number>;
  states: DemoRow[];
};

type CandidateFinance = {
  candidateId: string; name: string; party: string; receipts: number; disbursements: number; cashOnHand: number; debts: number; coverageEnd?: string | null;
};
type RaceFinance = { dem: CandidateFinance | null; rep: CandidateFinance | null; fecIndex?: number | null; adIndex?: number | null; adImpact?: { demAdSpend: number; repAdSpend: number; demFutureReservations?: number; repFutureReservations?: number; asOf?: string | null; sourceFile?: string | null } | null; index: number | null; direction: string; methodology: string };
type FinanceBundle = { generatedAt: string; source: string; coverageLatest?: string | null; note: string; house: Record<string, RaceFinance>; senate: Record<string, RaceFinance> };
type PollMirror = { id: string; name: string; margin: number; label?: string; url: string; mode: string; pollCount?: number; pollsterCount?: number };
type RacePolling = { sources: PollMirror[]; blend: number | null; sourceCount: number };
type RacePollingBundle = { generatedAt: string; note: string; house: Record<string, RacePolling>; senate: Record<string, RacePolling> };

const STATE_ABBR: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};
const VALID = new Set(Object.values(STATE_ABBR));

const STATE_GEOMETRY_URLS = [
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/8/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=5&outSR=4326&f=geojson",
  "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/9/query?where=1%3D1&outFields=GEOID%2CSTATE%2CSTUSAB%2CNAME%2CBASENAME&returnGeometry=true&returnZ=false&returnM=false&resultRecordCount=100&geometryPrecision=4&outSR=4326&f=geojson",
];

function stateId(feature: StateFeature) {
  const direct = String(feature.properties?.STUSAB ?? "").toUpperCase();
  if (VALID.has(direct)) return direct;
  const fips = String(feature.properties?.STATE ?? feature.properties?.GEOID ?? "").padStart(2, "0").slice(0, 2);
  return STATE_ABBR[fips] ?? null;
}

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

function projectedSettings(): Record<DemographicKey, ScenarioSetting> {
  return {
    whiteNH: { margin: BASELINE.groups.whiteNH.margin, turnout: 100 },
    black: { margin: BASELINE.groups.black.margin, turnout: 100 },
    hispanic: { margin: BASELINE.groups.hispanic.margin, turnout: 100 },
    asian: { margin: BASELINE.groups.asian.margin, turnout: 100 },
    other: { margin: BASELINE.groups.other.margin, turnout: 100 },
  };
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

function turnoutRate(shares: Record<DemographicKey, number> | undefined, groupTurnout: Record<DemographicKey, number>) {
  if (!shares) return 0;
  return GROUPS.reduce((sum, { key }) => sum + (Math.max(0, Number(shares[key] ?? 0)) / 100) * Math.max(0, groupTurnout[key] ?? 0), 0);
}

function leadCategory(margin: number) {
  if (margin >= .5) return "D";
  if (margin <= -.5) return "R";
  return "T";
}

function seatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function campaignFinanceEffect(index: number | null | undefined, baselineMargin: number, maxEffect: number) {
  if (index == null || !Number.isFinite(index)) return 0;
  const competitiveness = Math.exp(-Math.abs(baselineMargin) / 15);
  return index * maxEffect * competitiveness;
}
function money(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function StatewideMapFoundation() {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [bundle, setBundle] = useState<StatewideBundle | null>(null);
  const [demographics, setDemographics] = useState<StateDemographicBundle | null>(null);
  const [finance, setFinance] = useState<FinanceBundle | null>(null);
  const [racePolling, setRacePolling] = useState<RacePollingBundle | null>(null);
  const [financeMaxEffect, setFinanceMaxEffect] = useState(0.50);
  const [selectedState, setSelectedState] = useState("MI");
  const [settings, setSettings] = useState<Record<DemographicKey, ScenarioSetting>>(() => projectedSettings());
  const [overallTurnout, setOverallTurnout] = useState(BASELINE.overallTurnout);
  const [preserveNational, setPreserveNational] = useState(true);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewport = useSvgViewport({ x: 0, y: 0, width: 1000, height: 700 }, 180);

  async function load() {
    try {
      const [gResponse, rResponse, dResponse, fResponse, pResponse] = await Promise.all([
        fetch(`${BASE_PATH}/data/states.geojson?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/statewide-races.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/state-demographics.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/campaign-finance.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`${BASE_PATH}/data/race-polling.json?v=${Date.now()}`, { cache: "no-store" }),
      ]);
      let g = gResponse.ok ? await gResponse.json() : null;
      let fallback = false;
      if (!g?.features || g.features.length < 51) {
        g = await fetchStateGeometryFallback();
        fallback = Boolean(g);
      }
      const b = rResponse.ok ? await rResponse.json() : { convention: "positive = Democratic; negative = Republican", senate: [] };
      const d = dResponse.ok ? await dResponse.json() : null;
      const f = fResponse.ok ? await fResponse.json() : null;
      const p = pResponse.ok ? await pResponse.json() : null;
      setGeo(g);
      setBundle(b);
      setDemographics(d);
      setFinance(f);
      setRacePolling(p);
      if (!g) setLoadNote("State geometry is not available yet. Run the geometry refresh Action or retry from the browser.");
      else if (!d) setLoadNote("State map loaded, but state demographic data are unavailable; Senate demographic effects will stay neutral until the next successful refresh.");
      else if (fallback) setLoadNote("State geometry loaded directly from Census because the committed file was unavailable.");
      else setLoadNote(null);
    } catch (error) {
      setLoadNote(error instanceof Error ? error.message : "Could not load Senate scenario map");
    }
  }

  useEffect(() => { void load(); }, []);

  const bounds = useMemo(() => geo ? { main: boundsFor(geo.features, "main"), AK: boundsFor(geo.features, "AK"), HI: boundsFor(geo.features, "HI") } : null, [geo]);
  const races = bundle?.senate ?? [];
  const raceMap = useMemo(() => new Map(races.map((row) => [row.state.toUpperCase(), row])), [races]);
  const demoMap = useMemo(() => new Map(demographics?.states.map((row) => [row.id.toUpperCase(), row]) ?? []), [demographics]);
  const baselineSettings = useMemo(() => projectedSettings(), []);

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

  const baselineNationalDemoMargin = useMemo(() => demographicMargin(demographics?.nationalShares, baselineSettings), [demographics, baselineSettings]);
  const scenarioNationalDemoMargin = useMemo(() => demographicMargin(demographics?.nationalShares, settings), [demographics, settings]);
  const nationalDemoSwing = demographics ? scenarioNationalDemoMargin - baselineNationalDemoMargin : 0;

  const scenarios = useMemo(() => {
    const map = new Map<string, {
      row: RaceRow;
      margin: number;
      priorMargin: number;
      baselineMargin: number;
      scenarioShift: number;
      localDemoSwing: number;
      demographicEffect: number;
      financeEffect: number;
      turnoutRate: number;
      baselineTurnoutRate: number;
      projectedVotes: number | null;
    }>();
    for (const row of races) {
      const state = row.state.toUpperCase();
      const demoRow = demoMap.get(state);
      const baselineLocal = demographicMargin(demoRow?.shares, baselineSettings);
      const scenarioLocal = demographicMargin(demoRow?.shares, settings);
      const localDemoSwing = demographics ? scenarioLocal - baselineLocal : 0;
      const demographicEffect = preserveNational ? localDemoSwing - nationalDemoSwing : localDemoSwing;
      const financeEffect = campaignFinanceEffect(finance?.senate?.[state]?.index, row.margin, financeMaxEffect);
      const baselineMargin = row.margin + financeEffect;
      const margin = baselineMargin + demographicEffect;
      const stateTurnout = turnoutRate(demoRow?.shares, impliedTurnout);
      const baselineTurnout = turnoutRate(demoRow?.shares, baselineImpliedTurnout);
      const projectedVotes = demoRow?.totalCvapApprox && stateTurnout ? Math.round(demoRow.totalCvapApprox * stateTurnout / 100) : null;
      map.set(state, {
        row,
        margin,
        priorMargin: row.margin,
        baselineMargin,
        scenarioShift: margin - baselineMargin,
        localDemoSwing,
        demographicEffect,
        financeEffect,
        turnoutRate: stateTurnout,
        baselineTurnoutRate: baselineTurnout,
        projectedVotes,
      });
    }
    return map;
  }, [races, demoMap, baselineSettings, settings, demographics, preserveNational, nationalDemoSwing, impliedTurnout, baselineImpliedTurnout, finance, financeMaxEffect]);

  const counts = useMemo(() => {
    let d = 0, r = 0, toss = 0, dFlips = 0, rFlips = 0;
    for (const scenario of scenarios.values()) {
      const now = leadCategory(scenario.margin);
      const prior = leadCategory(scenario.baselineMargin);
      if (now === "D") d++; else if (now === "R") r++; else toss++;
      if (prior === "R" && now === "D") dFlips++;
      if (prior === "D" && now === "R") rFlips++;
    }
    return { d, r, toss, tracked: scenarios.size, dFlips, rFlips };
  }, [scenarios]);

  const baselineCounts = useMemo(() => {
    let d = 0, r = 0, toss = 0;
    for (const row of races) {
      const state = row.state.toUpperCase();
      const baselineMargin = row.margin + campaignFinanceEffect(finance?.senate?.[state]?.index, row.margin, financeMaxEffect);
      const lead = leadCategory(baselineMargin);
      if (lead === "D") d++; else if (lead === "R") r++; else toss++;
    }
    return { d, r, toss };
  }, [races, finance, financeMaxEffect]);

  const selectedScenario = scenarios.get(selectedState);
  const selectedDemo = demoMap.get(selectedState);
  const selectedFinance = finance?.senate?.[selectedState];
  const selectedPolling = racePolling?.senate?.[selectedState];
  const stateName = geo?.features.find((feature) => stateId(feature) === selectedState)?.properties?.NAME ?? selectedState;

  function setGroup(key: DemographicKey, field: "margin" | "turnout", value: number) {
    setSettings((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await paneRef.current?.requestFullscreen();
    } catch {}
  }

  return (
    <section className="shell card statewideMapCard senateScenarioCard">
      <div className="districtHeader">
        <div>
          <div className="eyebrow">2026 SENATE SCENARIO MAP</div>
          <h3>HillCast Senate prior + real-time racial margin and turnout adjustments</h3>
          <p className="small">The uploaded HillCast/Datawrapper Senate wrapper supplies the race-by-race prior. The same demographic projection baseline used by the House engine then estimates how changes in group vote margins and relative turnout redistribute each state&apos;s Senate margin.</p>
        </div>
        <div className="districtCounts">
          <span>D-led <b>{counts.d}</b> <em>{seatDelta(counts.d - baselineCounts.d)}</em></span>
          <span>R-led <b>{counts.r}</b> <em>{seatDelta(counts.r - baselineCounts.r)}</em></span>
          <span>Within 0.5 <b>{counts.toss}</b> <em>{seatDelta(counts.toss - baselineCounts.toss)}</em></span>
          <span>Races <b>{counts.tracked}</b></span>
        </div>
      </div>

      <div className="liveScenarioRibbon senateRibbon">
        <div><span>National demographic swing</span><b>{formatMargin(nationalDemoSwing)}</b></div>
        <div><span>Adjustment mode</span><b>{preserveNational ? "Geographic only" : "Full coalition"}</b></div>
        <div><span>D flips from prior</span><b>{counts.dFlips}</b></div>
        <div><span>R flips from prior</span><b>{counts.rFlips}</b></div>
        <div><span>HillCast wrapper</span><b>{bundle?.senateSourceAsOf ?? "Loaded"}</b></div>
      </div>

      <div className="demographicProjectionHeader senateDemoHeader">
        <div>
          <div className="eyebrow">SENATE DEMOGRAPHIC SCENARIO</div>
          <h4>Adjust projected group margins and turnout; every Senate race recalculates immediately</h4>
          <p className="small">The published 2026 demographic projection is the zero-change state. Moving White voters from R+9.5 to R+5.0, for example, is a 4.5-point Democratic shift within that group. Differential turnout changes each state according to its demographic composition.</p>
        </div>
        <label className="overallTurnoutControl">
          <span>Projected overall turnout</span>
          <strong>{overallTurnout.toFixed(1)}%</strong>
          <small>{BASELINE.turnoutMeasure}</small>
          <input type="range" min="35" max="65" step="0.1" value={overallTurnout} onChange={(event) => setOverallTurnout(Number(event.target.value))} />
          <small>Overall turnout changes vote volume; partisan margins move when turnout composition changes.</small>
        </label>
      </div>

      <div className="baselineMarginStrip">
        {GROUPS.map(({ key, label }) => <div key={key}><span>{label}</span><b>{formatMargin(BASELINE.groups[key].margin)}</b></div>)}
      </div>

      <div className="demographicSliders">
        {GROUPS.map(({ key, label }) => {
          const turnoutDelta = impliedTurnout[key] - BASELINE.overallTurnout;
          return <div className="demoSlider" key={key}>
            <strong>{label}</strong>
            <div className="demoBaselineLine"><span>Projected baseline</span><b>{formatMargin(BASELINE.groups[key].margin)}</b></div>
            <label>Scenario vote margin <span>{formatMargin(settings[key].margin)}</span>
              <input type="range" min="-100" max="100" step="0.5" value={settings[key].margin} onChange={(event) => setGroup(key, "margin", Number(event.target.value))} />
            </label>
            <label>Relative turnout <span>{settings[key].turnout}%</span>
              <input type="range" min="50" max="150" step="1" value={settings[key].turnout} onChange={(event) => setGroup(key, "turnout", Number(event.target.value))} />
            </label>
            <div className="impliedTurnout"><span>Implied group turnout</span><b>{impliedTurnout[key].toFixed(1)}%</b></div>
            <div className="sliderDelta"><span>Turnout vs baseline</span><b>{turnoutDelta >= 0 ? "+" : ""}{turnoutDelta.toFixed(1)} pt</b></div>
          </div>;
        })}
      </div>

      <div className="scenarioActions senateActions">
        <button type="button" onClick={() => { setSettings(projectedSettings()); setOverallTurnout(BASELINE.overallTurnout); }}>Reset to 2026 projection</button>
        <button type="button" className="toggle" onClick={() => setPreserveNational((value) => !value)}>{preserveNational ? "Preserve national Senate environment" : "Allow full national coalition swing"}</button>
        <label className="financeWeightControl">Campaign-finance max effect <strong>±{financeMaxEffect.toFixed(2)} pt</strong>
          <input type="range" min="0" max="2" step="0.05" value={financeMaxEffect} onChange={(event) => setFinanceMaxEffect(Number(event.target.value))} />
        </label>
        <span className="small">Preserve mode subtracts the national component of the demographic swing and applies only each state&apos;s relative geographic effect. The finance overlay is separately capped and shrinks in noncompetitive races; it uses FEC campaign resources, not AdImpact ad-spend data.</span>
      </div>

      <div className="statewideMapGrid">
        <div className="mapPane" ref={paneRef}>
          <div className="mapToolbar">
            <div className="mapToolbarTitle"><strong>2026 U.S. Senate scenario</strong><span>{viewport.zoomPercent}% zoom</span></div>
            <div className="mapToolbarButtons">
              <button type="button" aria-label="Zoom in" onClick={() => viewport.zoomCenter(svgRef.current, .78)}>＋</button>
              <button type="button" aria-label="Zoom out" onClick={() => viewport.zoomCenter(svgRef.current, 1.28)}>−</button>
              <button type="button" onClick={viewport.reset}>Reset</button>
              <button type="button" onClick={() => void toggleFullscreen()}>Fullscreen</button>
            </div>
          </div>
          <div className="mapInteractionHint">Scroll to zoom · drag to pan · click a state to inspect · map colors update with the sliders</div>
          {geo && bounds ? (
            <svg
              ref={svgRef}
              className={`statewideMap ${viewport.dragging ? "dragging" : ""}`}
              viewBox={`${viewport.view.x} ${viewport.view.y} ${viewport.view.width} ${viewport.view.height}`}
              role="img"
              aria-label="Interactive 2026 Senate demographic scenario map"
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
                const scenario = scenarios.get(id);
                const label = scenario
                  ? `${id}: ${formatMargin(scenario.margin)} scenario, ${formatMargin(scenario.priorMargin)} HillCast prior`
                  : `${id}: no 2026 Senate race in the loaded wrapper`;
                return <path
                  key={`${id}-${i}`}
                  d={pathFor(feature, bounds)}
                  fill={colorForMargin(scenario?.margin)}
                  fillRule="evenodd"
                  className={`stateShape ${selectedState === id ? "selected" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (viewport.shouldSuppressClick()) return;
                    setSelectedState(id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedState(id);
                    }
                  }}
                ><title>{label}</title></path>;
              })}
            </svg>
          ) : <div className="mapPlaceholder"><div>State geometry is not available in this deployment.</div><button className="secondary" onClick={() => void load()}>Retry Census map</button></div>}
          <div className="mapLegend"><span><i className="legendDStrong" />D+15</span><span><i className="legendD" />D+5</span><span><i className="legendT" />No race / tossup</span><span><i className="legendR" />R+5</span><span><i className="legendRStrong" />R+15</span></div>
        </div>

        <aside className="districtInspector">
          <div className="eyebrow">{selectedState}</div>
          <div className="statewideStateName">{stateName}</div>
          {selectedScenario ? <>
            <div className="districtMargin">{formatMargin(selectedScenario.margin)}</div>
            <div className="districtScenarioDelta">Demographic scenario shift <b>{formatMargin(selectedScenario.scenarioShift)}</b> from the finance-adjusted baseline</div>
            <div className="districtBreakdown">
              <div><span>HillCast Senate prior</span><b>{formatMargin(selectedScenario.priorMargin)}</b></div>
              <div><span>Finance overlay</span><b>{formatMargin(selectedScenario.financeEffect)}</b></div>
              <div><span>Finance-adjusted baseline</span><b>{formatMargin(selectedScenario.baselineMargin)}</b></div>
              <div><span>Local demographic swing</span><b>{formatMargin(selectedScenario.localDemoSwing)}</b></div>
              <div><span>National demographic swing</span><b>{formatMargin(nationalDemoSwing)}</b></div>
              <div><span>Applied demographic effect</span><b>{formatMargin(selectedScenario.demographicEffect)}</b></div>
              <div className="finalProjectionRow"><span>Scenario margin</span><b>{formatMargin(selectedScenario.margin)}</b></div>
            </div>
            <div className="turnoutInspector">
              <div><span>Estimated state turnout</span><b>{selectedScenario.turnoutRate ? `${selectedScenario.turnoutRate.toFixed(1)}%` : "—"}</b></div>
              <div><span>Baseline turnout</span><b>{selectedScenario.baselineTurnoutRate ? `${selectedScenario.baselineTurnoutRate.toFixed(1)}%` : "—"}</b></div>
              <div><span>Approx. votes cast</span><b>{selectedScenario.projectedVotes ? selectedScenario.projectedVotes.toLocaleString() : "—"}</b></div>
            </div>
            <p className="small"><strong>Republican:</strong> {selectedScenario.row.republican ?? "Not listed"}<br/><strong>Democrat:</strong> {selectedScenario.row.democrat ?? "Not listed"}{selectedScenario.row.other ? <><br/><strong>Other:</strong> {selectedScenario.row.other}</> : null}</p>
            <p className="small"><strong>Original HillCast rating:</strong> {selectedScenario.row.rating ?? "—"}</p>
            {(selectedScenario.row.democraticOdds != null || selectedScenario.row.republicanOdds != null) && <p className="small"><strong>Original HillCast win odds:</strong> D {selectedScenario.row.democraticOdds?.toFixed(1) ?? "—"}% · R {selectedScenario.row.republicanOdds?.toFixed(1) ?? "—"}%<br/><span className="small">Odds are reference values from the source wrapper and are not recalibrated by the scenario sliders.</span></p>}
            {selectedFinance && <div className="financeInspector">
              <strong>FEC campaign resources</strong>
              <div><span>Dem cash / spent</span><b>{money(selectedFinance.dem?.cashOnHand)} / {money(selectedFinance.dem?.disbursements)}</b></div>
              <div><span>Rep cash / spent</span><b>{money(selectedFinance.rep?.cashOnHand)} / {money(selectedFinance.rep?.disbursements)}</b></div>
              <div><span>Resource index</span><b>{selectedFinance.index == null ? "—" : `${selectedFinance.index > 0 ? "D" : "R"} ${Math.abs(selectedFinance.index).toFixed(2)}`}</b></div>
              {selectedFinance.adImpact && <>
                <div><span>AdImpact Dem / Rep spend</span><b>{money(selectedFinance.adImpact.demAdSpend)} / {money(selectedFinance.adImpact.repAdSpend)}</b></div>
                <div><span>Future reservations</span><b>{money(selectedFinance.adImpact.demFutureReservations)} / {money(selectedFinance.adImpact.repFutureReservations)}</b></div>
              </>}
              <small>Latest filing coverage varies by candidate. The signal is deliberately low-weight because spending and fundraising partly respond to race competitiveness.</small>
            </div>}
            {selectedPolling && selectedPolling.sources.length > 0 && <div className="pollMirrorInspector">
              <strong>Race polling mirrors</strong>
              {selectedPolling.sources.map((source) => <div key={source.id}><span>{source.name}</span><b>{formatMargin(source.margin)}</b></div>)}
              {selectedPolling.blend != null && <div><span>Mirror blend</span><b>{formatMargin(selectedPolling.blend)}</b></div>}
              <small>RCP is mirrored when an official average exists. VoteHub data-derived values use its public raw polling API and are labeled separately. Poll mirrors are not yet added to the forecast to avoid double-counting the HillCast prior.</small>
            </div>}
            {selectedDemo && <div className="demoShares">
              {GROUPS.map(({ key, label }) => <span key={key}>{label}<b>{(selectedDemo.shares[key] ?? 0).toFixed(1)}%</b></span>)}
            </div>}
          </> : <>
            <div className="statewideEmpty">No 2026 Senate race is listed for this state in the loaded HillCast wrapper.</div>
            {selectedDemo && <div className="demoShares">
              {GROUPS.map(({ key, label }) => <span key={key}>{label}<b>{(selectedDemo.shares[key] ?? 0).toFixed(1)}%</b></span>)}
            </div>}
          </>}
        </aside>
      </div>

      <div className="demographicSourceNote senateSourceNote">
        <strong>Senate model order:</strong> HillCast/Datawrapper race prior → small FEC campaign-resource overlay → demographic change relative to the same 2026 baseline used by the House engine → optional national normalization → scenario margin. The demographic layer is a scenario adjustment, not a replacement for the Senate forecast&apos;s candidate and state-specific fundamentals.
      </div>
      <p className="small districtFootnote">Gray states mean no 2026 Senate race in the loaded wrapper, not tossup. State demographics use the same Census-derived CVAP approximation as the House engine, aggregated to states when available. Current Senate wrapper: {bundle?.senateSourceFile ?? "none"}{bundle?.senateSourceAsOf ? ` (${bundle.senateSourceAsOf})` : ""}. {demographics?.methodNote ?? ""} {loadNote ?? ""}</p>
    </section>
  );
}
