# Upload checklist

After your GitHub upload, the repository root should contain at least:

- `.github/workflows/pages.yml`
- `app/`
- `config/`
- `data/`
- `lib/`
- `public/`
- `scripts/`
- `package.json`
- `next.config.ts`
- `README.md`
- `START_HERE.md`

You should **not** expect an `index.html` in the source branch. It is generated inside `out/` by the Actions build and deployed from the build artifact.

If the Actions tab does not show **Build, refresh data, and deploy Pages**, the `.github/workflows/pages.yml` file is missing or not on the default `main` branch.
