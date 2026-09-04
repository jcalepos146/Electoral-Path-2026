# Election Path 2026 — Start Here

This is the **complete source repository**. You do not need an `index.html` in `main`: GitHub Actions builds the Next.js app and publishes the generated `out/` folder to GitHub Pages.

## One-folder upload

1. Unzip `Election-Path-2026-ONE-UPLOAD.zip`.
2. Open the extracted `Election-Path-2026-ONE-UPLOAD` folder.
3. In your GitHub repository, choose **Add file → Upload files**.
4. Drag **everything inside this folder** into the upload area and commit it to `main`.
5. Before continuing, confirm your repository shows **`.github/workflows/pages.yml`** as well as `app/`, `config/`, `data/`, `lib/`, `package.json`, etc.
6. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
7. Open **Actions**. The workflow named **Build, refresh data, and deploy Pages** should run automatically after the upload. You can also open it and choose **Run workflow**.
8. When the deployment job finishes, GitHub Pages will show the public site URL.

## If `.github` did not upload

A second copy of the workflow is included at `workflow-backup/pages.yml`. On GitHub, create a file named:

`.github/workflows/pages.yml`

and paste the contents of `workflow-backup/pages.yml` into it. Commit to `main`, then return to **Actions**.

## Optional live-data API keys

The site works without private API keys using enabled public/fallback sources. For keyed feeds, add repository secrets under:

**Settings → Secrets and variables → Actions → New repository secret**

Supported slots:

- `DATA_SOURCE_1_KEY`
- `DATA_SOURCE_2_KEY`
- `DATA_SOURCE_3_KEY`

Configure the matching source in `config/sources.json`. Never commit actual API keys to the repository.

## What GitHub does automatically

On every push to `main`, manual run, and hourly schedule:

1. installs Node dependencies;
2. refreshes configured aggregate feeds;
3. writes `public/data/live-aggregates.json`;
4. runs the Next.js static build;
5. uploads the generated `out/` directory;
6. deploys it to GitHub Pages.
