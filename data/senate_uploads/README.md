# Weekly HillCast Senate wrapper uploads

Drop the newest Senate Datawrapper CSV here and give it a dated filename, for example:

- `senate-hillcast-2026-09-04.csv`
- `senate-hillcast-2026-09-11.csv`

The build selects the newest dated Senate CSV automatically. The importer accepts the raw HillCast/Datawrapper columns used by chart `h1bWr` (`id`, `rating`, `dem_candidate`, `dem_win_chance`, `rep_candidate`, `rep_win_chance`, `other_candidate`, `projected_margin`, etc.).

Only rows whose `id` resolves to a U.S. state are imported; Datawrapper summary/footer rows are ignored.
