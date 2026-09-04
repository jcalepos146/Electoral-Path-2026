# Upload MASTER v0.8 cumulative hotfix

This ZIP is cumulative. It includes the full working MASTER v0.7 baseline plus the v0.8 Senate changes.

Upload the **contents** of this folder to the repository root on `main`, replacing matching files.

The key compile fix is `app/mapViewport.ts`, which exports `shouldSuppressClick()` used by both the House and Senate interactive maps.

After committing, let the Pages workflow run. You do not need to re-apply earlier patches.
