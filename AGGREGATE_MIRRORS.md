# Aggregate mirrors

Election Path now displays four side-by-side generic-ballot source cards:

1. RealClearPolling
2. VoteHub
3. HillCast
4. America First Insight

The cards show only the deployed topline/margin, status, timestamp, and a link back to the original source. They do not mirror or republish provider pages.

- **RCP:** automatic public-page parse with cached fallback.
- **VoteHub:** first attempts the official averages page; if that client-rendered page is unavailable to GitHub Actions, the site uses a clearly labeled API-derived blend from VoteHub's free polling API. The API-derived value is not labeled as VoteHub's official average.
- **HillCast:** margin-only when only the published net margin is available. Weekly district CSV uploads remain the district prior and are separate from the national generic-ballot margin.
- **AFI:** attempts the public dashboard. Because the dashboard is client-rendered, you can optionally set `AFI_GENERIC_DEM`, `AFI_GENERIC_REP`, or `AFI_GENERIC_MARGIN` as GitHub Actions repository variables.

The national composite averages source margins. Full D/R share values are anchored only by sources that actually publish or supply both party shares.
