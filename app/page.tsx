"use client";

import { useEffect, useMemo, useState } from "react";
import enthusiasmData from "@/data/echelon-enthusiasm.json";
import exitPollData from "@/data/exit-poll-calibration-2025.json";
import DistrictScenarioMap from "@/app/DistrictScenarioMap";
import {
  ELECTION_DATE_2026,
  HISTORICAL_GROUP_ORDER,
  allGroupForecasts,
  forecast,
  formatMargin,
  historicalGroups,
  modelMeta,
  type HistoricalGroupKey,
} from "@/lib/model";

type LiveSource = {
  id: string;
  name: string;
  status: "ok" | "fallback" | "error";
  dem?: number;
  rep?: number;
  margin?: number;
  asOf?: string;
  weight: number;
  sourceUrl: string;
  fetchedAt?: string;
  message?: string;
  note?: string;
  providerMode?: "published" | "api-derived" | "repository-variable" | string;
  providerDetail?: string;
  fetchWarning?: string;
};

type ApprovalSource = {
  id: string;
  name: string;
  status: "ok" | "fallback" | "error";
  approve?: number;
  disapprove?: number;
  net?: number;
  asOf?: string;
  label?: string;
  sourceUrl: string;
  fetchedAt?: string;
  message?: string;
  genericDem?: number;
  genericRep?: number;
  genericMargin?: number;
};

type LiveData = {
  generatedAt: string;
  calibration?: {
    id: string;
    label: string;
    note: string;
  };
  composite: {
    dem: number;
    rep: number;
    margin: number;
    asOf?: string;
    sourceCount: number;
    shareSourceCount?: number;
    method: string;
    label: string;
  };
  sources: LiveSource[];
  environment?: {
    rcpApproval?: ApprovalSource;
    echelon?: ApprovalSource;
  };
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function todayEasternish() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function clampDate(value: string) {
  if (!value) return todayEasternish();
  if (value > ELECTION_DATE_2026) return ELECTION_DATE_2026;
  return value;
}

function niceTimestamp(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function signed(value: number, digits = 1) {
  if (Math.abs(value) < 0.05) return "0.0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

function CorrectionChart({ selectedDays, group }: { selectedDays: number; group: HistoricalGroupKey }) {
  const points = historicalGroups[group].curve.filter((p) => p.daysToElection <= 180);
  const width = 760;
  const height = 240;
  const pad = 36;
  const minY = Math.min(-8, ...points.map((p) => p.meanCorrection));
  const maxY = Math.max(4, ...points.map((p) => p.meanCorrection));
  const x = (days: number) => pad + ((180 - days) / 180) * (width - pad * 2);
  const y = (value: number) => pad + ((maxY - value) / (maxY - minY)) * (height - pad * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.daysToElection)},${y(p.meanCorrection)}`)
    .join(" ");
  const selected = points.reduce((best, p) =>
    Math.abs(p.daysToElection - selectedDays) < Math.abs(best.daysToElection - selectedDays) ? p : best,
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${historicalGroups[group].label} historical remaining movement by days to election`}>
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="axis zero" />
      <line x1={pad} x2={pad} y1={pad} y2={height - pad} className="axis" />
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="axis" />
      <path d={path} className="curve" />
      <circle cx={x(selected.daysToElection)} cy={y(selected.meanCorrection)} r="6" className="dot" />
      {[180, 120, 60, 0].map((d) => (
        <text key={d} x={x(d)} y={height - 12} textAnchor="middle" className="chartLabel">{d}d</text>
      ))}
      <text x={pad + 4} y={y(0) - 7} className="chartLabel">No movement</text>
    </svg>
  );
}


function AggregateMirrorCard({ source, active, onUse }: { source?: LiveSource; active: boolean; onUse: () => void }) {
  if (!source) {
    return (
      <article className="mirrorCard unavailable">
        <div className="mirrorTop"><strong>Source unavailable</strong><span className="sourceStatus error">error</span></div>
        <div className="mirrorMargin">—</div>
        <p className="small">No deployed snapshot is available for this source yet.</p>
      </article>
    );
  }
  const statusLabel = source.status === "ok" ? "live" : source.status === "fallback" ? "cached" : "unavailable";
  return (
    <article className={`mirrorCard ${active ? "active" : ""}`}>
      <div className="mirrorTop">
        <strong>{source.name}</strong>
        <span className={`sourceStatus ${source.status}`}>{statusLabel}</span>
      </div>
      <div className="mirrorMargin">{source.margin !== undefined ? formatMargin(source.margin) : "—"}</div>
      {source.dem !== undefined && source.rep !== undefined ? (
        <div className="mirrorShares"><span>D {source.dem.toFixed(1)}</span><span>R {source.rep.toFixed(1)}</span></div>
      ) : source.margin !== undefined ? (
        <div className="mirrorShares"><span>Published margin only</span></div>
      ) : (
        <div className="mirrorShares"><span>Awaiting a usable topline</span></div>
      )}
      <div className="mirrorMeta">As of {source.asOf ?? "latest deployed snapshot"}</div>
      {source.providerMode && <div className="mirrorMeta">Mode: {source.providerMode}</div>}
      <div className="mirrorActions">
        <button className="mirrorUse" onClick={onUse} disabled={source.margin === undefined}>Use in model</button>
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
      </div>
    </article>
  );
}

