# Live source setup

Election Path's live generic-ballot panel is designed around four public sources:

- RealClearPolling
- VoteHub
- HillCast
- America First Insight (AFI)

Decision Desk HQ is no longer enabled in the default configuration.

## RealClearPolling

The GitHub Action reads the public generic-ballot average and keeps a bundled last-known snapshot as a fallback if the markup changes.

## VoteHub — no signup or key required

Election Path first tries to read VoteHub's published public average. If that markup becomes unreadable, the updater requests VoteHub's free polling API and builds a clearly labeled **VoteHub API-derived blend**.

The derived blend is not represented as VoteHub's official average. It uses one current observation per pollster, prefers LV over RV over adults on the same date, uses a 28-day window, and applies a 14-day half-life.

## HillCast — automatic margin source

Election Path reads Preston Hill's public **HillCast Generic Congressional Ballot Polling Average** article and extracts the latest stated Democratic or Republican lead.

HillCast's article reliably exposes the net generic-ballot margin in text, while its support charts are embedded interactives. Election Path therefore treats HillCast as a **margin-only source** when D/R support shares are not present in the fetched page.

Margin-only sources still participate fully in the composite margin. They do not invent Democratic and Republican support shares.

## America First Insight — public dashboard + repository-variable fallback

AFI has a public 2026 generic-ballot dashboard with weighted, unweighted, and bias-adjusted methods, pollster-grade filters, and a CSV download control. The current dashboard is client-rendered, so a simple GitHub Action HTML request may see the shell before the chart data are inserted.

Election Path therefore does this:

1. Attempt to parse the public AFI generic-ballot dashboard automatically.
2. If the topline is not present in the fetched HTML, use GitHub repository variables.

In your GitHub repository go to:

`Settings → Secrets and variables → Actions → Variables`

You may enter either full party shares:

- `AFI_GENERIC_DEM`
- `AFI_GENERIC_REP`
- `AFI_GENERIC_ASOF`

or just AFI's displayed net margin:

- `AFI_GENERIC_MARGIN` — positive numbers mean Democratic lead; negative numbers mean Republican lead
- `AFI_GENERIC_ASOF`

Example: if AFI shows Democrats +5.2 on September 4, 2026:

- `AFI_GENERIC_MARGIN = 5.2`
- `AFI_GENERIC_ASOF = 2026-09-04`

If you enter D/R shares, they help estimate the current major-party support total. If you enter only a margin, AFI affects the composite margin but does not alter the observed D+R total.

These values are ordinary repository **variables**, not secrets.

## How the mixed composite works

Not every provider exposes the same fields. RCP and VoteHub generally provide both D and R shares. HillCast may provide only a net margin, and AFI may be either full-share or margin-only depending on how it is ingested.

Election Path therefore calculates:

1. A weighted mean **generic-ballot margin** using every usable source.
2. A weighted mean **D+R support total** using only sources that publish both party shares.
3. Composite D and R shares by splitting that observed D+R total around the composite margin.

This lets margin-only sources influence the direction and size of the generic-ballot lead without fabricating undecided/other-voter levels.

## GitHub Pages architecture

All fetching happens in the GitHub Action before the static build. The deployed Pages site contains only the generated JSON snapshot and does not expose credentials.
