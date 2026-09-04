# Zoomable House + Senate maps

## House map

The 435-district House map supports wheel/trackpad zoom, drag-to-pan, click-to-inspect, keyboard selection, reset, and fullscreen mode.

## Senate map

The statewide map is now Senate-only. It uses the HillCast/Datawrapper Senate wrapper as the race prior and applies the same 2026 demographic scenario controls used by the House map.

Upload dated Senate CSVs to `data/senate_uploads/`, for example:

- `senate-hillcast-2026-09-04.csv`
- `senate-hillcast-2026-09-11.csv`

The build selects the newest dated file and generates `public/data/statewide-races.json`.

The build also aggregates the House Census demographic rows to state-level shares and writes `public/data/state-demographics.json`.

The Senate scenario margin is the HillCast prior plus a demographic change from the published 2026 baseline. In preserve-national mode, the national component is subtracted so only relative state geography changes; full-coalition mode applies the full local demographic swing.

The gubernatorial map is intentionally removed from the UI for now. The reusable state geometry remains in place for a future governor model.
