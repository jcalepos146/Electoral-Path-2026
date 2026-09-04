import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "data", "statewide_uploads");
const OUT = path.join(ROOT, "public", "data", "statewide-races.json");

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
]);

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

function parseMargin(value) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase().replace(/\s+/g, "");
  if (!text || text === "NA" || text === "N/A" || text === "—") return null;
  if (text === "TIE" || text === "EVEN") return 0;
  let match = text.match(/^D\+?(-?\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]);
  match = text.match(/^R\+?(\d+(?:\.\d+)?)$/);
  if (match) return -Number(match[1]);
  const numeric = Number(text.replace("%", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pick(row, names) {
  for (const name of names) if (row[name] != null && String(row[name]).trim() !== "") return String(row[name]).trim();
  return null;
}

async function newest(prefix) {
  let entries = [];
  try { entries = await fs.readdir(INPUT); } catch { return null; }
  const candidates = entries
    .filter((name) => new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.csv$`, "i").test(name))
    .sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

async function loadFile(filename) {
  if (!filename) return [];
  const text = await fs.readFile(path.join(INPUT, filename), "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const out = [];
  for (const values of rows.slice(1)) {
    const obj = Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
    const state = (pick(obj, ["state", "state_abbr", "abbr", "postal"]) ?? "").toUpperCase();
    if (!VALID_STATES.has(state)) continue;
    out.push({
      state,
      republican: pick(obj, ["republican", "rep", "gop_candidate", "republican_candidate"]),
      democrat: pick(obj, ["democrat", "dem", "democratic_candidate", "democrat_candidate"]),
      margin: parseMargin(pick(obj, ["margin", "projected_margin", "forecast_margin", "spread"])),
      rating: pick(obj, ["rating", "race_rating", "category"]),
      source: pick(obj, ["source", "model", "provider"]),
      asOf: pick(obj, ["as_of", "asof", "date"]),
      note: pick(obj, ["note", "notes"]),
    });
  }
  return out.sort((a, b) => a.state.localeCompare(b.state));
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
const senateFile = await newest("senate");
const governorFile = await newest("governors") ?? await newest("governor");
const senate = await loadFile(senateFile);
const governors = await loadFile(governorFile);
const bundle = {
  generatedAt: new Date().toISOString(),
  convention: "positive = Democratic; negative = Republican",
  senateSourceFile: senateFile,
  governorSourceFile: governorFile,
  senate,
  governors,
  note: "Only states present in an uploaded statewide CSV are treated as tracked races. Gray means no projection loaded, not tossup.",
};
await fs.writeFile(OUT, JSON.stringify(bundle, null, 2) + "\n");
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${senate.length} Senate rows, ${governors.length} governor rows.`);
