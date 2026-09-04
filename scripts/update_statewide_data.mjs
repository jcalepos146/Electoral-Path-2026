import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SENATE_INPUT = path.join(ROOT, "data", "senate_uploads");
const LEGACY_INPUT = path.join(ROOT, "data", "statewide_uploads");
const PUBLIC = path.join(ROOT, "public", "data");
const OUT = path.join(PUBLIC, "statewide-races.json");
const STATE_DEMO_OUT = path.join(PUBLIC, "state-demographics.json");
const DISTRICT_DEMO = path.join(PUBLIC, "district-demographics.json");

const STATE_NAME_TO_ABBR = {
  Alabama:"AL", Alaska:"AK", Arizona:"AZ", Arkansas:"AR", California:"CA", Colorado:"CO", Connecticut:"CT", Delaware:"DE",
  Florida:"FL", Georgia:"GA", Hawaii:"HI", Idaho:"ID", Illinois:"IL", Indiana:"IN", Iowa:"IA", Kansas:"KS", Kentucky:"KY",
  Louisiana:"LA", Maine:"ME", Maryland:"MD", Massachusetts:"MA", Michigan:"MI", Minnesota:"MN", Mississippi:"MS", Missouri:"MO",
  Montana:"MT", Nebraska:"NE", Nevada:"NV", "New Hampshire":"NH", "New Jersey":"NJ", "New Mexico":"NM", "New York":"NY",
  "North Carolina":"NC", "North Dakota":"ND", Ohio:"OH", Oklahoma:"OK", Oregon:"OR", Pennsylvania:"PA", "Rhode Island":"RI",
  "South Carolina":"SC", "South Dakota":"SD", Tennessee:"TN", Texas:"TX", Utah:"UT", Vermont:"VT", Virginia:"VA", Washington:"WA",
  "West Virginia":"WV", Wisconsin:"WI", Wyoming:"WY"
};
const VALID_STATES = new Set(Object.values(STATE_NAME_TO_ABBR));
const STATE_FIPS_TO_ABBR = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"
};

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ',' && !quoted) { row.push(cell); cell = ""; continue; }
    if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim() !== "")) rows.push(row); }
  return rows;
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function pick(row, names) {
  for (const name of names) if (row[name] != null && String(row[name]).trim() !== "") return String(row[name]).trim();
  return null;
}
function parseMargin(value) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase().replace(/\s+/g, "");
  if (!text || ["NA","N/A","—"].includes(text)) return null;
  if (text === "TIE" || text === "EVEN") return 0;
  let match = text.match(/^D\+?(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]);
  match = text.match(/^R\+?(\d+(?:\.\d+)?)$/);
  if (match) return -Number(match[1]);
  const numeric = Number(text.replace("%", ""));
  return Number.isFinite(numeric) ? numeric : null;
}
function parseChance(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  return n >= 0 && n <= 1 ? n * 100 : n;
}
function stateAbbr(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (VALID_STATES.has(upper)) return upper;
  const key = Object.keys(STATE_NAME_TO_ABBR).find((name) => name.toLowerCase() === text.toLowerCase());
  return key ? STATE_NAME_TO_ABBR[key] : null;
}
function datedName(name) {
  const m = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function senateCandidates() {
  const found = [];
  for (const dir of [SENATE_INPUT, LEGACY_INPUT]) {
    let entries = [];
    try { entries = await fs.readdir(dir); } catch { continue; }
    for (const name of entries) {
      if (!name.toLowerCase().endsWith(".csv")) continue;
      if (dir === LEGACY_INPUT && !name.toLowerCase().includes("senate")) continue;
      const stat = await fs.stat(path.join(dir, name));
      found.push({ dir, name, date: datedName(name), mtime: stat.mtimeMs });
    }
  }
  found.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.mtime - a.mtime);
  return found;
}

