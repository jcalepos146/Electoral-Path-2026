import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOUSE_OUT = path.join(ROOT, "public", "data", "cd119.geojson");
const STATES_OUT = path.join(ROOT, "public", "data", "states.geojson");

// Prefer 5M geometry now that the UI supports zooming. 500K gives even more detail,
// while 20M remains a compact fallback if the richer layers are temporarily unavailable.
const HOUSE_ENDPOINTS = [
  ["Census congressional districts 5M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/6/query", 5],
  ["Census congressional districts 500K", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/5/query", 5],
  ["Census congressional districts 20M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/Legislative/MapServer/7/query", 4],
  ["Census TIGERweb congressional districts", "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/8/query", 5],
];

const STATE_ENDPOINTS = [
  ["Census states 5M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/8/query", 5],
  ["Census states 500K", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7/query", 5],
  ["Census states 20M", "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/9/query", 4],
  ["Census TIGERweb states", "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/46/query", 5],
];

const HOUSE_STATE_FIPS = new Set([
  "01","02","04","05","06","08","09","10","12","13","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","44","45","46","47","48","49","50","51","53","54","55","56"
]);
const STATE_FIPS = new Set([...HOUSE_STATE_FIPS, "11"]); // + District of Columbia for the statewide base map.

function queryUrl(base, outFields, precision) {
  const url = new URL(base);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("returnZ", "false");
  url.searchParams.set("returnM", "false");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", "1000");
  url.searchParams.set("geometryPrecision", String(precision));
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

function normalizeHouseFeature(feature) {
  const props = feature?.properties ?? {};
  const state = String(props.STATE ?? String(props.GEOID ?? "").slice(0, 2)).padStart(2, "0");
  let cd = String(props.CD119 ?? String(props.GEOID ?? "").slice(2)).padStart(2, "0");
  if (cd === "00") cd = "01";
  if (!HOUSE_STATE_FIPS.has(state) || !feature?.geometry) return null;
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

function normalizeStateFeature(feature) {
  const props = feature?.properties ?? {};
  const fips = String(props.STATE ?? props.GEOID ?? "").padStart(2, "0").slice(0, 2);
  if (!STATE_FIPS.has(fips) || !feature?.geometry) return null;
  return {
    type: "Feature",
    properties: {
      GEOID: fips,
      STATE: fips,
      STUSAB: props.STUSAB ?? null,
      NAME: props.NAME ?? props.BASENAME ?? null,
      BASENAME: props.BASENAME ?? props.NAME ?? null,
    },
    geometry: feature.geometry,
  };
}

async function fetchCollection({ endpoints, outFields, normalize, expected, name, outPath }) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const failures = [];
  for (const [label, base, precision] of endpoints) {
    try {
      const data = await fetchJson(queryUrl(base, outFields, precision));
      const features = (Array.isArray(data?.features) ? data.features : []).map(normalize).filter(Boolean);
      const unique = new Map(features.map((feature) => [feature.properties.GEOID, feature]));
      const clean = [...unique.values()].sort((a, b) => a.properties.GEOID.localeCompare(b.properties.GEOID));
      if (clean.length !== expected) throw new Error(`expected ${expected} features; got ${clean.length}`);
      const collection = {
        type: "FeatureCollection",
        name,
        source: label,
        generatedAt: new Date().toISOString(),
        features: clean,
      };
      await fs.writeFile(outPath, JSON.stringify(collection));
      const stat = await fs.stat(outPath);
      console.log(`Wrote ${path.relative(ROOT, outPath)} from ${label}: ${clean.length} features, ${(stat.size / 1024).toFixed(1)} KB`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${label}: ${message}`);
      console.warn(`Geometry source failed — ${label}: ${message}`);
    }
  }
  throw new Error(`No geometry source succeeded for ${name}. ${failures.join(" | ")}`);
}

await fetchCollection({
  endpoints: HOUSE_ENDPOINTS,
  outFields: "GEOID,STATE,CD119,BASENAME,NAME",
  normalize: normalizeHouseFeature,
  expected: 435,
  name: "119th Congressional Districts",
  outPath: HOUSE_OUT,
});

await fetchCollection({
  endpoints: STATE_ENDPOINTS,
  outFields: "GEOID,STATE,STUSAB,NAME,BASENAME",
  normalize: normalizeStateFeature,
  expected: 51,
  name: "States and District of Columbia",
  outPath: STATES_OUT,
});
