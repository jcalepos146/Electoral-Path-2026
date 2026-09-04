# Adding live aggregate sources

Election Path is a **static GitHub Pages site**. Secret API keys cannot safely live in browser JavaScript, so keyed or non-CORS data sources are fetched by the scheduled GitHub Actions workflow. The workflow writes `public/data/live-aggregates.json`, builds the static site, and deploys it.

The default workflow refreshes once per hour. Public visitors never receive your API keys.

## 1. Enable a source

Edit `config/sources.json`. Each source has:

- `id`: stable machine-readable name.
- `name`: display name in the website.
- `enabled`: whether the scheduled updater should use it.
- `adapter`: `rcp_html`, `json`, or `csv`.
- `url`: source endpoint/page.
- `weight`: weight used by the site's composite.
- `auth`: optional GitHub-secret-backed authentication.

The bundled RCP source is enabled and has a last-known fallback snapshot. The other three entries are disabled templates.

## 2. API keys / GitHub Secrets

The workflow exposes three optional secret slots to the updater:

- `DATA_SOURCE_1_KEY`
- `DATA_SOURCE_2_KEY`
- `DATA_SOURCE_3_KEY`

In the GitHub repository, open **Settings -> Secrets and variables -> Actions -> New repository secret** and create the slot(s) you use.

Never paste an API key into `config/sources.json`, the React app, or any file under `public/`.

### Header authentication

```json
{
  "auth": {
    "env": "DATA_SOURCE_1_KEY",
    "mode": "header",
    "name": "Authorization",
    "prefix": "Bearer "
  }
}
```

This creates a request header such as `Authorization: Bearer <secret>`.

### Query-parameter authentication

```json
{
  "auth": {
    "env": "DATA_SOURCE_2_KEY",
    "mode": "query",
    "name": "api_key"
  }
}
```

The secret is appended only to the outgoing Actions request. The public output retains the clean source URL and does not publish the key.

## JSON adapter

Use dot paths to map the provider's response to Democratic share, Republican share, and optionally the data date.

Given:

```json
{
  "data": {
    "generic_ballot": {
      "dem": 47.8,
      "rep": 43.1,
      "updated_at": "2026-09-04T15:30:00Z"
    }
  }
}
```

configure:

```json
{
  "id": "my_json_feed",
  "name": "My JSON aggregate",
  "enabled": true,
  "adapter": "json",
  "url": "https://example.com/api/generic",
  "weight": 1,
  "mapping": {
    "rootPath": "data.generic_ballot",
    "dem": "dem",
    "rep": "rep",
    "asOf": "updated_at"
  }
}
```

Array indexes work in paths, e.g. `results.0.dem`.

## CSV adapter

The first row must contain headers. By default the updater uses the final data row.

```json
{
  "id": "my_csv_feed",
  "name": "My CSV aggregate",
  "enabled": true,
  "adapter": "csv",
  "url": "https://example.com/generic.csv",
  "weight": 1,
  "csv": {
    "delimiter": ",",
    "selectLastRow": true,
    "columns": {
      "dem": "dem_avg",
      "rep": "rep_avg",
      "asOf": "date"
    }
  }
}
```

You can select a subset of rows before taking the first/last match:

```json
"match": { "column": "race", "equals": "generic_ballot" }
```

## RCP HTML adapter

`rcp_html` is a purpose-built parser for the RealClearPolling generic-ballot page. It is intentionally isolated in `scripts/update_live_data.mjs` because page markup can change. If parsing fails, the bundled RCP configuration uses `data/last-known-rcp.json` and clearly labels the result as `fallback`.

## Composite weighting

Every usable source contributes according to `weight`:

```json
{
  "weight": 1
}
```

A source with weight `2` counts twice as much as one with weight `1`. The UI also lets visitors switch from the composite to any individual successfully fetched source.

## Local test

```bash
npm install
npm run update-data
npm run dev
```

If a source uses a key:

```bash
DATA_SOURCE_1_KEY="your-key" npm run update-data
```

Inspect `public/data/live-aggregates.json` to confirm the parsed values before deploying.

## Provider terms

Only connect endpoints you are permitted to access and automate. Some sites prohibit scraping or impose rate limits. Prefer a documented API, downloadable JSON/CSV feed, or another provider-approved endpoint when one exists.