function ApprovalCard({ source }: { source?: ApprovalSource }) {
  if (!source) {
    return <article className="miniCard"><div className="eyebrow">APPROVAL</div><p className="small">No approval source was loaded.</p></article>;
  }
  return (
    <article className="miniCard">
      <div className="miniTop">
        <div className="eyebrow">{source.name}</div>
        <span className={`sourceStatus ${source.status}`}>{source.status}</span>
      </div>
      {source.approve !== undefined && source.disapprove !== undefined ? (
        <>
          <div className="approvalSplit"><b>{source.approve.toFixed(1)}%</b><span>approve</span><b>{source.disapprove.toFixed(1)}%</b><span>disapprove</span></div>
          <div className="approvalNet">Net approval: <strong>{signed(source.approve - source.disapprove)}</strong></div>
          <p className="small">As of {source.asOf ?? "latest available"}{source.label ? ` · ${source.label}` : ""}</p>
          {source.genericDem !== undefined && source.genericRep !== undefined && (
            <p className="small">Same Echelon release generic ballot: D {source.genericDem.toFixed(0)} / R {source.genericRep.toFixed(0)}</p>
          )}
        </>
      ) : <p className="small">Unavailable in this build.</p>}
      <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
    </article>
  );
}

export default function Home() {
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState("composite");
  const [dem, setDem] = useState(48.0);
  const [rep, setRep] = useState(42.3);
  const [snapshotDate, setSnapshotDate] = useState(clampDate(todayEasternish()));
  const [medianMode, setMedianMode] = useState(false);
  const [historicalGroup, setHistoricalGroup] = useState<HistoricalGroupKey>("midterm");

  useEffect(() => {
    fetch(`${BASE_PATH}/data/live-aggregates.json?v=${Date.now()}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: LiveData) => {
        setLiveData(data);
        setDem(data.composite.dem);
        setRep(data.composite.rep);
        setSnapshotDate(clampDate(data.composite.asOf ?? todayEasternish()));
      })
      .catch((error) => setLiveError(error instanceof Error ? error.message : "Could not load live aggregate data"));
  }, []);

  const result = useMemo(
    () => forecast(dem, rep, snapshotDate, medianMode, historicalGroup),
    [dem, rep, snapshotDate, medianMode, historicalGroup],
  );

  const comparisons = useMemo(
    () => allGroupForecasts(dem, rep, snapshotDate, medianMode),
    [dem, rep, snapshotDate, medianMode],
  );

  const usableSources = liveData?.sources.filter(
    (source) => source.status !== "error" && source.margin !== undefined,
  ) ?? [];

  const mirrorIds = ["rcp", "votehub", "hillcast", "afi"];
  const mirrorSources = mirrorIds.map((id) => liveData?.sources.find((source) => source.id === id));

  function applySource(id: string) {
    setSelectedSource(id);
    if (!liveData) return;
    if (id === "composite") {
      setDem(liveData.composite.dem);
      setRep(liveData.composite.rep);
      setSnapshotDate(clampDate(liveData.composite.asOf ?? todayEasternish()));
      return;
    }
    const source = liveData.sources.find((item) => item.id === id);
    if (!source || source.margin === undefined) return;
    if (source.dem !== undefined && source.rep !== undefined) {
      setDem(source.dem);
      setRep(source.rep);
    } else {
      // Margin-only sources (currently HillCast, and optionally AFI) use the
      // composite's observed D+R total so the model can preserve undecided/other
      // support without inventing a new major-party participation level.
      const majorPartyTotal = liveData.composite.dem + liveData.composite.rep;
      setDem((majorPartyTotal + source.margin) / 2);
      setRep((majorPartyTotal - source.margin) / 2);
    }
    setSnapshotDate(clampDate(source.asOf ?? todayEasternish()));
  }

  const allFresh = liveData?.sources.some((source) => source.status === "ok");
  const currentSourceLabel = selectedSource === "composite"
    ? liveData?.composite.label ?? "Configured aggregate composite"
    : liveData?.sources.find((source) => source.id === selectedSource)?.name ?? "Manual input";

  const enthusiasmStart = enthusiasmData.series[0];
  const enthusiasmLatest = enthusiasmData.series[enthusiasmData.series.length - 1];
  const latestGap = enthusiasmLatest.democrats - enthusiasmLatest.republicans;
  const startingGap = enthusiasmStart.democrats - enthusiasmStart.republicans;

  return (
    <main>
      <section className="hero shell">
        <div className="eyebrow">HOUSE GENERIC BALLOT + ELECTORAL ENVIRONMENT</div>
        <h1>Election Path <span>2026</span></h1>
        <p className="lede">
          A transparent historical-path model for the national House vote, with live polling aggregates, presidential-approval context, turnout enthusiasm, and separate presidential/midterm calibration filters.
        </p>
      </section>

      <section className="shell grid two">
        <article className="card liveCard">
          <div className="cardTop">
            <div><div className="eyebrow">CURRENT GENERIC INPUT</div><h2>{formatMargin(dem - rep)}</h2></div>
            <span className={`status ${allFresh ? "live" : "fallback"}`}>{allFresh ? "AUTO-REFRESHED" : liveData ? "FALLBACK DATA" : "LOADING"}</span>
          </div>
          <div className="shares"><div><b>{dem.toFixed(1)}%</b><span>Democrats</span></div><div><b>{rep.toFixed(1)}%</b><span>Republicans</span></div></div>
          <div className="sourceLine"><span>Input source</span><strong>{currentSourceLabel}</strong></div>
          <p className="small">{liveData ? `Data file generated ${niceTimestamp(liveData.generatedAt)}. ${liveData.composite.sourceCount} margin source${liveData.composite.sourceCount === 1 ? "" : "s"} feed the composite${liveData.composite.shareSourceCount ? `; ${liveData.composite.shareSourceCount} provide full D/R shares` : ""}.` : liveError ? `Static data file could not be loaded: ${liveError}` : "Loading the latest deployed aggregate snapshot…"}</p>
        </article>

        <article className="card forecastCard">
          <div className="eyebrow">PROJECTED ELECTION-DAY MARGIN · {result.groupMeta.label.toUpperCase()}</div>
          <div className="forecastNumber">{formatMargin(result.projectedMargin)}</div>
          <div className="movement">Historical remaining movement: <strong>{formatMargin(result.correction)}</strong></div>
          <div className="range">Analog range: {formatMargin(result.rangeLow)} to {formatMargin(result.rangeHigh)}</div>
          <p className="small">{result.days} days until Nov. 3, 2026 · {result.point.cycles} usable historical cycles at this date</p>
        </article>
      </section>

      <section className="shell card aggregateMirrorSection">
        <div className="cardTop">
          <div>
            <div className="eyebrow">AGGREGATE MIRRORS</div>
            <h3>Compare the four national generic-ballot feeds side by side</h3>
          </div>
          <div className="compositeBadge">Composite: <strong>{liveData ? formatMargin(liveData.composite.margin) : "Loading…"}</strong></div>
        </div>
        <p className="small">These cards mirror only each provider’s deployed topline or published net margin; they do not copy the provider’s page or methodology. “Cached” means the last known snapshot is being shown because the automatic fetch did not complete.</p>
        <div className="mirrorGrid">
          {mirrorSources.map((source, index) => (
            <AggregateMirrorCard
              key={mirrorIds[index]}
              source={source}
              active={selectedSource === mirrorIds[index]}
              onUse={() => applySource(mirrorIds[index])}
            />
          ))}
        </div>
      </section>

      <section className="shell card controls">
        <div><div className="eyebrow">WHAT-IF / MODEL CONTROL</div><h3>Choose the polling source and historical electorate</h3></div>
        <div className="controlGrid sixControls">
          <label>Aggregate input
            <select value={selectedSource} onChange={(e) => applySource(e.target.value)} disabled={!liveData}>
              <option value="composite">Composite ({liveData?.composite.sourceCount ?? 0} sources)</option>
              {selectedSource === "manual" && <option value="manual">Manual what-if</option>}
              {usableSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </label>
          <label>Historical filter
            <select value={historicalGroup} onChange={(e) => setHistoricalGroup(e.target.value as HistoricalGroupKey)}>
              <option value="presidential">Presidential</option>
              <option value="midterm">Midterm</option>
              <option value="overall">Overall</option>
              <option value="low_turnout_midterm">Low Turnout Midterm</option>
              <option value="high_turnout_midterm">High Turnout Midterm</option>
            </select>
          </label>
          <label>Snapshot date<input type="date" max={ELECTION_DATE_2026} value={snapshotDate} onChange={(e) => setSnapshotDate(clampDate(e.target.value))} /></label>
          <label>Democratic share<input type="number" step="0.1" min="0" max="100" value={dem} onChange={(e) => { setSelectedSource("manual"); setDem(Number(e.target.value)); }} /></label>
          <label>Republican share<input type="number" step="0.1" min="0" max="100" value={rep} onChange={(e) => { setSelectedSource("manual"); setRep(Number(e.target.value)); }} /></label>
          <label className="toggleLabel">Historical estimator<button className="toggle" onClick={() => setMedianMode((v) => !v)}>{medianMode ? "Median correction" : "Mean correction"}</button></label>
        </div>
        <p className="small"><strong>{result.groupMeta.label}:</strong> {result.groupMeta.description} Years: {result.groupMeta.years.join(", ")}.</p>
      </section>

      <section className="shell card">
        <div className="eyebrow">FIVE HISTORICAL LENSES</div>
        <h3>Same live ballot, different historical comparison sets</h3>
        <div className="lensGrid">
          {comparisons.map((item) => (
            <button key={item.group} className={`lens ${item.group === historicalGroup ? "active" : ""}`} onClick={() => setHistoricalGroup(item.group)}>
              <span>{item.groupMeta.label}</span>
              <b>{formatMargin(item.projectedMargin)}</b>
              <small>{formatMargin(item.correction)} remaining move · n={item.point.cycles}</small>
            </button>
          ))}
        </div>
        <p className="small">“Overall” pools all 11 supplied RCP cycles. The presidential filter adds 2004, 2008, 2012, 2016, 2020, and 2024 to the historical comparison rather than treating midterms as the only useful analogs.</p>
      </section>

      <section className="shell card environmentCard">
        <div className="eyebrow">PRESIDENTIAL APPROVAL + TURNOUT CONTEXT</div>
        <h3>Keep approval intensity and enthusiasm visible beside the generic ballot</h3>
        <div className="environmentGrid">
          <ApprovalCard source={liveData?.environment?.rcpApproval} />
          <ApprovalCard source={liveData?.environment?.echelon} />
          <article className="miniCard enthusiasmCard">
            <div className="eyebrow">ECHELON · EXTREMELY MOTIVATED</div>
            <div className="enthusiasmMain">D {enthusiasmLatest.democrats}% · R {enthusiasmLatest.republicans}%</div>
            <div className="approvalNet">Current D–R enthusiasm gap: <strong>+{latestGap}</strong></div>
            <div className="enthusiasmRows">
              <span>Total {enthusiasmLatest.total}%</span><span>Independent {enthusiasmLatest.independents}%</span>
            </div>
            <p className="small">The supplied Echelon chart shows the D–R “extremely motivated” gap narrowing from {startingGap} points in {enthusiasmStart.label} to {latestGap} points in {enthusiasmLatest.label}. This is shown as turnout context, not treated as a literal turnout probability.</p>
          </article>
        </div>
      </section>

      <section className="shell card calibrationCard">
        <div className="eyebrow">2025 ACTUAL-ELECTORATE CHECK</div>
        <h3>Trump approval among voters who actually cast ballots</h3>
        <p className="small">CNN says these Voter Poll / SSRS exit polls combine pre-election and polling-place interviews and are ultimately weighted to match the election results. They provide a useful comparison between ordinary approval polling and approval inside a realized electorate.</p>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Electorate</th><th>Trump approve</th><th>Trump disapprove</th><th>Net</th><th>Strong A / Strong D</th><th>Contest result</th></tr></thead>
            <tbody>
              {exitPollData.rows.map((row) => (
                <tr key={row.place}>
                  <td><b>{row.place}</b><div className="cellSub">{row.contest} · n={row.respondents.toLocaleString()}</div></td>
                  <td>{row.approve}%</td><td>{row.disapprove}%</td><td>{signed(row.approve - row.disapprove, 0)}</td>
                  <td>{row.stronglyApprove}% / {row.stronglyDisapprove}%</td><td>{row.electionMarginLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">These rows are calibration observations, not a rule that approval net must equal a race margin. New York City was a multi-candidate mayoral election and California was a ballot measure, so the site does not force them into a two-party margin comparison.</p>
      </section>

      <section className="shell card sourceCard">
        <div className="eyebrow">SOURCE DETAILS</div>
        <h3>Fetch status, provider mode, and methodology notes for each aggregate</h3>
        <div className="sourceGrid">
          {liveData?.sources.map((source) => (
            <article className="sourceTile" key={source.id}>
              <div className="sourceTileTop"><strong>{source.name}</strong><span className={`sourceStatus ${source.status}`}>{source.status}</span></div>
              {source.margin !== undefined ? <div className="sourceMargin">{formatMargin(source.margin)}</div> : <div className="sourceMargin">Unavailable</div>}
              {source.dem !== undefined && source.rep !== undefined
                ? <div className="small">D {source.dem.toFixed(1)} · R {source.rep.toFixed(1)} · weight {source.weight}</div>
                : source.margin !== undefined ? <div className="small">Margin-only source · weight {source.weight}</div> : null}
              {source.providerMode && <div className="small"><strong>Mode:</strong> {source.providerMode === "published" ? "published average" : source.providerMode === "api-derived" ? "VoteHub API-derived blend" : source.providerMode === "repository-variable" ? "topline via repository variables" : source.providerMode === "published-margin" ? "published margin" : source.providerMode === "repository-variable-margin" ? "margin via repository variables" : source.providerMode}</div>}
              {source.providerDetail && <p className="sourceNote">{source.providerDetail}</p>}
              {source.fetchWarning && <div className="sourceMessage">Automatic fallback note: {source.fetchWarning}</div>}
              {source.message && <div className="sourceMessage">Fetch note: {source.message}</div>}
              {source.note && <p className="sourceNote">{source.note}</p>}
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
            </article>
          )) ?? <p className="small">Loading…</p>}
        </div>
      </section>


      <DistrictScenarioMap rawNationalMargin={dem - rep} projectedNationalMargin={result.projectedMargin} />

      <section className="shell card chartCard">
        <div className="chartHeader">
          <div><div className="eyebrow">THE HISTORICAL PATH · {result.groupMeta.label.toUpperCase()}</div><h3>Average remaining margin movement</h3></div>
          <div className="chartCallout">At {result.days} days: <b>{formatMargin(result.correction)}</b></div>
        </div>
        <CorrectionChart selectedDays={result.days} group={historicalGroup} />
        <p className="small">Below zero means the eventual national House vote was more Republican than the polling snapshot; above zero means it was more Democratic. The line changes when you switch historical filters.</p>
      </section>

      <section className="shell card">
        <div className="eyebrow">HISTORICAL ANALOGS</div>
        <h3>{result.groupMeta.label}: what happened from this same point?</h3>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Cycle</th><th>Type</th><th>Turnout</th><th>Snapshot</th><th>Final vote</th><th>Movement</th><th>Polls</th></tr></thead>
            <tbody>
              {result.point.analogs.map((a) => (
                <tr key={a.year}>
                  <td>{a.year}</td><td>{a.cycleType === "presidential" ? "Presidential" : "Midterm"}</td>
                  <td>{a.turnoutCVAP ? `${a.turnoutCVAP.toFixed(1)}%` : "—"}</td>
                  <td>{formatMargin(a.snapshotMargin)}</td><td>{formatMargin(a.finalMargin)}</td>
                  <td className={a.correction >= 0 ? "demText" : "repText"}>{formatMargin(a.correction)}</td><td>{a.pollCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="shell grid two methodology">
        <article className="card">
          <div className="eyebrow">TURNOUT SPLIT</div>
          <h3>Low: 2006, 2010, 2014 · High: 2018, 2022</h3>
          <p>The turnout split uses Census citizen voting-age turnout. 2006 was 47.8%, 2010 45.5%, 2014 41.9%, 2018 53.4%, and 2022 52.2%. The model uses 50% as the transparent dividing line.</p>
        </article>
        <article className="card">
          <div className="eyebrow">METHOD</div>
          <p>{modelMeta.method}</p>
          <p className="small">This is a historical-path extrapolator, not a conventional probabilistic forecast. Differences between a late-summer poll and the final vote can reflect both genuine opinion movement and polling error.</p>
        </article>
      </section>

      <footer className="shell">
        Historical generic-ballot cycles: 2004–2024. Live generic filters and topline mirrors: RealClearPolling, VoteHub, HillCast, America First Insight, composite, and manual what-if. Margin-only sources affect the composite margin while D/R support levels remain anchored to sources that publish both party shares. Approval and enthusiasm are displayed as independent context rather than silently folded into the House-vote correction. This project is not affiliated with any polling provider.
      </footer>
    </main>
  );
}
