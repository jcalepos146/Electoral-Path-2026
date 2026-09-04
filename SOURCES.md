# Sources

## Historical generic ballot

RealClearPolling PDF exports for:

- 2004
- 2006
- 2008
- 2010
- 2012
- 2014
- 2016
- 2018
- 2020
- 2022
- 2024

The supplied PDFs provide the poll rows and final nationwide House popular-vote toplines used by `scripts/build_historical_data.py`.

## Live generic-ballot sources

Configured in `config/sources.json`:

- RealClearPolling generic congressional vote
- VoteHub 2026 generic ballot
- Decision Desk HQ national generic ballot
- Optional JSON/CSV API slots

## Presidential approval

The updater attempts to read:

- RealClearPolling President Trump Job Approval
- The latest Echelon Insights Verified Voter Omnibus page

Bundled last-known readings are used if a scheduled fetch fails.

## Turnout enthusiasm

`data/echelon-enthusiasm.json` contains endpoint values transcribed from the Echelon enthusiasm chart supplied with the project. The metric is **Extremely motivated**.

## 2025 actual-electorate calibration

`data/exit-poll-calibration-2025.json` contains approval readings from CNN Voter Poll / SSRS exit-poll PDFs supplied for:

- New Jersey governor
- Virginia governor
- New York City mayor
- California Proposition 50

## Midterm turnout classification

The low/high midterm split uses U.S. Census Bureau CPS Voting and Registration turnout among the citizen voting-age population:

- 2006 — 47.8%
- 2010 — 45.5%
- 2014 — 41.9%
- 2018 — 53.4%
- 2022 — 52.2%

The project defines **High Turnout Midterm** as at least 50% and **Low Turnout Midterm** as below 50%.
