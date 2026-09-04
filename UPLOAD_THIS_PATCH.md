# Upload Election Path v0.8

Upload **everything inside this folder** to the root of the GitHub `main` branch and replace matching files.

This patch assumes the current working v0.7 master is already deployed. It adds the HillCast/Datawrapper Senate wrapper, the Senate demographic scenario engine, and removes the gubernatorial map UI.

After committing, let **Build, refresh data, and deploy Pages** finish. The build order is:

1. refresh live aggregate data
2. rebuild HillCast House district data and district demographics
3. build Senate race data and aggregate district demographics to states
4. build the static Next.js site
5. deploy Pages

For weekly Senate updates, add the newest Datawrapper CSV to `data/senate_uploads/` with a dated filename such as `senate-hillcast-2026-09-11.csv`.
