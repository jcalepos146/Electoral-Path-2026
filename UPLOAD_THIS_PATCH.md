# Upload instructions

Upload every file/folder inside this patch to the root of `main`, replacing matching files.

Important hidden workflow files:

- `.github/workflows/pages.yml`
- `.github/workflows/refresh-geometry.yml`

Visible copies are also included under `workflow-backup/`.

After the commit:

1. The normal Pages workflow will run automatically.
2. Open **Actions → Refresh congressional district geometry → Run workflow** once if it did not start automatically.
3. Wait for that workflow to commit `public/data/cd119.geojson`.
4. A successful geometry workflow triggers another Pages build.
5. Hard-refresh the deployed site after the second Pages deployment finishes.
