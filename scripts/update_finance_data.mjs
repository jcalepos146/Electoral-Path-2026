import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public', 'data');
const HOUSE_JSON = path.join(PUBLIC, 'hillcast-districts.json');
const SENATE_JSON = path.join(PUBLIC, 'statewide-races.json');
const OUT = path.join(PUBLIC, 'campaign-finance.json');
const ADIMPACT_DIR = path.join(ROOT, 'data', 'adimpact_uploads');
const FEC_URL = 'https://www.fec.gov/files/bulk-downloads/2026/webl26.zip';

function n(value) {
  const x = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(x) ? x : 0;
}
function cleanName(value) {
  return String(value ?? '')
    .replace(/\*/g, '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, ' ')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function personParts(value) {
  const raw = cleanName(value);
  if (!raw || raw.includes('nominee')) return null;
  let parts;
  if (raw.includes(',')) {
    const [last, rest] = raw.split(',', 2);
    const tokens = rest.trim().split(' ').filter(Boolean);
    parts = { first: tokens[0] ?? '', last: last.trim(), tokens: new Set([last.trim(), ...tokens]) };
  } else {
    const tokens = raw.split(' ').filter(Boolean);
    parts = { first: tokens[0] ?? '', last: tokens[tokens.length - 1] ?? '', tokens: new Set(tokens) };
  }
  return parts.first && parts.last ? parts : null;
}
function matchScore(expectedName, fecName) {
  const a = personParts(expectedName), b = personParts(fecName);
  if (!a || !b) return -Infinity;
  let score = 0;
  if (a.last === b.last) score += 8;
  else if (a.tokens.has(b.last) || b.tokens.has(a.last)) score += 3;
  if (a.first === b.first) score += 4;
  else if (a.first[0] && a.first[0] === b.first[0]) score += 1.5;
  for (const token of a.tokens) if (token.length > 2 && b.tokens.has(token)) score += .5;
  return score;
}
function parseFecLine(line) {
  const c = line.replace(/\r$/, '').split('|');
  if (c.length < 28) return null;
  return {
    candidateId: c[0], name: c[1], incumbentStatus: c[2], party: c[4],
    receipts: n(c[5]), transfersFromAuth: n(c[6]), disbursements: n(c[7]), transfersToAuth: n(c[8]),
    cashOnHand: n(c[10]), debts: n(c[16]), individualContributions: n(c[17]),
    state: String(c[18] ?? '').toUpperCase(), district: String(c[19] ?? '').padStart(2, '0'),
    otherCommitteeContrib: n(c[25]), partyContrib: n(c[26]), coverageEnd: c[27] || null,
  };
}
function partySide(party) {
  const p = String(party ?? '').toUpperCase();
  if (p.startsWith('DEM')) return 'dem';
  if (p.startsWith('REP')) return 'rep';
  return null;
}
function adjustedDisbursements(row) {
  return Math.max(0, row.disbursements - row.transfersToAuth);
}
function adjustedReceipts(row) {
  return Math.max(0, row.receipts - row.transfersFromAuth);
}
function financeSummary(row) {
  if (!row) return null;
  return {
    candidateId: row.candidateId,
    name: row.name,
    party: row.party,
    incumbentStatus: row.incumbentStatus || null,
    receipts: adjustedReceipts(row),
    disbursements: adjustedDisbursements(row),
    cashOnHand: row.cashOnHand,
    debts: row.debts,
    individualContributions: row.individualContributions,
    otherCommitteeContrib: row.otherCommitteeContrib,
    partyContrib: row.partyContrib,
    coverageEnd: row.coverageEnd,
  };
}
function bestMatch(expectedName, candidates) {
  if (!personParts(expectedName)) return null;
  const ranked = candidates.map(row => ({ row, score: matchScore(expectedName, row.name) })).sort((a,b) => b.score - a.score);
  return ranked[0]?.score >= 8 ? ranked[0].row : null;
}
function financialIndex(dem, rep) {
  if (!dem || !rep) return null;
  const pad = 100000;
  const logRatio = (a,b) => Math.log((Math.max(0,a)+pad)/(Math.max(0,b)+pad));
  const resourceEdge =
    .50 * logRatio(dem.cashOnHand, rep.cashOnHand) +
    .30 * logRatio(adjustedReceipts(dem), adjustedReceipts(rep)) +
    .20 * logRatio(adjustedDisbursements(dem), adjustedDisbursements(rep));
  return Math.tanh(resourceEdge / 2); // -1 to +1, positive = Democratic resource edge
}
function adImpactIndex(row) {
  if (!row) return null;
  const pad = 100000;
  const logRatio = (a,b) => Math.log((Math.max(0,a)+pad)/(Math.max(0,b)+pad));
  const current = logRatio(row.demAdSpend, row.repAdSpend);
  const reserved = logRatio(row.demFutureReservations, row.repFutureReservations);
  return Math.tanh((.70 * current + .30 * reserved) / 2);
}
function combineIndices(fecIndex, adIndex) {
  if (fecIndex == null) return adIndex;
  if (adIndex == null) return fecIndex;
  return Math.max(-1, Math.min(1, .60 * fecIndex + .40 * adIndex));
}
function packageRace(dem, rep, adImpact = null) {
  const fecIndex = financialIndex(dem, rep);
  const adIndex = adImpactIndex(adImpact);
  const idx = combineIndices(fecIndex, adIndex);
  return {
    dem: financeSummary(dem), rep: financeSummary(rep),
    fecIndex, adIndex, adImpact,
    index: idx,
    direction: idx == null || Math.abs(idx) < .01 ? 'neutral' : idx > 0 ? 'D' : 'R',
    methodology: adIndex == null
      ? 'FEC-only: 0.50 cash-on-hand log ratio + 0.30 receipts log ratio + 0.20 disbursements log ratio; tanh shrinkage; +100k denominator padding.'
      : 'Combined: 0.60 FEC resource index + 0.40 AdImpact-style ad index. Ad index = 0.70 current-spend log ratio + 0.30 future-reservations log ratio; tanh shrinkage; +100k denominator padding.',
  };
}

function parseCsvLine(line) {
  const out=[]; let cur=''; let quoted=false;
  for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;
}
async function loadAdImpactWrapper() {
  try {
    const names=(await fs.readdir(ADIMPACT_DIR)).filter(name=>/\.csv$/i.test(name)).sort();
    if(!names.length) return { file:null, rows:new Map() };
    const name=names.at(-1); const raw=await fs.readFile(path.join(ADIMPACT_DIR,name),'utf8');
    const lines=raw.split(/\r?\n/).filter(Boolean); if(lines.length<2)return {file:name,rows:new Map()};
    const headers=parseCsvLine(lines[0]).map(h=>h.trim().toLowerCase());
    const idx=(...candidates)=>{for(const c of candidates){const i=headers.indexOf(c);if(i>=0)return i;}return -1;};
    const iRace=idx('race_id','race','id'), iDem=idx('dem_ad_spend','dem_spend'), iRep=idx('rep_ad_spend','rep_spend');
    const iDemRes=idx('dem_future_reservations','dem_reservations'), iRepRes=idx('rep_future_reservations','rep_reservations'), iAsOf=idx('as_of','date');
    if(iRace<0||iDem<0||iRep<0) throw new Error('AdImpact wrapper requires race_id, dem_ad_spend, rep_ad_spend');
    const rows=new Map();
    for(const line of lines.slice(1)){const c=parseCsvLine(line);const raceId=String(c[iRace]??'').trim().toUpperCase();if(!raceId)continue;rows.set(raceId,{
      demAdSpend:n(c[iDem]), repAdSpend:n(c[iRep]), demFutureReservations:iDemRes>=0?n(c[iDemRes]):0, repFutureReservations:iRepRes>=0?n(c[iRepRes]):0,
      asOf:iAsOf>=0?String(c[iAsOf]??'').trim()||null:null, sourceFile:name
    });}
    return {file:name,rows};
  } catch(error) {
    console.warn(`AdImpact manual wrapper unavailable: ${error instanceof Error?error.message:error}`);
    return {file:null,rows:new Map()};
  }
}

async function downloadFec() {
  const response = await fetch(FEC_URL, { headers: { 'User-Agent': process.env.ELECTION_PATH_USER_AGENT || 'ElectionPath2026/0.9' } });
  if (!response.ok) throw new Error(`FEC bulk download HTTP ${response.status}`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'election-path-fec-'));
  const zipPath = path.join(tempDir, 'webl26.zip');
  await fs.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
  const { stdout } = await execFileAsync('unzip', ['-p', zipPath], { maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

await fs.mkdir(PUBLIC, { recursive: true });
let raw;
try { raw = await downloadFec(); }
catch (error) {
  console.warn(`FEC finance refresh failed: ${error instanceof Error ? error.message : error}`);
  try { await fs.access(OUT); process.exit(0); } catch { throw error; }
}
const fecRows = raw.split('\n').map(parseFecLine).filter(Boolean);
const houseBundle = JSON.parse(await fs.readFile(HOUSE_JSON, 'utf8'));
const statewideBundle = JSON.parse(await fs.readFile(SENATE_JSON, 'utf8'));
const adImpact = await loadAdImpactWrapper();

const byHouseRace = new Map();
const bySenateState = new Map();
for (const row of fecRows) {
  const office = String(row.candidateId ?? '')[0];
  if (office === 'H') {
    const id = `${row.state}-${row.district === '00' ? '01' : row.district}`;
    if (!byHouseRace.has(id)) byHouseRace.set(id, []);
    byHouseRace.get(id).push(row);
  } else if (office === 'S') {
    if (!bySenateState.has(row.state)) bySenateState.set(row.state, []);
    bySenateState.get(row.state).push(row);
  }
}

const house = {};
for (const race of houseBundle.districts ?? []) {
  const candidates = byHouseRace.get(race.id) ?? [];
  const dem = bestMatch(race.democrat, candidates.filter(r => partySide(r.party) === 'dem'));
  const rep = bestMatch(race.republican, candidates.filter(r => partySide(r.party) === 'rep'));
  house[race.id] = packageRace(dem, rep, adImpact.rows.get(String(race.id).toUpperCase()) ?? null);
}
const senate = {};
for (const race of statewideBundle.senate ?? []) {
  const candidates = bySenateState.get(String(race.state).toUpperCase()) ?? [];
  const dem = bestMatch(race.democrat, candidates.filter(r => partySide(r.party) === 'dem'));
  const rep = bestMatch(race.republican, candidates.filter(r => partySide(r.party) === 'rep'));
  const state = String(race.state).toUpperCase();
  senate[state] = packageRace(dem, rep, adImpact.rows.get(`${state}-SEN`) ?? adImpact.rows.get(state) ?? null);
}

const coverageDates = fecRows.map(r => r.coverageEnd).filter(Boolean).sort();
const out = {
  generatedAt: new Date().toISOString(),
  source: 'Federal Election Commission 2025-2026 House/Senate current campaigns bulk file',
  sourceUrl: FEC_URL,
  coverageLatest: coverageDates.at(-1) ?? null,
  adImpactSourceFile: adImpact.file,
  note: 'Candidate-reported FEC summary finances, optionally combined with a manually uploaded AdImpact spending wrapper when present. FEC disbursements are broader campaign spending and are not equivalent to paid-media spend. Finance index is experimental and should be calibrated historically before receiving large weight.',
  convention: 'Finance index ranges from -1 to +1; positive values indicate a Democratic resource advantage.',
  house,
  senate,
};
await fs.writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`Campaign finance bundle: ${Object.keys(house).length} House races, ${Object.keys(senate).length} Senate races; latest coverage ${out.coverageLatest ?? 'unknown'}`);
