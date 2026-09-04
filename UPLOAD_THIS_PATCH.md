# Build rescue patch

This patch fixes the Next.js error:

`Module not found: Can't resolve '@/data/demographic-baseline-2026.json'`

Upload the contents of this folder to the repository root on `main`.

The required resulting path is exactly:

`data/demographic-baseline-2026.json`

Do not place it under `public/data/` and do not rename it.

After committing, the existing GitHub Pages build workflow should run again automatically.
