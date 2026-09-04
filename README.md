# Election Path 2026

Election Path 2026 is a static GitHub Pages model that compares the live U.S. House generic ballot with historical RCP generic-ballot paths and adds presidential-approval, turnout-enthusiasm, and actual-electorate context.

## Historical filters

The model now supports five comparison sets:

- **Presidential** — 2004, 2008, 2012, 2016, 2020, 2024
- **Midterm** — 2006, 2010, 2014, 2018, 2022
- **Overall** — all 11 cycles from 2004 through 2024
- **Low Turnout Midterm** — 2006, 2010, 2014
- **High Turnout Midterm** — 2018, 2022

The turnout split uses the U.S. Census Bureau citizen voting-age turnout series. The project uses a transparent 50% cutoff: 2006 (47.8%), 2010 (45.5%), and 2014 (41.9%) are below it; 2018 (53.4%) and 2022 (52.2%) are above it.

## Generic-ballot model

For every historical cycle and every days-to-election point:

1. Average individual generic-ballot polls whose fieldwork ended in the trailing 14 days.
2. Compute the historical polling margin.
3. Compare that snapshot with the final nationwide House popular-vote margin.
4. Use the mean or median remaining movement from the selected historical filter.

A positive margin is Democratic; a negative margin is Republican.

The site is an extrapolation tool, not a probabilistic election forecast. Movement between a polling snapshot and Election Day can represent both real opinion change and polling error.

## Live generic-ballot inputs

The scheduled GitHub Action attempts to refresh:

- RealClearPolling
- VoteHub
- Decision Desk HQ
- Any optional JSON/CSV sources configured in `config/sources.json`

If a public page changes markup or rejects the request, the updater can fall back to the bundled last-known reading rather than breaking the Pages build.

## Electoral-environment panel

The site also displays, separately from the House-vote correction:

- RCP presidential approval average
- Latest Echelon Verified Voter Omnibus presidential approval
- Echelon "extremely motivated" turnout context from the supplied chart
- 2025 CNN/SSRS exit-poll approval readings for New Jersey, Virginia, New York City, and California

These indicators are deliberately **not silently merged** into the generic-ballot correction. They are displayed as separate evidence until enough historical observations exist to validate an approval/enthusiasm weighting rule.

## Run locally

```bash
npm install
npm run update-data
npm run dev
```

Build the static site:

```bash
npm run build
```

Next.js writes the GitHub Pages artifact to `out/`.

## Deploy to GitHub Pages

1. Upload the project contents to the root of your repository.
2. Go to **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Commit to `main`.

The included `.github/workflows/pages.yml` refreshes public data, builds the static export, and deploys it.

## Rebuild the historical dataset

The repository contains `scripts/build_historical_data.py`. To regenerate the historical JSON, place the 11 RCP PDF exports in one directory using their original names and run:

```bash
python scripts/build_historical_data.py --pdf-dir /path/to/pdfs --out data/historical-generic.json
```

The script requires Poppler's `pdftotext` command.

## Data provenance

See `SOURCES.md` and `MODEL_NOTES.md` for methodology and source notes.

## License

MIT. See `LICENSE`.
