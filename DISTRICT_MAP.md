# District map + demographic scenario engine

## What the new layer does

The House map is deliberately built in stages so the inputs complement one another instead of double-counting the same national signal.

1. **National aggregate of aggregates** — the selected RCP / VoteHub / HillCast / AFI composite (or a single source) establishes the national generic-ballot environment.
2. **Historical-path correction** — the selected Presidential / Midterm / Overall / turnout filter turns the current national environment into an Election Day national anchor.
3. **HillCast district prior** — the latest weekly Preston Hill CSV supplies the starting margin, rating, candidates, and published win odds for each House district.
4. **National residual only** — the map adds only `Election Path national anchor − HillCast national baseline` to each HillCast district. The full national margin is never added twice.
5. **Demographic redistribution** — racial/ethnic vote-margin and turnout-index sliders change the geographic distribution of the national vote. By default the demographic effect is centered nationally, so the sliders redistribute the same national environment rather than silently changing it.

The district inspector shows the arithmetic for the selected district:

`HillCast prior + national residual + demographic geographic effect = scenario margin`

## Weekly HillCast upload

Keep the CSV archive in:

`data/hillcast_uploads/`

Name each new file:

`hillcast-YYYY-MM-DD.csv`

Example:

`hillcast-2026-09-11.csv`

Commit it to `main`. GitHub Actions selects the newest dated CSV and rebuilds `public/data/hillcast-districts.json` automatically. Older CSVs remain in the repository as an archive.

## Required HillCast columns

The parser expects:

- `District`
- `Republican`
- `Democrat`
- `Projected Margin`
- `Republican Odds`
- `Democratic Odds`
- `Rating`

District margins are converted internally to a single convention: **positive = Democratic, negative = Republican**.

## Map geography

The build downloads the Census Bureau's generalized 119th Congressional District GeoJSON and stores it in `public/data/cd119.geojson`. Alaska and Hawaii are drawn as insets by the client-side SVG renderer.

## Demographic data

The build also makes a lightweight district CVAP approximation from the 2024 ACS 5-year API using the B05003 race/origin tables. The website exposes five scenario groups:

- White non-Hispanic
- Black
- Hispanic
- Asian
- Other / residual

This lightweight API method is intentionally disclosed as an approximation because the Black and Asian race-alone tables are not perfectly mutually exclusive with Hispanic origin. The build normalizes the categories before using them. A future exact-data upgrade can replace this with the Census 2020–2024 CVAP Special Tabulation without changing the map UI.

## Demographic controls

**Vote margin** runs from R+100 to D+100 for each group.

**Turnout index** runs from 50 to 150, where 100 is neutral. It is a relative scenario weight, not a claim that the group literally turns out at 100%.

### Preserve national anchor — default

The demographic model computes a national demographic margin and subtracts it back from each district-specific demographic margin. That means demographics only redistribute the vote geographically while preserving the selected Election Path national anchor.

### Demographics set national margin

This optional mode allows the user-specified demographic coalition itself to establish the national environment. It is a what-if mode and is labeled accordingly.

## Generated files

`npm run update-districts` creates:

- `public/data/hillcast-districts.json`
- `public/data/district-demographics.json`
- `public/data/cd119.geojson`

The GitHub Pages workflow runs this after the live national polling refresh and before `next build`.
