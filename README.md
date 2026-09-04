# Election Path 2026

> **One-folder release:** This directory is the complete repository. Upload everything inside this folder to the root of a new GitHub repository; no other download is required. See [START_HERE.md](START_HERE.md) for the shortest deployment path.

A GitHub-Pages-ready Next.js static site that takes a 2026 House generic-ballot aggregate and estimates the Election Day national House popular-vote margin from the historical path of the last five midterms: **2006, 2010, 2014, 2018, and 2022**.

## What changed in the GitHub Pages edition

GitHub Pages serves static files, so Election Path no longer depends on a Next.js API route at runtime. Instead:

1. A scheduled GitHub Actions workflow fetches the configured polling aggregates.
2. Optional API keys come from GitHub repository secrets, never from browser code.
3. The updater writes `public/data/live-aggregates.json`.
4. Next.js performs a static export into `out/`.
5. GitHub Pages deploys that export.
6. The workflow repeats hourly, giving the static site near-real-time aggregate updates without a separate server.

The site automatically handles GitHub project-page subpaths such as `https://USERNAME.github.io/election-path/`.

## Deploy in about five minutes

### 1. Create the repository

Create a GitHub repository, preferably named `election-path`, and copy this project's contents into it. Commit and push to the `main` branch.

### 2. Enable GitHub Pages Actions

In the repository open:

**Settings -> Pages -> Build and deployment -> Source -> GitHub Actions**

The included `.github/workflows/pages.yml` handles refresh, build, and deployment.

### 3. Optional: add aggregate API keys

If you enable one of the keyed source slots in `config/sources.json`, add the matching repository secret under:

**Settings -> Secrets and variables -> Actions**

Supported ready-made secret names:

- `DATA_SOURCE_1_KEY`
- `DATA_SOURCE_2_KEY`
- `DATA_SOURCE_3_KEY`

No key is needed for the bundled RCP HTML adapter.

See **[SOURCES.md](SOURCES.md)** for JSON, CSV, header-key, query-key, fallback, and weighting examples.

### 4. Deploy

Push to `main`, or open **Actions -> Refresh data and deploy GitHub Pages -> Run workflow**.

The same workflow also runs at minute 17 of every hour. GitHub's scheduler may occasionally start later than the exact cron minute.

## Live-data architecture

Source configuration lives in:

```text
config/sources.json
```

The scheduled updater is:

```text
scripts/update_live_data.mjs
```

Its public output is:

```text
public/data/live-aggregates.json
```

The site currently supports three adapter types:

- `rcp_html` — purpose-built RCP generic-ballot parser.
- `json` — map arbitrary dot-path fields from a JSON API/feed.
- `csv` — map named columns from a downloadable CSV.

Visitors can use the weighted composite, choose one individual configured source, or enter a manual what-if value.

## The historical model

1. Democratic margin is positive; Republican margin is negative.
2. For each historical cycle and each `daysToElection` snapshot, the data builder averages polls whose fieldwork **ended during the trailing 14 days**.
3. It calculates `final House popular-vote margin - historical snapshot margin` for each cycle.
4. The default forecast adds the **equal-weight mean historical correction** to the selected 2026 aggregate margin. The UI can switch to the median correction.
5. The site shows every cycle-level analog and the historical min/max range.

This is a **historical-path extrapolator**, not a statistical probability forecast. The difference between a September poll and November results can reflect both polling error and genuine opinion movement.

## Run locally

```bash
npm install
npm run update-data
npm run dev
```

If the live RCP request fails locally, the updater uses `data/last-known-rcp.json`.

To test the exact static output GitHub Pages will receive:

```bash
npm run build
```

Then serve the generated `out/` folder with any simple static HTTP server.

## Rebuild the historical dataset

The generated historical dataset is already included at `data/historical-generic.json`.

To regenerate it from the five RealClearPolling PDF exports, place the PDFs in `source_pdfs/` with these exact names:

- `2006 Generic Congressional Vote _ RealClearPolling.pdf`
- `2010 Generic Congressional Vote _ RealClearPolling.pdf`
- `2014 Generic Congressional Vote _ RealClearPolling.pdf`
- `2018 Generic Congressional Vote _ RealClearPolling.pdf`
- `2022 Generic Congressional Vote _ RealClearPolling.pdf`

Install Poppler so `pdftotext` is available, then run:

```bash
npm run rebuild-history
```

## Important model-development ideas

The 14-day trailing average is transparent and reproducible, but it does not attempt to reconstruct any provider's proprietary historical average exactly. Useful next steps include:

- archive each live aggregate on every scheduled refresh;
- use one observation per pollster within a moving window;
- weight historical polls by recency or pollster quality;
- backtest 7-, 10-, 14-, and 21-day windows using leave-one-cycle-out validation;
- estimate uncertainty bands rather than only the historical analog range;
- add 1998 and 2002 if comparable historical data are obtained.

## Source / affiliation

Historical source data are the RealClearPolling PDF exports supplied for this project. Live aggregate feeds are configured by the repository owner. The project is not affiliated with RealClearPolitics or any other configured provider.
