# Zoomable maps + Senate/Governor groundwork

## House map changes

The House district map is now deliberately wider and taller, and uses the more detailed Census 5M geometry when the dedicated geometry Action can fetch it.

Controls:

- mouse wheel / trackpad: zoom around the pointer
- click + drag: pan
- double-click: zoom in
- `+` / `-`: zoom buttons
- `Reset`: return to the full national view
- `Fullscreen`: expand the map pane to the browser viewport

The current zoom level is displayed in the toolbar.

## Geometry Action

`.github/workflows/refresh-geometry.yml` now builds both:

- `public/data/cd119.geojson` — 435 districts
- `public/data/states.geojson` — 50 states + DC

It prefers Census 5M geometry so zoomed boundaries are less blocky, with 500K/20M fallbacks.

## Senate and governor maps

A new statewide map section is present below the House engine. It has tabs for:

- U.S. Senate
- Governors

The map is fully zoomable/pannable already. Gray states mean no statewide projection has been loaded yet — not tossup.

### Weekly/manual data ingestion

Add dated CSVs to `data/statewide_uploads/`:

- `senate-2026-09-11.csv`
- `governors-2026-09-11.csv`

Minimum format:

```csv
state,margin
PA,D+3.2
GA,R+1.1
```

Optional candidate, rating, source and date columns are documented in `data/statewide_uploads/README.md`.

`npm run update-statewide` selects the newest dated file for each map and writes `public/data/statewide-races.json`.
