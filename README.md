# 2026 Midterm Election Results

An interactive results site for the Nov. 3, 2026 U.S. midterm elections: Senate, House and governor results, county maps of margin, swing, trend and turnout, statewide ballot measures, voter-poll breakdowns, and a what-if simulator.

**Live site:** https://jcalepos146.github.io/Electoral-Path-2026/

It's a static site with no build step: plain HTML, CSS and JavaScript, [d3](https://d3js.org) from a CDN, and JSON data files.

## What's on the site

| Tab | What it shows |
|---|---|
| Overview | Seat counts for the Senate (with senators not up this year), House and governors; seats that changed party |
| Senate / House / Governors | State tile maps and a table of every race; uncalled races marked |
| Voter trends | National House vote by group from the 2026 Voter Poll |
| County map | Every county: 2026 margin, swing from 2024 or 2020, trend vs. the nation, and turnout vs. 2024 or 2020, for each state's top race, Senate, governor or all House districts combined; plus a state map of each race vs. the national environment |
| Ballot measures | Statewide measures with yes/no counts and descriptions |
| Turnout | Who turned out by 2024 vote, estimated turnout rates by past vote, and 2026 votes cast vs. 2024 and 2020 by state |
| Simulator | Sliders for the national environment, Trump approval, and turnout among 2024 (or 2020) Trump voters, Harris (or Biden) voters and people who skipped 2024; re-runs every Senate, House and governor race |

## Data sources

| Data | Source | Notes |
|---|---|---|
| Race calls, candidates, statewide vote shares in the race tables | Associated Press results as compiled on Wikipedia's 2026 House, Senate and governor election pages | Snapshot Nov. 8, 2026; calls rechecked Nov. 9. Wikipedia text and data are CC BY-SA 4.0 |
| 2026 county results (Senate, governor, House), House district margins, statewide turnout, ballot measure counts | [civicAPI](https://civicapi.org) | Unofficial counts as of Nov. 9, 2026. civicAPI is free to use with attribution and doesn't say where its data comes from; its statewide totals agree with AP-reported results within 1.5 points everywhere |
| Ballot measure descriptions | Wikipedia, "2026 United States ballot measures" | CC BY-SA 4.0 |
| 2024 and 2020 presidential results by county | [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) | |
| County and state outlines | [us-atlas](https://github.com/topojson/us-atlas) (Census cartographic boundaries) | Albers USA projection |
| Voter poll | 2026 Voter Poll by SSRS for the AP and partner networks, national House results as published by CNN and transcribed on Wikipedia | Survey estimates, not counts |
| 2024 eligible population and ballots cast | UF Election Lab | Used for turnout rates of people who skipped 2024 |
| Uncalled-race notes | AP reporting on the Mississippi count, the Kansas Secretary of State, and Alaska's ranked-choice timetable | |

Data from civicAPI (civicapi.org).

## Method notes and caveats

- **Swing** is a county's 2026 margin minus its presidential margin. **Trend** is that swing minus the national shift over the same period. The national 2026 environment is the House vote summed across all districts (D+13.2 on 115.0 million votes as of Nov. 9); 2024 and 2020 national margins come from summed county results.
- **"Top race"** on the county map is each state's Senate race, else its governor race, else its House races combined, skipping races where an independent finished in the top two.
- **House layers** leave out counties in a district that one party didn't contest.
- **Alaska** reports 2020 and 2024 results by state house district, so the map shows 2026 margins only. **Connecticut's** 2024 results are by planning region, so its comparisons with 2024 are blank.
- **The simulator** starts each race at its actual margin and adds the national shift, an approval effect (each point moves voters between "somewhat approve" and "somewhat disapprove") and a turnout effect. Turnout rates come from the voter poll's mix of 2026 voters, the 2026 House vote count and each group's earlier vote total. Alaska's ranked-choice races assume votes for eliminated Republicans transfer to the leading Republican. It's a what-if tool, not a forecast.
- Some measures need a supermajority to pass (for example Florida amendments and most Colorado constitutional amendments), so a yes lead doesn't always mean a measure passed.
- This is a snapshot. Counts keep changing until states certify.

## Running it locally

The page loads its data with `fetch`, so serve the folder instead of opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Updating the data

```sh
python3 scripts/refresh_civicapi.py
```

This re-downloads every Senate, governor, House and statewide measure race from civicAPI and rebuilds `data/counties.json`, `data/sim_house.json`, `data/sim_races.json`, `data/state_turnout.json` and the counts in `data/measures.json`. It prints new national House totals; copy them into `HOUSE_2026` and `VOTES_2026` in `assets/app.js`. Race calls (`data/senate_races.json`, `data/governor_races.json`, `data/house.json`) are not changed by the script; update them by hand as AP calls races.

`scripts/archive/` holds the one-time scripts used to build the original datasets from Wikipedia and other sources. They're kept for reference and use paths from the environment they were run in.

## Repository layout

```
index.html            page markup
assets/app.js         charts, maps, calculations and the simulator model
assets/dash.js        small runtime that loads data/*.json and redraws charts
assets/page.css       page styles
assets/theme.css      colors, type and spacing (light and dark)
data/                 JSON datasets
scripts/              data refresh script and archived build scripts
.github/workflows/    deploys the site to GitHub Pages on every push to main
```

## Earlier version

Before the election this repo held the Election Path 2026 forecast model (a Next.js site comparing the generic ballot with historical polling paths). It was replaced by this results site on Nov. 9, 2026; the full forecast code is still in the git history.

## License

The code is released under the [MIT License](LICENSE). The data in `data/` comes from the sources above and keeps their terms: Wikipedia text is CC BY-SA 4.0, and civicAPI asks for attribution.
