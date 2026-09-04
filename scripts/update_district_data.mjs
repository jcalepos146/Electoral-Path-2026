import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPLOAD_DIR = path.join(ROOT, "data", "hillcast_uploads");
const PUBLIC_DIR = path.join(ROOT, "public", "data");
const LIVE_PATH = path.join(PUBLIC_DIR, "live-aggregates.json");
const LAST_HILLCAST = path.join(ROOT, "data", "last-known-hillcast.json");

const CENSUS_ACS_BASE = "https://api.census.gov/data/2024/acs/acs5";

const STATE_ABBR = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ""; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift()?.map((x) => x.trim()) ?? [];
  return rows.filter((r) => r.some((x) => x.trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function marginNumber(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "TIE") return 0;
  const match = raw.match(/^([DR])\s*\+?\s*([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) throw new Error(`Unrecognized projected margin: ${value}`);
  const n = Number(match[2]);
  return match[1] === "D" ? n : -n;
}

function pct(value) {
  const n = Number(String(value ?? "").replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function datedName(name) {
  const m = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function latestCsv() {
  const files = (await fs.readdir(UPLOAD_DIR)).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (!files.length) throw new Error(`No HillCast CSV files found in ${UPLOAD_DIR}`);
  const ranked = await Promise.all(files.map(async (name) => {
    const stat = await fs.stat(path.join(UPLOAD_DIR, name));
    return { name, date: datedName(name), mtime: stat.mtimeMs };
  }));
  ranked.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.mtime - a.mtime);
  return ranked[0];
}

async function hillcastNationalMargin() {
  try {
    const live = JSON.parse(await fs.readFile(LIVE_PATH, "utf8"));
    const source = live.sources?.find((s) => s.id === "hillcast" && Number.isFinite(s.margin));
    if (source) return { margin: Number(source.margin), asOf: source.asOf ?? null, source: "live-aggregates" };
  } catch {}
  const fallback = JSON.parse(await fs.readFile(LAST_HILLCAST, "utf8"));
  return { margin: Number(fallback.margin), asOf: fallback.asOf ?? null, source: "last-known-hillcast" };
}

async function buildHillcastBundle() {
  const latest = await latestCsv();
  const raw = await fs.readFile(path.join(UPLOAD_DIR, latest.name), "utf8");
  const rows = parseCsv(raw);
  const required = ["District", "Projected Margin", "Republican Odds", "Democratic Odds", "Rating"];
  for (const col of required) if (!Object.prototype.hasOwnProperty.call(rows[0] ?? {}, col)) throw new Error(`HillCast CSV is missing required column ${col}`);
  const districts = rows.map((r) => ({
    id: String(r.District).trim().toUpperCase(),
    republican: String(r.Republican ?? "").trim() || null,
    democrat: String(r.Democrat ?? "").trim() || null,
    margin: marginNumber(r["Projected Margin"]),
    marginLabel: String(r["Projected Margin"]).trim(),
    republicanOdds: pct(r["Republican Odds"]),
    democraticOdds: pct(r["Democratic Odds"]),
    rating: String(r.Rating ?? "").trim() || null,
  }));
  const ids = new Set(districts.map((d) => d.id));
  if (ids.size !== districts.length) throw new Error(`HillCast CSV contains duplicate district IDs (${districts.length} rows, ${ids.size} unique)`);
  if (districts.length < 430) throw new Error(`HillCast CSV only contains ${districts.length} districts; expected a near-complete House map`);
  const national = await hillcastNationalMargin();
  const bundle = {
    generatedAt: new Date().toISOString(),
    sourceFile: latest.name,
    sourceAsOf: latest.date,
    districtCount: districts.length,
    hillcastNationalMargin: national.margin,
    hillcastNationalAsOf: national.asOf,
    hillcastNationalSource: national.source,
    convention: "Positive margins are Democratic; negative margins are Republican.",
    districts,
  };
  await fs.writeFile(path.join(PUBLIC_DIR, "hillcast-districts.json"), JSON.stringify(bundle, null, 2) + "\n");
  return bundle;
}

function citizen18Vars(suffix = "") {
  const prefix = `B05003${suffix}`;
  return [`${prefix}_009E`, `${prefix}_011E`, `${prefix}_020E`, `${prefix}_022E`];
}

async function fetchJson(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": process.env.ELECTION_PATH_USER_AGENT || "ElectionPath2026/1.0",
          "Accept": "application/geo+json, application/json;q=0.9, */*;q=0.1",
        },
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
      return await r.json();
    } catch (e) {
      lastError = e;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}`);
}

function sumVars(record, headers, variables) {
  return variables.reduce((sum, v) => {
    const idx = headers.indexOf(v);
    const n = idx >= 0 ? Number(record[idx]) : 0;
    return sum + (Number.isFinite(n) && n >= 0 ? n : 0);
  }, 0);
}

function districtId(stateFips, cd) {
  const abbr = STATE_ABBR[stateFips];
  if (!abbr) return null;
  const district = cd === "00" ? "01" : String(cd).padStart(2, "0");
  return `${abbr}-${district}`;
}

async function buildDemographics() {
  // Small ACS API approximation of CVAP. White uses non-Hispanic White; Black and Asian are race-alone tables,
  // Hispanic is Hispanic/Latino. Because those latter categories are not fully mutually exclusive, shares are
  // normalized before the scenario engine uses them. The UI discloses this approximation.
  const vars = [
    ...citizen18Vars(""),
    ...citizen18Vars("H"),
    ...citizen18Vars("B"),
    ...citizen18Vars("D"),
    ...citizen18Vars("I"),
  ];
  const url = `${CENSUS_ACS_BASE}?get=NAME,${vars.join(",")}&for=congressional%20district:*&in=state:*`;
  const data = await fetchJson(url);
  const headers = data[0];
  const stateIdx = headers.indexOf("state");
  const cdIdx = headers.indexOf("congressional district");
  const rows = [];
  const nationalCounts = { whiteNH: 0, black: 0, hispanic: 0, asian: 0, other: 0 };
  for (const record of data.slice(1)) {
    const id = districtId(record[stateIdx], record[cdIdx]);
    if (!id) continue;
    const total = sumVars(record, headers, citizen18Vars(""));
    const whiteNH = sumVars(record, headers, citizen18Vars("H"));
    const black = sumVars(record, headers, citizen18Vars("B"));
    const asian = sumVars(record, headers, citizen18Vars("D"));
    const hispanic = sumVars(record, headers, citizen18Vars("I"));
    if (!total) continue;
    const raw = { whiteNH, black, hispanic, asian };
    const rawSum = whiteNH + black + hispanic + asian;
    // Normalize the four headline groups to the district total when overlaps push their sum above total.
    // Otherwise the residual becomes Other.
    let counts;
    if (rawSum > total) {
      const scale = total / rawSum;
      counts = { whiteNH: whiteNH * scale, black: black * scale, hispanic: hispanic * scale, asian: asian * scale, other: 0 };
    } else {
      counts = { ...raw, other: total - rawSum };
    }
    for (const key of Object.keys(nationalCounts)) nationalCounts[key] += counts[key];
    const normalizedTotal = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    rows.push({
      id,
      totalCvapApprox: Math.round(total),
      counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round(v)])),
      shares: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / normalizedTotal) * 100])),
    });
  }
  const nationalTotal = Object.values(nationalCounts).reduce((a, b) => a + b, 0) || 1;
  const out = {
    generatedAt: new Date().toISOString(),
    source: "U.S. Census Bureau 2024 ACS 5-year API, B05003 race/origin variants",
    geography: "119th Congressional Districts",
    methodNote: "CVAP approximation. White is non-Hispanic White; Black and Asian are race-alone, Hispanic is Hispanic/Latino. Categories are normalized because the ACS tables are not fully mutually exclusive. Replace with the Census CVAP special-tabulation import for exact mutually exclusive categories if desired.",
    nationalShares: Object.fromEntries(Object.entries(nationalCounts).map(([k, v]) => [k, (v / nationalTotal) * 100])),
    districts: rows,
  };
  await fs.writeFile(path.join(PUBLIC_DIR, "district-demographics.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}


await fs.mkdir(PUBLIC_DIR, { recursive: true });
const bundle = await buildHillcastBundle();
let demographics = null;
try { demographics = await buildDemographics(); }
catch (e) { console.warn(`Demographics refresh failed: ${e instanceof Error ? e.message : e}`); }
console.log(`HillCast district bundle: ${bundle.districtCount} districts from ${bundle.sourceFile}`);
if (demographics) console.log(`Census demographic rows: ${demographics.districts.length}`);
console.log("Congressional district geometry is managed by the dedicated refresh-geometry workflow and committed to public/data/cd119.geojson.");
