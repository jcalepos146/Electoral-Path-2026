# Upload this patch

1. Unzip the patch.
2. In the GitHub repository on `main`, choose **Add file → Upload files**.
3. Upload **everything inside the patch folder**, preserving folders and replacing matching files.
4. Commit to `main`.
5. Let the normal Pages workflow run.
6. Also let **Refresh election map geometry** finish. It should create/refresh both `cd119.geojson` and `states.geojson`, then trigger another Pages deployment.

If the hidden `.github` folder is skipped by the browser uploader, copy the equivalent files from `workflow-backup/` into `.github/workflows/` manually.