async function loadSenateFile(candidate) {
  if (!candidate) return { rows: [], asOf: null };
  const text = await fs.readFile(path.join(candidate.dir, candidate.name), "utf8");
  const matrix = parseCsv(text);
  if (matrix.length < 2) return { rows: [], asOf: candidate.date };
  const headers = matrix[0].map(normalizeHeader);
  const out = [];
  for (const values of matrix.slice(1)) {
    const obj = Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
    const state = stateAbbr(pick(obj, ["state", "state_name", "id", "name", "postal", "abbr"]));
    if (!state) continue; // ignores Datawrapper footer/summary rows
    const margin = parseMargin(pick(obj, ["projected_margin", "margin", "forecast_margin", "spread"]));
    if (margin == null || !Number.isFinite(margin)) continue;
    out.push({
      state,
      republican: pick(obj, ["rep_candidate", "republican", "rep", "gop_candidate", "republican_candidate"]),
      democrat: pick(obj, ["dem_candidate", "democrat", "dem", "democratic_candidate", "democrat_candidate"]),
      other: pick(obj, ["other_candidate", "other"]),
      margin,
      marginLabel: pick(obj, ["projected_margin", "margin", "forecast_margin", "spread"]),
      rating: pick(obj, ["rating", "race_rating", "category"]),
      democraticOdds: parseChance(pick(obj, ["dem_win_chance", "democratic_odds", "dem_odds", "democratic_win_chance"])),
      republicanOdds: parseChance(pick(obj, ["rep_win_chance", "republican_odds", "rep_odds", "republican_win_chance"])),
      source: pick(obj, ["source", "model", "provider"]) ?? "HillCast Senate / Datawrapper h1bWr",
      asOf: pick(obj, ["as_of", "asof", "date"]) ?? candidate.date,
    });
  }
  const unique = new Map(out.map((row) => [row.state, row]));
  return { rows: [...unique.values()].sort((a, b) => a.state.localeCompare(b.state)), asOf: candidate.date };
}

function blankCounts() { return { whiteNH: 0, black: 0, hispanic: 0, asian: 0, other: 0 }; }
function sharesFromCounts(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / total * 100]));
}

async function buildStateDemographicsFromDistricts() {
  const raw = JSON.parse(await fs.readFile(DISTRICT_DEMO, "utf8"));
  const stateMap = new Map();
  for (const row of raw.districts ?? []) {
    const state = String(row.id ?? "").slice(0, 2).toUpperCase();
    if (!VALID_STATES.has(state)) continue;
    if (!stateMap.has(state)) stateMap.set(state, { id: state, totalCvapApprox: 0, counts: blankCounts() });
    const dest = stateMap.get(state);
    dest.totalCvapApprox += Number(row.totalCvapApprox ?? 0) || 0;
    for (const key of Object.keys(dest.counts)) dest.counts[key] += Number(row.counts?.[key] ?? 0) || 0;
  }
  const nationalCounts = blankCounts();
  const states = [...stateMap.values()].map((row) => {
    for (const key of Object.keys(nationalCounts)) nationalCounts[key] += row.counts[key];
    return { ...row, totalCvapApprox: Math.round(row.totalCvapApprox), shares: sharesFromCounts(row.counts) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (states.length < 50) throw new Error(`Only ${states.length} state demographic rows could be aggregated from district data`);
  return {
    generatedAt: new Date().toISOString(),
    source: raw.source ?? "U.S. Census Bureau 2024 ACS 5-year API",
    geography: "States aggregated from 119th Congressional District demographic rows",
    methodNote: raw.methodNote ?? "Uses the same normalized CVAP approximation as the House demographic engine.",
    nationalShares: sharesFromCounts(nationalCounts),
    states,
  };
}

function citizen18Vars(suffix = "") {
  const prefix = `B05003${suffix}`;
  return [`${prefix}_009E`, `${prefix}_011E`, `${prefix}_020E`, `${prefix}_022E`];
}
async function fetchJson(url, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, { headers: { "User-Agent": process.env.ELECTION_PATH_USER_AGENT || "ElectionPath2026/1.0" }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) { lastError = e; }
    finally { clearTimeout(timer); }
  }
  throw lastError instanceof Error ? lastError : new Error("Census state demographic request failed");
}
function sumVars(record, headers, variables) {
  return variables.reduce((sum, variable) => {
    const idx = headers.indexOf(variable);
    const n = idx >= 0 ? Number(record[idx]) : 0;
    return sum + (Number.isFinite(n) && n >= 0 ? n : 0);
  }, 0);
}
async function buildStateDemographicsFromCensus() {
  const vars = [...citizen18Vars(""), ...citizen18Vars("H"), ...citizen18Vars("B"), ...citizen18Vars("D"), ...citizen18Vars("I")];
  const url = `https://api.census.gov/data/2024/acs/acs5?get=NAME,${vars.join(",")}&for=state:*`;
  const data = await fetchJson(url);
  const headers = data[0];
  const stateIdx = headers.indexOf("state");
  const states = [];
  const nationalCounts = blankCounts();
  for (const record of data.slice(1)) {
    const id = STATE_FIPS_TO_ABBR[String(record[stateIdx]).padStart(2, "0")];
    if (!id) continue;
    const total = sumVars(record, headers, citizen18Vars(""));
    const whiteNH = sumVars(record, headers, citizen18Vars("H"));
    const black = sumVars(record, headers, citizen18Vars("B"));
    const asian = sumVars(record, headers, citizen18Vars("D"));
    const hispanic = sumVars(record, headers, citizen18Vars("I"));
    if (!total) continue;
    const rawCounts = { whiteNH, black, hispanic, asian };
    const rawSum = whiteNH + black + hispanic + asian;
    const counts = rawSum > total
      ? { whiteNH: whiteNH * total / rawSum, black: black * total / rawSum, hispanic: hispanic * total / rawSum, asian: asian * total / rawSum, other: 0 }
      : { ...rawCounts, other: total - rawSum };
    for (const key of Object.keys(nationalCounts)) nationalCounts[key] += counts[key];
    states.push({ id, totalCvapApprox: Math.round(total), counts: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k, Math.round(v)])), shares: sharesFromCounts(counts) });
  }
  if (states.length < 50) throw new Error(`Census returned only ${states.length} usable state rows`);
  return {
    generatedAt: new Date().toISOString(),
    source: "U.S. Census Bureau 2024 ACS 5-year API, B05003 race/origin variants",
    geography: "States",
    methodNote: "CVAP approximation matching the House engine. Categories are normalized because the ACS race/origin tables are not fully mutually exclusive.",
    nationalShares: sharesFromCounts(nationalCounts),
    states: states.sort((a,b) => a.id.localeCompare(b.id)),
  };
}

