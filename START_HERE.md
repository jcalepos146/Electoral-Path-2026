# Start Here — GitHub Upload

This folder is the complete Election Path 2026 repository. You do **not** need to merge it with any other download.

## Fastest setup

1. Create a new empty GitHub repository (for example, `election-path`).
2. Unzip the download.
3. Open the extracted `Election-Path-2026-GitHub-Upload` folder.
4. Upload **everything inside it** to the root of the GitHub repository. Keep the folder structure intact, especially `.github/workflows/pages.yml`.
5. Commit the upload to the `main` branch.
6. In GitHub, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
7. Open the **Actions** tab and run **Refresh data and deploy GitHub Pages** if it does not start automatically.

## Optional live aggregate keys

If you configure keyed sources in `config/sources.json`, add their values under:

**Settings → Secrets and variables → Actions → New repository secret**

Supported secret names are:

- `DATA_SOURCE_1_KEY`
- `DATA_SOURCE_2_KEY`
- `DATA_SOURCE_3_KEY`

Do not put secret API keys directly in `index.html`, JavaScript, or committed JSON files.

## Important

The `.github` directory is hidden on some computers. It is required for automatic updating and deployment, so make sure it is included in the upload.
