# Demographic polling-error extension

Election Path can be extended from a national generic-ballot model into a demographic polling-error model, but two different datasets are required.

## 1. Current demographic polling

Potential groups include:

- Men
- Women
- Black / African American voters
- Hispanic voters
- White voters
- Democrats
- Independents
- Republicans

DDHQ publicly exposes these filter categories on its generic-ballot interface, but the actual demographic averages are a **premium feature**. Election Path should not scrape around or bypass that restriction.

If you have authorized API/export access, add the feed to `config/demographic-sources.json` using a JSON or CSV mapping and keep any key in GitHub Actions Secrets.

## 2. Historical demographic benchmarks

Current demographic averages alone cannot tell us a demographic-specific polling error. For each historical cycle, we need a comparable pre-election polling measure and a comparable final-vote benchmark.

A useful row would conceptually look like:

```json
{
  "year": 2022,
  "group": "hispanic",
  "daysToElection": 60,
  "pollDem": 58.0,
  "pollRep": 35.0,
  "finalDem": 60.0,
  "finalRep": 39.0,
  "definition": "national House vote, self-identified Hispanic voters"
}
```

The definition matters. Exit-poll categories, validated-voter studies, pollster crosstabs, and voter-file estimates do not always measure the same population. We should not silently mix them.

## Proposed demographic model

Once the historical data exist:

```text
demographic remaining movement
  = final demographic margin - polling demographic margin at the same days-to-election

2026 projected demographic margin
  = current demographic polling margin + historical demographic remaining movement
```

The UI can then expose a second filter:

```text
Population: Overall | Men | Women | Black | Hispanic | White | ...
```

and show both the current demographic polling average and the historically adjusted estimate.

## Current repo state

`data/historical-demographics.json` is intentionally empty. No demographic correction is applied until validated history is added.
