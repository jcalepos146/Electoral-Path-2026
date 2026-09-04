# District map + real-time demographic scenario engine

## Model order

The House map is intentionally staged so each input does a different job.

1. **National aggregate / historical path** establishes the selected national House environment.
2. **HillCast district prior** supplies the starting margin, rating, candidate names, and published win odds for each district.
3. **National residual** adds only `Election Path national anchor − HillCast national baseline` to every district.
4. **Demographic scenario swing** measures changes from the published 2026 demographic baseline, not the absolute demographic margin itself.
5. **Geographic normalization** removes the national component of the demographic swing when Preserve national anchor is enabled.

The important change in v0.7 is that the published demographic projection is the **zero-change state**. Leaving every slider at its starting value adds no demographic adjustment to HillCast. This prevents the map from double-counting district composition already implicit in the HillCast prior.

## Real-time demographic math

For each demographic group, the UI has:

- a projected 2026 baseline vote margin;
- a scenario vote-margin slider;
- a relative-turnout slider;
- an implied absolute turnout rate after rescaling to the overall-turnout assumption.

For each district the engine calculates:

`local demographic swing = scenario demographic margin − baseline demographic margin`

It also calculates the same swing nationally:

`national demographic swing = national scenario demographic margin − national baseline demographic margin`

With **Preserve national anchor** enabled:

`geographic demographic effect = local swing − national swing`

and:

`district scenario = HillCast prior + national residual + geographic demographic effect`

This keeps the national margin fixed while redistributing the coalition geographically.

With **Allow demographic national swing** enabled, the national demographic swing is added to the polling anchor. The district-level normalization remains in place, so the final result simplifies conceptually to the HillCast/national baseline plus the full local demographic swing.

## Turnout behavior

The overall-turnout slider sets the expected level of participation. Relative group-turnout sliders reweight the coalition while the national group-turnout rates are rescaled back to that overall turnout level.

A uniform change in overall turnout does not create a partisan margin by itself. Margin changes come from differential group turnout and/or changes in group vote preference. The district inspector also estimates a district turnout rate and approximate vote count from the district CVAP approximation.

## Interactive map behavior

The map supports:

- click a district to inspect it;
- keyboard selection with Enter/Space after tabbing to a district;
- wheel/trackpad zoom;
- drag-to-pan;
- double-click zoom;
- zoom buttons, reset, and fullscreen.

The pointer system waits for a small drag threshold before capturing the pointer. This preserves normal district clicks while still allowing drag-to-pan.

## Weekly HillCast upload

Keep the CSV archive in:

`data/hillcast_uploads/`

Name each new file:

`hillcast-YYYY-MM-DD.csv`

Commit it to `main`. GitHub Actions selects the newest dated CSV and rebuilds `public/data/hillcast-districts.json` automatically.

## Required HillCast columns

- `District`
- `Republican`
- `Democrat`
- `Projected Margin`
- `Republican Odds`
- `Democratic Odds`
- `Rating`

Internally, positive margins are Democratic and negative margins are Republican.

## Demographic data

The scheduled Pages build makes a lightweight district CVAP approximation from the 2024 ACS 5-year API. The UI uses five groups:

- White non-Hispanic
- Black
- Hispanic
- Asian
- Other / residual

The site discloses the normalization limitation. A future exact-data upgrade can replace this with the Census CVAP special tabulation without changing the scenario interface.

## Geometry

Congressional geometry is managed separately by `.github/workflows/refresh-geometry.yml` and committed to:

- `public/data/cd119.geojson`
- `public/data/states.geojson`

The normal Pages build therefore does not depend on a fresh geometry download every time.
