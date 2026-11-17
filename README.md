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
| Turnout | New Jersey 2021–2025 vote growth and polling comparison; a fixed-participation turnout-gap scenario; who turned out by 2024 vote; estimated turnout rates and state vote comparisons |
| National environment | AP-NORC approval in 2021–2022 and 2025–2026, prewar approval extrapolation with sensitivity controls, and an R+4–R+5 no-Dobbs hypothesis |
| Simulator | Sliders for the national environment, Trump approval, and turnout among 2024 (or 2020) Trump voters, Harris (or Biden) voters and people who skipped 2024; re-runs every Senate, House and governor race |

## Data sources

| Data | Source | Notes |
|---|---|---|
| Race calls, candidates, statewide vote shares in the race tables | Associated Press results as compiled on Wikipedia's 2026 House, Senate and governor election pages | Original snapshot Nov. 8–9; selected House winners checked Nov. 17 and Mississippi Senate / Kansas governor calls updated from AP reporting. See `data/results_meta.json` for sources. Wikipedia text and data are CC BY-SA 4.0 |
| 2026 county results (Senate, governor, House), House district margins, statewide turnout, ballot measure counts | [civicAPI](https://civicapi.org) | Unofficial counts as of Nov. 9, 2026. civicAPI is free to use with attribution and doesn't say where its data comes from; its statewide totals agree with AP-reported results within 1.5 points everywhere |
| Ballot measure descriptions | Wikipedia, "2026 United States ballot measures" | CC BY-SA 4.0 |
| 2024 and 2020 presidential results by county | [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) | |
| County and state outlines | [us-atlas](https://github.com/topojson/us-atlas) (Census cartographic boundaries) | Albers USA projection |
| Voter poll | National House exit-poll figures transcribed from Wikipedia’s 2026 House page (labeled Edison there) | Survey estimates, not counts |
| 2024 eligible population and ballots cast | UF Election Lab | Used for turnout rates of people who skipped 2024 |
| Approval history | [AP-NORC Biden trend](https://apnorc.org/wp-content/uploads/2024/03/February-2024-topline-Biden.pdf), pp. 5–6, and [Trump trend](https://apnorc.org/wp-content/uploads/2026/10/October-2026-Topline-Issues-1.pdf), pp. 2–3 | Individual polls of U.S. adults; field dates and provenance in `data/environment.json` |
| Turnout and switching evidence | [J.L. Partners, Sitting Out the Surf](https://jlpartners.com/sitting-out-the-surf) | Election Day survey of 1,000 registered voters, released Nov. 16; Trump subgroup n=486. Raw 52/35/8/6 figures sum to 101 from rounding; voter subsample weighted to D+13 |
| NJ turnout case study | [NJ Division of Elections 2021](https://nj.gov/state/elections/election-information-2021.shtml), [2025](https://nj.gov/state/elections/election-information-2025.shtml) and [2024](https://www.nj.gov/state/elections/election-information-2024.shtml) | Official listed-candidate governor totals, presidential votes, and separate statewide ballots/registration; linked PDFs in `data/turnout_context.json` |
| NJ polling benchmark | [RealClearPolling final 2025 average](https://www.realclearpolling.com/polls/governor/general/2025/new-jersey/sherrill-vs-ciattarelli) | D+3.3, Oct. 14–30; a benchmark, not every poll or an identified turnout effect |
| Historical turnout-gap benchmark | [Pew Research Center’s 2022 validated-voter study](https://www.pewresearch.org/politics/2023/07/12/republican-gains-in-2022-midterms-driven-mostly-by-turnout-advantage/) | Trump 2020 voters 71%, Biden voters 67%; the scenario reverses the four-point difference |
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

## Counterfactual assumptions

- **Without the Iran war:** fit an unweighted approval trend to AP-NORC polls entirely inside a selectable 3-, 6- or 12-month prewar window. Polls completed on or after February 28, 2026 are excluded. Anchor the path at the last prewar observation and extend zero, half or all of the fitted slope through Election Day, bounded to 0–100%.
- **Approval to House vote:** subtract `coefficient × (hypothetical approval − observed October approval)` from the counted 2026 D−R margin. The default coefficient is 1 and is editable from 0 to 2. The ±3 approval-point sensitivity is editable and is **not a confidence interval**. Both approval levels concern adults, avoiding a direct substitution of adult approval for voter-only approval. Applying the scenario resets the simulator and uses only the national shift; turnout stays fixed. It does not estimate the war’s causal effect.
- **Without Dobbs:** the R+4–R+5 range is the user’s scenario assumption, with R+4.5 default. Against the recorded R+2.8, this implies 1.2–2.2 margin points toward Republicans; against a rounded R+3, 1–2 points. The page compares the R+6.8 2010 result but does not infer 2022 seat changes or claim Dobbs alone prevented a wave.
- **Survey denominators:** J.L. Partners includes nonvoters; the existing exit-poll dataset describes the 2026 electorate; AP-NORC covers adults. They remain separate. The pollster’s 10-point turnout / 5-point switching decomposition is descriptive and is not used as a war-effect estimate.
- **New Jersey turnout comparison:** Ciattarelli gained 162,520 votes from 2021 to 2025; Sherrill gained 557,139 against Murphy’s official 2021 total. Their 2025 totals equal 72.0% of Trump’s and 85.4% of Harris’s 2024 votes. These are aggregate ratios, not measured individual retention or turnout. Registered-voter turnout, calculated from separate ballot/registration totals, rose from 40.47% to 51.44%. Replacing only Ciattarelli’s 2021 vote with his 2025 vote, holding Murphy and other listed candidates fixed, gives Ciattarelli 51.04%; the denominator grows with the extra Republican votes. Listed-candidate totals exclude unlisted write-ins and differ from statewide ballots cast.
- **Reverse the 2022 turnout gap:** use Pew’s four-point Republican advantage as a hypothetical four-point Harris advantage in 2026. Solve for turnout rates that preserve the combined number of returning Harris/Trump voters, weighted by 2024 coalition sizes. Do not import literal 71% / 67% levels or New Jersey vote ratios. National environment, approval, new/other voters and within-group vote choice remain at the simulator baseline. The baseline inferred turnout rates (75.9% Harris, 66.1% Trump) differ from J.L. Partners’ separate estimates (78%, 65%). Under the retained count snapshot, the reversed-gap scenario gives approximately D+9.8 versus D+13.2 counted, with 242 modeled Democratic House seats; equal turnout gives D+7.4. These outputs are illustrative, including assumptions for uncalled races and Alaska. They do not identify the source of polling error.
- **Freshness:** the Nov. 17 civicAPI refresh attempt returned HTTP 403. County, national and most district counts remain Nov. 9. Selected calls were updated separately; the update log states exactly which ones. NC-3’s newer DDHQ lead is still labeled uncalled.

## Running it locally

The page loads its data with `fetch`, so serve the folder instead of opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Checks

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p "test_*.py"
node --check assets/app.js
node --check assets/environment.js
node --check assets/turnout.js
```

The model tests cover prewar-only fitting, slope choices, margin direction and bounds, no-Dobbs endpoints, New Jersey arithmetic and denominators, fixed combined participation with reversed/equal/original turnout gaps, simulator integration, and call consistency. Refresh tests cover blocked and incomplete responses without making network calls.

## Updating the data

```sh
python3 scripts/refresh_civicapi.py
```

This re-downloads every Senate, governor, House and statewide measure race from civicAPI and rebuilds `data/counties.json`, `data/sim_house.json`, `data/sim_races.json`, `data/state_turnout.json` and the counts in `data/measures.json`. It also updates national House totals and count dates in `data/results_meta.json`, which supplies both the national environment and turnout calculations. It rejects missing House races or candidate lists before writing. HTTP 401/403 stops immediately and preserves the existing snapshot. Race calls (`data/senate_races.json`, `data/governor_races.json`, `data/house.json`) are not changed by the script; update them with verified sources and keep the corresponding `actual` / `called` fields in simulator datasets and candidate winner markers in sync. Record per-race sources and verification dates in `results_meta.json`; a concession alone is not an AP call. After a successful count refresh, review the explanatory snapshot-date text in `index.html` and this README.

`scripts/archive/` holds the one-time scripts used to build the original datasets from Wikipedia and other sources. They're kept for reference and use paths from the environment they were run in.

## Repository layout

```
index.html            page markup
assets/app.js         charts, maps, calculations and the simulator model
assets/environment-model.js  pure counterfactual calculations (also loaded by Node tests)
assets/environment.js        comparison charts, evidence panels and scenario controls
assets/turnout.js            NJ case study and turnout-gap controls
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
