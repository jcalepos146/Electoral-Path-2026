import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "sources.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "live-aggregates.json");
const USER_AGENT =
  process.env.ELECTION_PATH_USER_AGENT ||
  "ElectionPath/1.2 (+public election aggregate research; scheduled cached request)";

const RCP_APPROVAL_URL = "https://www.realclearpolling.com/polls/approval/donald-trump/approval-rating";
const ECHELON_ARCHIVE_URL = "https://echeloninsights.com/insights/tag/verified-voter-omnibus-archive";

function getPath(object, dotPath) {
  if (!dotPath) return object;
  return dotPath.split(".").reduce((value, key) => {
    if (value === null || value === undefined) return undefined;
    if (/^\d+$/.test(key) && Array.isArray(value)) return value[Number(key)];
    return value[key];
  }, object);
}

function numberValue(value, label) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[%+,]/g, "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`${label} was not numeric`);
  return parsed;
}

function normalizeDate(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const isoLike = raw.match(/(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (isoLike) {
    const [, y, m, d] = isoLike;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DDHQ often displays dates such as "Sep 2, 4:52 PM EDT" without a year.
  const monthDay = raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i);
  if (monthDay) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = monthNames.indexOf(monthDay[1].toLowerCase()) + 1;
    const year = new Date().getUTCFullYear();
    return `${year}-${String(month).padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }

  return raw.slice(0, 10);
}

function validateApproval(reading) {
  const approve = numberValue(reading.approve, "Approval share");
  const disapprove = numberValue(reading.disapprove, "Disapproval share");
  if (approve < 0 || approve > 100 || disapprove < 0 || disapprove > 100) {
    throw new Error("Approval shares must be between 0 and 100");
  }
  return {
    approve,
    disapprove,
    net: approve - disapprove,
    asOf: normalizeDate(reading.asOf),
    label: reading.label,
    sourceUrl: reading.sourceUrl,
  };
}

function validateReading(reading) {
  const dem = numberValue(reading.dem, "Democratic share");
  const rep = numberValue(reading.rep, "Republican share");
  if (dem < 0 || dem > 100 || rep < 0 || rep > 100) {
    throw new Error("Party shares must be between 0 and 100");
  }
  if (dem + rep > 101) throw new Error("Party shares summed to more than 101%");
  return {
    dem,
    rep,
    margin: dem - rep,
    asOf: normalizeDate(reading.asOf),
  };
}

function authRequest(source) {
  const headers = {
    Accept: source.adapter === "json" ? "application/json" : "text/html,application/xhtml+xml,*/*",
    "User-Agent": USER_AGENT,
    ...(source.headers ?? {}),
  };
  const url = new URL(source.fetchUrl ?? source.url);

  const auth = source.auth;
  if (auth?.env) {
    const key = process.env[auth.env];
    if (!key) throw new Error(`Missing GitHub secret/environment variable ${auth.env}`);
    if (auth.mode === "header") {
      headers[auth.name] = `${auth.prefix ?? ""}${key}`;
    } else if (auth.mode === "query") {
      url.searchParams.set(auth.name, `${auth.prefix ?? ""}${key}`);
    } else {
      throw new Error(`Unsupported auth mode: ${auth.mode}`);
    }
  }

  return { url, headers };
}

async function fetchText(source) {
  const { url, headers } = authRequest(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRcp(html) {
  const body = stripHtml(html);
  const markerCandidates = [
    "RealClearPolitics Poll Average",
    "RCP Average",
    "Poll Average",
  ];
  let section = body;
  for (const marker of markerCandidates) {
    const i = body.indexOf(marker);
    if (i >= 0) {
      section = body.slice(i, i + 3500);
      break;
    }
  }

  const inline = section.match(
    /(\d{2}(?:\.\d+)?)\s*(Democrats|Republicans)\s*\+?(-?\d+(?:\.\d+)?)\s*(\d{2}(?:\.\d+)?)\s*(Democrats|Republicans)/i,
  );
  if (inline) {
    const firstShare = Number(inline[1]);
    const firstParty = inline[2].toLowerCase();
    const secondShare = Number(inline[4]);
    const secondParty = inline[5].toLowerCase();
    if (firstParty !== secondParty) {
      return validateReading({
        dem: firstParty === "democrats" ? firstShare : secondShare,
        rep: firstParty === "republicans" ? firstShare : secondShare,
      });
    }
  }

  const partyMatches = [...section.matchAll(/(Democrats|Republicans)[^0-9]{0,50}(\d{2}(?:\.\d+)?)/gi)];
  const latest = {};
  for (const match of partyMatches) {
    latest[match[1].toLowerCase()] = Number(match[2]);
    if (latest.democrats !== undefined && latest.republicans !== undefined) break;
  }
  if (latest.democrats !== undefined && latest.republicans !== undefined) {
    return validateReading({ dem: latest.democrats, rep: latest.republicans });
  }

  throw new Error("Could not parse the RCP generic-ballot average from the current markup");
}

function parseVoteHub(html) {
  const body = stripHtml(html);
  const anchor = "Which party do Americans want in Congress?";
  const i = body.toLowerCase().indexOf(anchor.toLowerCase());
  const section = i >= 0 ? body.slice(i, i + 1400) : body;

  const compact = section.match(
    /(\d{1,2}(?:\.\d+)?)\s*%\s*Democratic[\s\S]{0,250}?(\d{1,2}(?:\.\d+)?)\s*%\s*Republican/i,
  );
  if (compact) {
    return validateReading({ dem: compact[1], rep: compact[2] });
  }

  const dem = section.match(/(?:Democratic|Democrats)[^0-9]{0,50}(\d{1,2}(?:\.\d+)?)\s*%/i)
    ?? section.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:Democratic|Democrats)/i);
  const rep = section.match(/(?:Republican|Republicans)[^0-9]{0,50}(\d{1,2}(?:\.\d+)?)\s*%/i)
    ?? section.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:Republican|Republicans)/i);

  const demValue = dem ? (dem[2] ? dem[1] : dem[1]) : undefined;
  const repValue = rep ? (rep[2] ? rep[1] : rep[1]) : undefined;
  if (demValue !== undefined && repValue !== undefined) {
    return validateReading({ dem: demValue, rep: repValue });
  }

  throw new Error("Could not parse VoteHub's published live generic-ballot average");
}

function parseDdHq(html) {
  const body = stripHtml(html);
  const anchor = "Generic Congressional Ballot";
  const start = body.toLowerCase().indexOf(anchor.toLowerCase());
  let section = start >= 0 ? body.slice(start, start + 3500) : body;
  const pollTable = section.toLowerCase().indexOf("published polls");
  if (pollTable >= 0) section = section.slice(0, pollTable);

  const dem = section.match(/\bDemocrat(?:ic)?\b[^0-9]{0,80}(\d{1,2}(?:\.\d+)?)\s*%/i);
  const rep = section.match(/\bRepublican\b[^0-9]{0,80}(\d{1,2}(?:\.\d+)?)\s*%/i);
  if (!dem || !rep) {
    throw new Error("Could not parse DDHQ's public generic-ballot average");
  }

  const asOf = section.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[A-Z]{2,4}\b/i)?.[0];
  return validateReading({ dem: dem[1], rep: rep[1], asOf });
}

function parseRcpApproval(html) {
  const body = stripHtml(html);
  const marker = body.indexOf("RealClearPolitics Poll Average");
  const section = marker >= 0 ? body.slice(marker, marker + 2500) : body;
  const values = {};
  for (const match of section.matchAll(/\b(Approve|Disapprove)\b[^0-9%]{0,70}(\d{2}(?:\.\d+)?)\s*%/gi)) {
    const key = match[1].toLowerCase();
    if (values[key] === undefined) values[key] = Number(match[2]);
    if (values.approve !== undefined && values.disapprove !== undefined) break;
  }
  if (values.approve === undefined || values.disapprove === undefined) {
    throw new Error("Could not parse RCP presidential approval average");
  }
  return validateApproval({ approve: values.approve, disapprove: values.disapprove, sourceUrl: RCP_APPROVAL_URL });
}

function absoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function discoverEchelonLatestUrl(html) {
  const links = [...html.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]{0,260}?)<\/a>/gi)];
  for (const match of links) {
    const text = stripHtml(match[2]);
    if (/Verified Voter Omnibus/i.test(text) && /2026/i.test(text)) {
      return absoluteUrl(ECHELON_ARCHIVE_URL, match[1]);
    }
  }
  const direct = html.match(/href=["']([^"']*2026[^"']*verified-voter-omnibus[^"']*)["']/i);
  if (direct) return absoluteUrl(ECHELON_ARCHIVE_URL, direct[1]);
  throw new Error("Could not discover the latest Echelon Verified Voter Omnibus page");
}

function parseEchelonPage(html, sourceUrl) {
  const body = stripHtml(html);
  const approval = body.match(/job approval stands at\s+(\d{1,2}(?:\.\d+)?)%\s+approve,?\s+(\d{1,2}(?:\.\d+)?)%\s+disapprove/i);
  if (!approval) throw new Error("Could not parse Echelon job approval topline");

  const title = body.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+2026\s+Verified Voter Omnibus)/i)?.[1];
  const dateText = body.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+2026\b/i)?.[0];
  const generic = body.match(/Democrats (?:lead|ahead)[^0-9]{0,80}(\d{1,2}(?:\.\d+)?)\s*[-–]\s*(\d{1,2}(?:\.\d+)?)/i);

  return {
    ...validateApproval({
      approve: approval[1],
      disapprove: approval[2],
      asOf: dateText,
      label: title,
      sourceUrl,
    }),
    genericDem: generic ? Number(generic[1]) : undefined,
    genericRep: generic ? Number(generic[2]) : undefined,
    genericMargin: generic ? Number(generic[1]) - Number(generic[2]) : undefined,
  };
}

async function readApprovalFallback(file) {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, file), "utf8"));
  return validateApproval(raw);
}

async function retrieveEnvironment() {
  let rcpApproval;
  try {
    rcpApproval = {
      id: "rcp_approval",
      name: "RealClearPolling Trump approval",
      status: "ok",
      ...parseRcpApproval(await fetchText({ adapter: "html", url: RCP_APPROVAL_URL })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const fallback = await readApprovalFallback("data/last-known-rcp-approval.json");
      rcpApproval = { id: "rcp_approval", name: "RealClearPolling Trump approval", status: "fallback", ...fallback, sourceUrl: RCP_APPROVAL_URL, message };
    } catch {
      rcpApproval = { id: "rcp_approval", name: "RealClearPolling Trump approval", status: "error", sourceUrl: RCP_APPROVAL_URL, message };
    }
  }

  let echelon;
  try {
    const archiveHtml = await fetchText({ adapter: "html", url: ECHELON_ARCHIVE_URL });
    const latestUrl = discoverEchelonLatestUrl(archiveHtml);
    echelon = {
      id: "echelon",
      name: "Echelon Verified Voter Omnibus",
      status: "ok",
      ...parseEchelonPage(await fetchText({ adapter: "html", url: latestUrl }), latestUrl),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const raw = JSON.parse(await fs.readFile(path.join(ROOT, "data/last-known-echelon.json"), "utf8"));
      const fallback = validateApproval(raw);
      echelon = {
        id: "echelon",
        name: "Echelon Verified Voter Omnibus",
        status: "fallback",
        ...fallback,
        label: raw.label,
        sourceUrl: raw.sourceUrl,
        message,
      };
    } catch {
      echelon = { id: "echelon", name: "Echelon Verified Voter Omnibus", status: "error", sourceUrl: ECHELON_ARCHIVE_URL, message };
    }
  }
  return { rcpApproval, echelon };
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((v) => v.trim());
}

function parseCsv(text, source) {
  const options = source.csv ?? {};
  const delimiter = options.delimiter ?? ",";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV contained no data rows");
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""]));
  });

  let candidates = rows;
  if (options.match?.column) {
    candidates = rows.filter((row) => String(row[options.match.column]) === String(options.match.equals));
  }
  if (!candidates.length) throw new Error("CSV selector matched no rows");
  const row = options.selectLastRow === false ? candidates[0] : candidates[candidates.length - 1];
  const columns = options.columns ?? {};
  return validateReading({
    dem: row[columns.dem],
    rep: row[columns.rep],
    asOf: columns.asOf ? row[columns.asOf] : undefined,
  });
}

async function readFallback(source) {
  if (!source.fallbackFile) return null;
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, source.fallbackFile), "utf8"));
  return validateReading(raw);
}

async function retrieve(source) {
  if (source.adapter === "rcp_html") return parseRcp(await fetchText(source));
  if (source.adapter === "votehub_html") return parseVoteHub(await fetchText(source));
  if (source.adapter === "ddhq_html") return parseDdHq(await fetchText(source));

  if (source.adapter === "json") {
    const json = JSON.parse(await fetchText(source));
    const mapping = source.mapping ?? {};
    const root = mapping.rootPath ? getPath(json, mapping.rootPath) : json;
    return validateReading({
      dem: getPath(root, mapping.dem),
      rep: getPath(root, mapping.rep),
      asOf: mapping.asOf ? getPath(root, mapping.asOf) : undefined,
    });
  }

  if (source.adapter === "csv") return parseCsv(await fetchText(source), source);
  throw new Error(`Unsupported adapter: ${source.adapter}`);
}

function weightedAverage(values, key) {
  const denominator = values.reduce((sum, item) => sum + item.weight, 0);
  return values.reduce((sum, item) => sum + item[key] * item.weight, 0) / denominator;
}

async function main() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const enabled = config.sources.filter((source) => source.enabled);
  if (!enabled.length) throw new Error("No data sources are enabled in config/sources.json");

  const results = [];
  for (const source of enabled) {
    const weight = Number(source.weight ?? 1);
    try {
      const reading = await retrieve(source);
      results.push({
        id: source.id,
        name: source.name,
        status: "ok",
        ...reading,
        weight,
        sourceUrl: source.url,
        note: source.note,
        fetchedAt: new Date().toISOString(),
      });
      console.log(`✓ ${source.name}: D ${reading.dem.toFixed(1)} / R ${reading.rep.toFixed(1)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const fallback = await readFallback(source);
        if (!fallback) throw new Error("No fallback configured");
        results.push({
          id: source.id,
          name: source.name,
          status: "fallback",
          ...fallback,
          weight,
          sourceUrl: source.url,
          note: source.note,
          message,
        });
        console.warn(`! ${source.name}: ${message}; using fallback`);
      } catch {
        results.push({
          id: source.id,
          name: source.name,
          status: "error",
          weight,
          sourceUrl: source.url,
          note: source.note,
          message,
        });
        console.warn(`✗ ${source.name}: ${message}`);
      }
    }
  }

  const usable = results.filter(
    (item) => (item.status === "ok" || item.status === "fallback") && Number.isFinite(item.dem) && Number.isFinite(item.rep),
  );
  if (!usable.length) throw new Error("All enabled aggregate sources failed and no fallback was available");

  const dem = weightedAverage(usable, "dem");
  const rep = weightedAverage(usable, "rep");
  const asOf = usable
    .map((item) => item.asOf)
    .filter(Boolean)
    .sort()
    .at(-1);

  const environment = await retrieveEnvironment();

  const output = {
    generatedAt: new Date().toISOString(),
    calibration: {
      id: "rcp-generic-2004-2024",
      label: "RCP historical generic-ballot archive, 2004–2024",
      note: "The live-source filter changes the current input. Historical filters use the supplied RCP generic-ballot archives for presidential, midterm, overall, low-turnout midterm, and high-turnout midterm comparisons.",
    },
    composite: {
      dem,
      rep,
      margin: dem - rep,
      asOf,
      sourceCount: usable.length,
      method: config.composite?.method ?? "weighted_mean",
      label: config.composite?.label ?? "Configured aggregate composite",
    },
    sources: results,
    environment,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${usable.length} usable source(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
