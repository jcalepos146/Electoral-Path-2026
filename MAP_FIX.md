# Congressional map geometry fix

This patch fixes the blank congressional map state where the page says the Census geometry refresh must succeed.

## What changed

- The browser first loads the deployed `public/data/cd119.geojson` file.
- If that file is missing, the site now tries multiple official U.S. Census Bureau GeoJSON endpoints directly.
- The build script retries Census requests and tries multiple 119th Congressional District generalized layers.
- A failed refresh no longer destroys a previously valid geometry file.
- A **Retry Census map** button is shown if geometry is unavailable.
- A district dropdown remains usable even if the visual geometry is temporarily unavailable.

## Upload

Upload the contents of this patch to the repository root and replace matching files. The important application changes are:

- `app/DistrictScenarioMap.tsx`
- `scripts/update_district_data.mjs`

The `.github/workflows/pages.yml` and `workflow-backup/pages.yml` files are included for completeness; the deployment workflow itself does not need a new secret or variable.

After committing, allow the GitHub Pages Action to finish and hard-refresh the site. If the static geometry fetch still fails during the build, the browser-side Census fallback should load the map when the page opens.