await fs.mkdir(PUBLIC, { recursive: true });
const candidates = await senateCandidates();
const selectedFile = candidates[0] ?? null;
const senateLoaded = await loadSenateFile(selectedFile);
if (!senateLoaded.rows.length) throw new Error("No valid Senate rows were found. Add a HillCast/Datawrapper CSV to data/senate_uploads/.");

const bundle = {
  generatedAt: new Date().toISOString(),
  convention: "positive = Democratic; negative = Republican",
  senateSourceFile: selectedFile?.name ?? null,
  senateSourceAsOf: senateLoaded.asOf,
  senateChartId: "h1bWr",
  senate: senateLoaded.rows,
  note: "Senate rows are the HillCast/Datawrapper prior. The browser scenario engine applies demographic vote-margin and turnout changes to those priors; original HillCast win odds are retained as reference and are not recalibrated by the slider model.",
};
await fs.writeFile(OUT, JSON.stringify(bundle, null, 2) + "\n");

let demographics = null;
try { demographics = await buildStateDemographicsFromDistricts(); }
catch (firstError) {
  console.warn(`Could not aggregate state demographics from district data: ${firstError instanceof Error ? firstError.message : firstError}`);
  try { demographics = await buildStateDemographicsFromCensus(); }
  catch (secondError) { console.warn(`State demographic refresh failed: ${secondError instanceof Error ? secondError.message : secondError}`); }
}
if (demographics) await fs.writeFile(STATE_DEMO_OUT, JSON.stringify(demographics, null, 2) + "\n");

console.log(`Wrote ${path.relative(ROOT, OUT)}: ${senateLoaded.rows.length} Senate races from ${selectedFile?.name ?? "unknown"}.`);
if (demographics) console.log(`Wrote ${path.relative(ROOT, STATE_DEMO_OUT)}: ${demographics.states.length} state demographic rows.`);
