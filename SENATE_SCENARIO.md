# Senate demographic scenario engine

The Senate map now uses the HillCast/Datawrapper `h1bWr` CSV as the race-by-race prior and applies the same projected 2026 racial/ethnic vote margins and relative-turnout controls used by the House engine.

## Weekly Senate update

Download the newest Datawrapper CSV and place it in:

`data/senate_uploads/`

Name it with a date, for example:

`senate-hillcast-2026-09-11.csv`

The build selects the newest dated Senate CSV, parses the valid state rows, and writes `public/data/statewide-races.json`.

## Scenario math

For each state, the engine calculates the change from the published demographic baseline. The state-specific demographic swing depends on the state's Census-derived demographic composition and the user-selected group margins/relative turnout.

In **Preserve national Senate environment** mode:

`state demographic effect = state demographic swing - national demographic swing`

`scenario Senate margin = HillCast prior + state demographic effect`

In **Allow full national coalition swing** mode:

`scenario Senate margin = HillCast prior + state demographic swing`

This means a demographic or turnout scenario can change which party leads an individual Senate race. The original HillCast win probabilities remain displayed only as source reference values; they are not automatically recalibrated from the scenario margin.

## Governor map

The gubernatorial map UI has been removed for now. The state geometry remains reusable if a governor model is added later.
