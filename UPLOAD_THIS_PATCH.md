# Upload MASTER v0.9 cumulative patch

1. Unzip `Election-Path-2026-MASTER-v0.9-FINANCE-POLLING-PATCH.zip` locally.
2. In GitHub, open the repository root on `main` and choose **Add file → Upload files**.
3. Drag the **contents** of the unzipped folder, preserving the existing folder structure, and commit to `main`.
4. Matching paths should be replaced. Do not delete existing `public/data/cd119.geojson` or `public/data/states.geojson` if GitHub does not show them in the patch; the geometry workflow owns those files.
5. Wait for **Build, refresh data, and deploy Pages** to finish. The new build runs the FEC finance refresh and race-polling mirror refresh before `next build`.

This is cumulative over the v0.8 hotfix for the app/scripts/workflows it touches. You do not need to reapply earlier patches afterward.
