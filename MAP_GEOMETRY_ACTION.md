# Congressional map geometry: dedicated GitHub Action

The congressional map should not depend on Census being reachable during every normal Pages build.

This patch separates the geometry into its own workflow:

- `.github/workflows/refresh-geometry.yml`
- `scripts/refresh_geometry.mjs`
- output: `public/data/cd119.geojson`

## First run

After uploading the patch, open **Actions → Refresh congressional district geometry → Run workflow**.

The workflow tries four official Census layers, validates that exactly **435** state House districts were returned, and commits the GeoJSON into `main`. The Pages workflow is configured to run again after a successful geometry refresh.

Once `public/data/cd119.geojson` exists in the repository, ordinary hourly Pages rebuilds no longer need to contact Census for map boundaries.

The geometry workflow also runs monthly. Congressional boundaries are not a fast-changing input, so fetching them every hour adds failure risk without adding useful freshness.

## Why the old page showed a placeholder

The prior deployment attempted to fetch geometry during the ordinary Pages build. If that fetch failed, Next.js still built and deployed successfully, but `cd119.geojson` did not exist, so the map component displayed its fallback message.
