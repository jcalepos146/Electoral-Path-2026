# Start Here

This folder is ready to replace or update the existing Election Path GitHub repository.

## Easiest update

Upload **everything inside this folder** to the root of your existing repository and allow GitHub to replace files with matching names.

Important additions include:

- expanded `data/historical-generic.json` with 2004-2024 cycles
- new presidential/midterm/overall/turnout filters
- new approval + enthusiasm environment panel
- new 2025 exit-poll calibration table
- updated live-data updater

Keep `.github/workflows/pages.yml` in place.

## GitHub Pages

Use:

**Settings → Pages → Source → GitHub Actions**

Do not use "Deploy from a branch" for the source-code repository unless you separately build and publish the `out/` directory.
