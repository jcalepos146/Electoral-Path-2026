# Upload this patch

Upload the contents of the patch ZIP to the **root of your existing `main` branch** and allow matching files to be replaced.

The important new/changed paths are:

- `.github/workflows/pages.yml`
- `app/DistrictScenarioMap.tsx`
- `app/page.tsx`
- `app/globals.css`
- `scripts/update_district_data.mjs`
- `data/hillcast_uploads/hillcast-2026-09-04.csv`
- `data/hillcast_uploads/README.md`
- `public/data/hillcast-districts.json`
- `package.json`
- `DISTRICT_MAP.md`
- `README.md`

After the commit, the existing GitHub Pages workflow should run automatically. Its new district-data step downloads Census district geometry/demographics, processes the newest HillCast CSV, builds the Next.js static export, and deploys Pages.

## Every week after this

You do **not** need another code patch just to update Preston Hill's district data.

1. Download the new CSV.
2. Rename it `hillcast-YYYY-MM-DD.csv`.
3. Open `data/hillcast_uploads/` in GitHub.
4. Use **Add file → Upload files**.
5. Upload the new CSV and commit to `main`.

The newest dated file becomes the active map automatically.
