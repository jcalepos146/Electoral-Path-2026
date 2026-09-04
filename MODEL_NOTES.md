# Current model and deployment notes

## Model preview — September 4, 2026

Using the bundled RCP fallback generic-ballot margin of **D+5.7** and the v1 model's 60-days-to-election historical correction:

- Mean historical remaining movement: **-2.74 points** (negative = Republican movement)
- Median historical remaining movement: **-2.80 points**
- Mean-correction projected final margin: **D+2.96**
- Approximate vote-share translation: **D 50.1% / R 47.1% / Other 2.8%**

Historical analogs at 60 days:

- 2006: snapshot +9.6, final +7.9, movement -1.7 (5 polls)
- 2010: snapshot -4.0, final -6.8, movement -2.8 (18 polls)
- 2014: snapshot +0.0, final -5.7, movement -5.7 (6 polls)
- 2018: snapshot +8.2, final +8.4, movement +0.2 (13 polls)
- 2022: snapshot +0.9, final -2.8, movement -3.7 (14 polls)

## GitHub Pages data flow

The website is now a pure static export. The old runtime `/api/rcp` route has been removed because GitHub Pages cannot execute server-side Next.js code.

`.github/workflows/pages.yml` runs hourly and on every push to `main`. It:

1. installs dependencies;
2. runs `scripts/update_live_data.mjs`;
3. fetches every enabled feed in `config/sources.json`;
4. stores the public, key-free results in `public/data/live-aggregates.json`;
5. builds the Next.js static export;
6. deploys `out/` to GitHub Pages.

Keyed feeds use the three GitHub-secret slots documented in `SOURCES.md`. This design keeps secrets out of the browser and also avoids depending on third-party CORS configuration.

## Why the path model differs from the earlier D+4.4 back-of-the-envelope

The earlier calculation used only polls whose fieldwork ended from September 1–10 in each cycle and found an average Democratic tilt of about 1.3 points. The website's v1 path model instead uses a reproducible **trailing 14-day polling average at the exact same days-to-election point** for every historical cycle. At 60 days out, that method produces a larger average Republican movement of about 2.7 points.

Neither should be treated as a law of nature. The next model-development step should be leave-one-cycle-out backtesting of several window lengths and weighting rules.
