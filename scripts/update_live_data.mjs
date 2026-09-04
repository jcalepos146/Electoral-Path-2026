import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config", "sources.json");
const OUTPUT_PATH = path.join(ROOT, "public", "data", "live-aggregates.json");
const USER_AGENT =
  process.env.ELECTION_PATH_USER_AGENT ||
  "ElectionPath/1.0 (+public election aggregate research; scheduled cached request)";

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
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const match = String(value).match(/(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
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
  let url = new URL(source.url);

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
    const response = await fetch(url, { headers, signal: controller.signal });
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

  // Preferred shape: "48.0 Democrats +5.7 42.3 Republicans" (or reversed).
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

  // Table-oriented fallback: search nearby for two party-labeled percentages.
  const partyMatches = [...section.matchAll(/(Democrats|Republicans)[^0-9]{0,40}(\d{2}(?:\.\d+)?)/gi)];
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
  if (source.adapter === "rcp_html") {
    return parseRcp(await fetchText(source));
  }
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
  if (source.adapter === "csv") {
    return parseCsv(await fetchText(source), source);
  }
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

  const output = {
    generatedAt: new Date().toISOString(),
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
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} with ${usable.length} usable source(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
