import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data", "cd119.geojson");

// Generalized 119th-district layers from the Census TIGERweb January 1, 2024 vintage.
// Try the lightest geometry first; fall back to progressively more detailed layers and
// then the non-generalized TIGERweb Legislative service.
const ENDPOINTS = [
  ["Census generalized 20M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/7/query"],
  ["Census generalized 5M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/6/query"],
  ["Census generalized 500K", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/5/query"],
  ["Census TIGERweb ACS 2024", "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/8/query"],
];

const STATE_FIPS = new Set([
  "01","02","04","05","06","08","09","10","12","13","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","44","45","46","47","48","49","50","51","53","54","55","56"
]);

function queryUrl(base) {
  const url = new URL(base);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "GEOID,STATE,CD119,BASENAME,NAME");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("returnZ", "false");
  url.searchParams.set("returnM", "false");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", "1000");
  url.searchParams.set("geometryPrecision", "4");
  url.searchParams.set("f", "geojson");
  return url;
}

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          Accept: "application/geo+json, application/json;q=0.9, */*;q=0.1",
          "User-Agent": process.env.ELECTION_PATH_USER_AGENT || "ElectoralPath2026/1.0 (public civic data refresh)",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`non-JSON response (${text.slice(0, 80).replace(/\s+/g, " ")})`); }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fetch failed");
}

function normalizeFeature(feature) {
  const props = feature?.properties ?? {};
  const state = String(props.STATE ?? String(props.GEOID ?? "").slice(0, 2)).padStart(2, "0");
  let cd = String(props.CD119 ?? String(props.GEOID ?? "").slice(2)).padStart(2, "0");
  if (cd === "00") cd = "01";
  if (!STATE_FIPS.has(state)) return null;
  if (!feature?.geometry) return null;
  return {
    type: "Feature",
    properties: {
      GEOID: `${state}${cd}`,
      STATE: state,
      CD119: cd,
      BASENAME: props.BASENAME ?? cd,
      NAME: props.NAME ?? null,
    },
    geometry: feature.geometry,
  };
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
const failures = [];
for (const [label, base] of ENDPOINTS) {
  try {
    const data = await fetchJson(queryUrl(base));
    const features = (Array.isArray(data?.features) ? data.features : [])
      .map(normalizeFeature)
      .filter(Boolean);
    const unique = new Map(features.map((f) => [f.properties.GEOID, f]));
    const clean = [...unique.values()].sort((a, b) => a.properties.GEOID.localeCompare(b.properties.GEOID));
    if (clean.length !== 435) throw new Error(`expected 435 state House districts; got ${clean.length}`);
    const collection = {
      type: "FeatureCollection",
      name: "119th Congressional Districts",
      source: label,
      generatedAt: new Date().toISOString(),
      features: clean,
    };
    await fs.writeFile(OUT, JSON.stringify(collection));
    const stat = await fs.stat(OUT);
    console.log(`Wrote ${path.relative(ROOT, OUT)} from ${label}: ${clean.length} features, ${(stat.size / 1024).toFixed(1)} KB`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    console.warn(`Geometry source failed — ${label}: ${message}`);
  }
}
throw new Error(`No Census geometry source succeeded. ${failures.join(" | ")}`);
