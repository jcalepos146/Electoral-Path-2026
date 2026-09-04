# Model Notes

## Generic-ballot historical path

Election Path works in Democratic-minus-Republican margin space.

For a historical cycle `y` and snapshot `d` days before Election Day:

```text
snapshot_margin[y,d] = trailing-14-day mean Democratic share - Republican share
correction[y,d]      = final House margin[y] - snapshot_margin[y,d]
```

For the selected historical filter, the forecast adds the equal-weight mean or median historical correction to the current generic-ballot margin.

## Historical filters

| Filter | Cycles |
|---|---|
| Presidential | 2004, 2008, 2012, 2016, 2020, 2024 |
| Midterm | 2006, 2010, 2014, 2018, 2022 |
| Overall | All 11 cycles |
| Low Turnout Midterm | 2006, 2010, 2014 |
| High Turnout Midterm | 2018, 2022 |

Low/high turnout is based on U.S. Census citizen voting-age turnout with a 50% threshold. This produces a clean historical split without estimating 2026 turnout in advance.

## Why include presidential generic ballots?

Presidential-election-year generic ballots provide additional observations on polling behavior, undecided-voter resolution, and late-cycle movement. The **Overall** filter therefore has a larger sample than the midterm-only model, while the site still lets users isolate midterms when they prefer the more structurally similar comparison.

## Approval and enthusiasm

Presidential approval and Echelon enthusiasm are displayed as independent contextual variables. The current version does not convert them into a synthetic "true approval" number or automatically add them to the House margin.

That restraint is intentional: exit-poll approval, ordinary approval polling, generic ballots, and turnout enthusiasm measure different populations and concepts. The 2025 actual-electorate rows are included so a future version can backtest any proposed adjustment before using it.

## Small-sample caution

The High Turnout Midterm filter has only two cycles (2018 and 2022). Its output should therefore be read as a narrow historical comparison rather than a stable population estimate.
