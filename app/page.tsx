"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ELECTION_DATE_2026,
  forecast,
  formatMargin,
  historicalCurve,
  modelMeta,
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
};

type LiveData = {
  generatedAt: string;
  composite: {
    dem: number;
    rep: number;
    margin: number;
    asOf?: string;
    sourceCount: number;
    method: string;
    label: string;
  };
  sources: LiveSource[];
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

function CorrectionChart({ selectedDays }: { selectedDays: number }) {
  const points = historicalCurve.filter((p) => p.daysToElection <= 180);
  const width = 760;
  const height = 240;
  const pad = 36;
  const minY = Math.min(-8, ...points.map((p) => p.meanCorrection));
  const maxY = Math.max(4, ...points.map((p) => p.meanCorrection));
  const x = (days: number) => pad + ((180 - days) / 180) * (width - pad * 2);
  const y = (value: number) =>
    pad + ((maxY - value) / (maxY - minY)) * (height - pad * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.daysToElection)},${y(p.meanCorrection)}`)
    .join(" ");
  const selected = points.reduce((best, p) =>
    Math.abs(p.daysToElection - selectedDays) < Math.abs(best.daysToElection - selectedDays)
      ? p
      : best,
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Average historical remaining movement by days to election">
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="axis zero" />
      <line x1={pad} x2={pad} y1={pad} y2={height - pad} className="axis" />
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="axis" />
      <path d={path} className="curve" />
      <circle cx={x(selected.daysToElection)} cy={y(selected.meanCorrection)} r="6" className="dot" />
      {[180, 120, 60, 0].map((d) => (
        <text key={d} x={x(d)} y={height - 12} textAnchor="middle" className="chartLabel">
          {d}d
        </text>
      ))}
      <text x={pad + 4} y={y(0) - 7} className="chartLabel">No movement</text>
    </svg>
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
      .catch((error) => {
        setLiveError(error instanceof Error ? error.message : "Could not load live aggregate data");
      });
  }, []);

  const result = useMemo(
    () => forecast(dem, rep, snapshotDate, medianMode),
    [dem, rep, snapshotDate, medianMode],
  );

  const analogs = result.point.analogs;
  const usableSources = liveData?.sources.filter(
    (source) => source.status !== "error" && source.dem !== undefined && source.rep !== undefined,
  ) ?? [];

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
    if (source?.dem !== undefined && source.rep !== undefined) {
      setDem(source.dem);
      setRep(source.rep);
      setSnapshotDate(clampDate(source.asOf ?? todayEasternish()));
    }
  }

  const allFresh = liveData?.sources.some((source) => source.status === "ok");
  const currentSourceLabel = selectedSource === "composite"
    ? liveData?.composite.label ?? "Configured aggregate composite"
    : liveData?.sources.find((source) => source.id === selectedSource)?.name ?? "Manual input";

  return (
    <main>
      <section className="hero shell">
        <div className="eyebrow">HOUSE GENERIC BALLOT MODEL</div>
        <h1>Election Path <span>2026</span></h1>
        <p className="lede">
          A static GitHub Pages forecast that refreshes its aggregate inputs through scheduled GitHub Actions, then asks what a generic-ballot margin at this point in a midterm historically became by Election Day.
        </p>
      </section>

      <section className="shell grid two">
        <article className="card liveCard">
          <div className="cardTop">
            <div>
              <div className="eyebrow">CURRENT INPUT</div>
              <h2>{formatMargin(dem - rep)}</h2>
            </div>
            <span className={`status ${allFresh ? "live" : "fallback"}`}>
              {allFresh ? "AUTO-REFRESHED" : liveData ? "FALLBACK DATA" : "LOADING"}
            </span>
          </div>
          <div className="shares">
            <div><b>{dem.toFixed(1)}%</b><span>Democrats</span></div>
            <div><b>{rep.toFixed(1)}%</b><span>Republicans</span></div>
          </div>
          <div className="sourceLine">
            <span>Input source</span>
            <strong>{currentSourceLabel}</strong>
          </div>
          <p className="small">
            {liveData
              ? `Data file generated ${niceTimestamp(liveData.generatedAt)}. ${liveData.composite.sourceCount} source${liveData.composite.sourceCount === 1 ? "" : "s"} currently feed the composite.`
              : liveError
                ? `Static data file could not be loaded: ${liveError}`
                : "Loading the latest deployed aggregate snapshot…"}
          </p>
        </article>

        <article className="card forecastCard">
          <div className="eyebrow">PROJECTED ELECTION-DAY MARGIN</div>
          <div className="forecastNumber">{formatMargin(result.projectedMargin)}</div>
          <div className="movement">
            Historical remaining movement: <strong>{formatMargin(result.correction)}</strong>
          </div>
          <div className="range">
            Analog range: {formatMargin(result.rangeLow)} to {formatMargin(result.rangeHigh)}
          </div>
          <p className="small">{result.days} days until the Nov. 3, 2026 election · {result.point.cycles} historical cycles available</p>
        </article>
      </section>

      <section className="shell card controls">
        <div>
          <div className="eyebrow">WHAT-IF / SOURCE CONTROL</div>
          <h3>Choose an aggregate, date, or manual ballot reading</h3>
        </div>
        <div className="controlGrid fiveControls">
          <label>
            Aggregate input
            <select value={selectedSource} onChange={(e) => applySource(e.target.value)} disabled={!liveData}>
              <option value="composite">Composite ({liveData?.composite.sourceCount ?? 0} sources)</option>
              {selectedSource === "manual" && <option value="manual">Manual what-if</option>}
              {usableSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </label>
          <label>
            Snapshot date
            <input type="date" max={ELECTION_DATE_2026} value={snapshotDate} onChange={(e) => setSnapshotDate(clampDate(e.target.value))} />
          </label>
          <label>
            Democratic share
            <input type="number" step="0.1" min="0" max="100" value={dem} onChange={(e) => { setSelectedSource("manual"); setDem(Number(e.target.value)); }} />
          </label>
          <label>
            Republican share
            <input type="number" step="0.1" min="0" max="100" value={rep} onChange={(e) => { setSelectedSource("manual"); setRep(Number(e.target.value)); }} />
          </label>
          <label className="toggleLabel">
            Historical estimator
            <button className="toggle" onClick={() => setMedianMode((v) => !v)}>
              {medianMode ? "Median correction" : "Mean correction"}
            </button>
          </label>
        </div>
        {liveData && (
          <button className="secondary" onClick={() => applySource("composite")}>
            Reset to deployed composite
          </button>
        )}
      </section>

      <section className="shell card sourceCard">
        <div className="cardTop">
          <div>
            <div className="eyebrow">AGGREGATE FEEDS</div>
            <h3>Data sources included in this deployment</h3>
          </div>
          <div className="small">Composite method: weighted mean</div>
        </div>
        <div className="sourceGrid">
          {(liveData?.sources ?? []).map((source) => (
            <article className="sourceTile" key={source.id}>
              <div className="sourceTileTop">
                <strong>{source.name}</strong>
                <span className={`sourceStatus ${source.status}`}>{source.status}</span>
              </div>
              {source.dem !== undefined && source.rep !== undefined ? (
                <>
                  <div className="sourceMargin">{formatMargin(source.dem - source.rep)}</div>
                  <div className="small">D {source.dem.toFixed(1)} · R {source.rep.toFixed(1)} · weight {source.weight}</div>
                  <div className="small">As of {source.asOf ?? "not supplied"}</div>
                </>
              ) : (
                <div className="small">No usable reading in the current deployment.</div>
              )}
              {source.message && <div className="sourceMessage">{source.message}</div>}
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>
            </article>
          ))}
          {!liveData && <div className="small">No deployed feed metadata loaded yet.</div>}
        </div>
      </section>

      <section className="shell card chartCard">
        <div className="chartHeader">
          <div>
            <div className="eyebrow">THE HISTORICAL PATH</div>
            <h3>Average remaining margin movement</h3>
          </div>
          <div className="chartCallout">At {result.days} days: <b>{formatMargin(result.correction)}</b></div>
        </div>
        <CorrectionChart selectedDays={result.days} />
        <p className="small">
          Below zero means the eventual national House vote was more Republican than the polling snapshot; above zero means it was more Democratic.
        </p>
      </section>

      <section className="shell card">
        <div className="eyebrow">HISTORICAL ANALOGS</div>
        <h3>What happened from this same point in past midterms?</h3>
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>Cycle</th><th>Snapshot</th><th>Final vote</th><th>Movement</th><th>Polls</th></tr>
            </thead>
            <tbody>
              {analogs.map((a) => (
                <tr key={a.year}>
                  <td>{a.year}</td>
                  <td>{formatMargin(a.snapshotMargin)}</td>
                  <td>{formatMargin(a.finalMargin)}</td>
                  <td className={a.correction >= 0 ? "demText" : "repText"}>{formatMargin(a.correction)}</td>
                  <td>{a.pollCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="shell grid two methodology">
        <article className="card">
          <div className="eyebrow">SHARE PROJECTION</div>
          <h3>{result.projectedDem.toFixed(1)}% D · {result.projectedRep.toFixed(1)}% R</h3>
          <p>
            The margin forecast is translated into vote shares using the five-cycle average final major-party vote total, leaving {result.projectedOther.toFixed(1)}% for other parties.
          </p>
        </article>
        <article className="card">
          <div className="eyebrow">METHOD</div>
          <p>{modelMeta.method}</p>
          <p className="small">
            This is a historical-path extrapolator, not a conventional probabilistic forecast. Movement after the snapshot can be real opinion change as well as polling error.
          </p>
        </article>
      </section>

      <footer className="shell">
        Historical cycles: 2006, 2010, 2014, 2018, 2022 · Aggregate feeds are configured by the site owner. This project is not affiliated with RealClearPolitics or any configured provider.
      </footer>
    </main>
  );
}
