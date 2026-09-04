# Weekly HillCast district uploads

Drop the newest Preston Hill district wrapper CSV in this folder and name it:

`hillcast-YYYY-MM-DD.csv`

Example: `hillcast-2026-09-11.csv`

The GitHub Pages workflow runs `npm run update-districts`, selects the newest dated CSV, validates that district IDs are unique, and creates `public/data/hillcast-districts.json` for the interactive map. Older files remain here as a weekly archive.
