# 2026 Midterm Election Results

An interactive results site for the Nov. 3, 2026 U.S. midterm elections: Senate, House and governor results, county maps of margin, swing, trend and turnout, statewide ballot measures, voter-poll breakdowns, and a what-if simulator.

**Live site:** https://jcalepos146.github.io/Electoral-Path-2026/

It's a static site with no build step: plain HTML, CSS and JavaScript, [d3](https://d3js.org) from a CDN, and JSON data files.

## What's on the site

| Tab | What it shows |
|---|---|
| Overview | Seat counts for the Senate (with senators not up this year), House and governors; seats that changed party; uncalled races with their next step and date |
| Senate / House / Governors | State tile maps and a table of every race; uncalled races marked |
| Voter trends | National House vote by group from the 2026 Voter Poll |
| County map | Every county: 2026 margin, swing from 2024 or 2020, trend vs. the nation, and turnout vs. 2024 or 2020, for each state's top race, Senate, governor or all House districts combined; plus a state map of each race vs. the national environment |
| Ballot measures | Statewide measures with yes/no counts and descriptions |
| Turnout | New Jersey 2021–2025 vote growth and polling comparison; a check of any turnout and crossover assumption against the counted national House vote; a fixed-participation turnout-gap scenario; who turned out by 2024 vote; estimated turnout rates and state vote comparisons |
| National environment | AP-NORC approval in 2021–2022 and 2025–2026, prewar approval extrapolation with sensitivity controls, and an R+4–R+5 no-Dobbs hypothesis |
| 2028 scenarios | Presidential cohort-return benchmarks, editable turnout and switching, new/returning voters, a midterm-comeback sensitivity, session comparisons and JSON export |
| Candidate WAR | Each Senate, governor and House candidate's margin against their seat's 2024 presidential margin plus the national swing; a "normal midterm" swing slider showing which seats change hands; a county-by-county comparison of candidates on the same state ballot; each nominee's votes as a share of their party's 2024 presidential vote |
| Simulator | Sliders for the national environment, Trump approval, and turnout among 2024 (or 2020) Trump voters, Harris (or Biden) voters and people who skipped 2024; re-runs every Senate, House and governor race |

## Data sources

| Data | Source | Notes |
|---|---|---|
| Race calls, candidates, statewide vote shares in the race tables | Associated Press results as compiled on Wikipedia's 2026 House, Senate and governor election pages | Original snapshot Nov. 8–9; selected House winners checked Nov. 17; Mississippi Senate / Kansas governor calls updated from AP reporting; Alaska Senate, governor and House, CA-23 and NC-5 calls added Nov. 24. See `data/results_meta.json` for sources. Wikipedia text and data are CC BY-SA 4.0 |
| 2026 county results (Senate, governor, House), House district margins, statewide turnout, ballot measure counts | [civicAPI](https://civicapi.org) | Unofficial counts as of Nov. 24, 2026. civicAPI is free to use with attribution and doesn't say where its data comes from; Checked Nov. 24 against the AP shares in the race tables (an earlier Nov. 8–9 snapshot): 149 of 153 candidate shares agree within 1.5 points. The exceptions are Maryland and Oregon governor, where ballots counted after the snapshot moved shares by up to 3 points, and an Idaho minor candidate |
| Ballot measure descriptions | Wikipedia, "2026 United States ballot measures" | CC BY-SA 4.0 |
| 2024 and 2020 presidential results by county | [tonmcg/US_County_Level_Election_Results_08-24](https://github.com/tonmcg/US_County_Level_Election_Results_08-24) | |
| County and state outlines | [us-atlas](https://github.com/topojson/us-atlas) (Census cartographic boundaries) | Albers USA projection |
| 2024 presidential results by House district | [The Downballot](https://www.the-downballot.com/p/the-downballots-calculations-of-presidential) | District lines used in 2026, including the 2025 redraws; 2020 results on the same lines where published. State baselines for WAR and retention sum these districts. Checked Nov. 24 |
| Voter poll | National House exit-poll figures transcribed from Wikipedia’s 2026 House page (labeled Edison there) | Survey estimates, not counts |
| 2024 eligible population and ballots cast | UF Election Lab | Used for turnout rates of people who skipped 2024 |
| Approval history | [AP-NORC Biden trend](https://apnorc.org/wp-content/uploads/2024/03/February-2024-topline-Biden.pdf), pp. 5–6, and [Trump trend](https://apnorc.org/wp-content/uploads/2026/10/October-2026-Topline-Issues-1.pdf), pp. 2–3 | Individual polls of U.S. adults; field dates and provenance in `data/environment.json` |
| Turnout and switching evidence | [J.L. Partners, Sitting Out the Surf](https://jlpartners.com/sitting-out-the-surf) | Election Day survey of 1,000 registered voters, released Nov. 16; Trump subgroup n=486. Raw 52/35/8/6 figures sum to 101 from rounding; voter subsample weighted to D+13 |
| Precinct-level turnout and switching estimates | [Broome Street Labs, Turnout or Persuasion? How We Measured the 2026 Senate Wave](https://broomestreetlabs.com/research/2026-senate-wave/) | Lenny Bronner, v1.0, Nov. 19, 2026. Ecological inference on 2026 and 2024 precinct results in 13 states (Texas and Michigan partial). Model estimates, not counts: roughly a third of Trump voters skipped 2026; about 6% of Trump voters who voted backed the Democrat |
| NJ turnout case study | [NJ Division of Elections 2021](https://nj.gov/state/elections/election-information-2021.shtml), [2025](https://nj.gov/state/elections/election-information-2025.shtml) and [2024](https://www.nj.gov/state/elections/election-information-2024.shtml) | Official listed-candidate governor totals, presidential votes, and separate statewide ballots/registration; linked PDFs in `data/turnout_context.json` |
| NJ polling benchmark | [RealClearPolling final 2025 average](https://www.realclearpolling.com/polls/governor/general/2025/new-jersey/sherrill-vs-ciattarelli) | D+3.3, Oct. 14–30; a benchmark, not every poll or an identified turnout effect |
| Historical turnout-gap benchmark | [Pew Research Center’s 2022 validated-voter study](https://www.pewresearch.org/politics/2023/07/12/republican-gains-in-2022-midterms-driven-mostly-by-turnout-advantage/) | Trump 2020 voters 71%, Biden voters 67%; the scenario reverses the four-point difference |
| Presidential cohort transitions | [Pew’s 2016–2020 study](https://www.pewresearch.org/politics/2021/06/30/behind-bidens-2020-victory/), [2020–2024 turnout](https://www.pewresearch.org/politics/2025/06/26/voter-turnout-2020-2024/) and [vote-choice flows](https://www.pewresearch.org/feature/how-changes-in-turnout-and-vote-choice-powered-trumps-victory-in-2024/) | Validated turnout and self-reported choice; about 90% of both 2016 major-party cohorts returned in 2020, versus 85% of Biden and 89% of Trump 2020 voters in 2024 |
| 2028 model’s prior-voter totals | [FEC 2024 presidential results](https://www.fec.gov/resources/cms-content/documents/2024presgeresults.pdf), pp. 3, 5–6 | Separate FEC snapshot, not the county-summed totals used by the 2026 simulator; sources and historical margins in `data/presidential_2028.json` |
| Uncalled-race notes | AP reporting on the Mississippi count, the Kansas Secretary of State, and Alaska's ranked-choice timetable | |

Data from civicAPI (civicapi.org).

## Method notes and caveats

- **Swing** is a county's 2026 margin minus its presidential margin. **Trend** is that swing minus the national shift over the same period. The national 2026 environment is the House vote summed across all districts (D+14.1 on 118.9 million votes as of Nov. 24); 2024 and 2020 national margins come from summed county results.
- **"Top race"** on the county map is each state's Senate race, else its governor race, else its House races combined, skipping races where an independent finished in the top two.
- **House layers** leave out counties in a district that one party didn't contest.
- **Alaska** reports 2020 and 2024 results by state house district, so the map shows 2026 margins only. **Connecticut's** 2024 results are by planning region, so its comparisons with 2024 are blank.
- **The simulator** starts each race at its actual margin and adds the national shift, an approval effect (each point moves voters between "somewhat approve" and "somewhat disapprove") and a turnout effect. With the 2024 baseline, starting turnout rates are J.L. Partners' reported 78% of Harris voters and 65% of Trump voters. The voter poll's recall implies about 78.5% and 68.4%, but that poll's own group shares and vote choices add up to only about D+12, short of the counted D+14.1, so it overstates Trump voters. Broome Street Labs' precinct model also finds roughly a third of Trump voters skipped 2026. The voter-poll inferred rates remain available as an alternative reference, and the 2020 baseline still uses them. Alaska's ranked-choice races assume votes for eliminated Republicans transfer to the leading Republican. It's a what-if tool, not a forecast.
- **Candidate WAR** is the 2026 margin minus (the seat's 2024 presidential margin + the national swing of 15.6 points). Positive means the Democratic or independent challenger beat the baseline. Uncontested seats are left out of summaries. Alaska's House race uses the final ranked-choice round against independent Bill Hill. Flags mark lopsided seats (2024 margin 30+ points) and districts that moved 8+ points right from 2020 to 2024, where WAR partly reflects a return to an earlier lean. The "normal midterm" view shifts every margin uniformly, assuming each candidate keeps their WAR. It does not adjust for incumbency, spending or demographics.
- **Retention** divides each 2026 nominee's votes by their party's 2024 presidential vote in the state. Where an independent was the main challenger (Idaho, Montana, Nebraska, South Dakota Senate), the independent is compared with Harris. These are aggregate ratios, not tracked voters.
- **The turnout check** multiplies assumed turnout and crossover rates by each 2024 cohort's size, gives the remaining 2026 votes to 2024 third-party voters and nonvoters (70% D / 25% R, from the voter poll) and compares the result with the counted vote. J.L. Partners' turnout with the voter poll's crossover rates lands at D+15.1 against the counted D+14.1; its own reported crossover (12% of Trump voters who voted) gives D+22.4.
- Some measures need a supermajority to pass (for example Florida amendments and most Colorado constitutional amendments), so a yes lead doesn't always mean a measure passed.
- This is a snapshot. Counts keep changing until states certify.

## Counterfactual assumptions

- **Without the Iran war:** fit an unweighted approval trend to AP-NORC polls entirely inside a selectable 3-, 6- or 12-month prewar window. Polls completed on or after February 28, 2026 are excluded. Anchor the path at the last prewar observation and extend zero, half or all of the fitted slope through Election Day, bounded to 0–100%.
- **Approval to House vote:** subtract `coefficient × (hypothetical approval − observed October approval)` from the counted 2026 D−R margin. The default coefficient is 1 and is editable from 0 to 2. The ±3 approval-point sensitivity is editable and is **not a confidence interval**. Both approval levels concern adults, avoiding a direct substitution of adult approval for voter-only approval. Applying the scenario resets the simulator and uses only the national shift; turnout stays fixed. It does not estimate the war’s causal effect.
- **Without Dobbs:** the R+4–R+5 range is the user’s scenario assumption, with R+4.5 default. Against the recorded R+2.8, this implies 1.2–2.2 margin points toward Republicans; against a rounded R+3, 1–2 points. The page compares the R+6.8 2010 result but does not infer 2022 seat changes or claim Dobbs alone prevented a wave.
- **Survey denominators:** J.L. Partners includes nonvoters; the existing exit-poll dataset describes the 2026 electorate; AP-NORC covers adults. They remain separate. The pollster’s 10-point turnout / 5-point switching decomposition is descriptive and is not used as a war-effect estimate.
- **New Jersey turnout comparison:** Ciattarelli gained 162,520 votes from 2021 to 2025; Sherrill gained 557,139 against Murphy’s official 2021 total. Their 2025 totals equal 72.0% of Trump’s and 85.4% of Harris’s 2024 votes. These are aggregate ratios, not measured individual retention or turnout. Registered-voter turnout, calculated from separate ballot/registration totals, rose from 40.47% to 51.44%. Replacing only Ciattarelli’s 2021 vote with his 2025 vote, holding Murphy and other listed candidates fixed, gives Ciattarelli 51.04%; the denominator grows with the extra Republican votes. Listed-candidate totals exclude unlisted write-ins and differ from statewide ballots cast.
- **Reverse the 2022 turnout gap:** use Pew’s four-point Republican advantage as a hypothetical four-point Harris advantage in 2026. Solve for turnout rates that preserve the combined number of returning Harris/Trump voters, weighted by 2024 coalition sizes. Do not import literal 71% / 67% levels or New Jersey vote ratios. National environment, approval, new/other voters and within-group vote choice remain at the simulator baseline. The baseline inferred turnout rates (78.5% Harris, 68.4% Trump) differ from J.L. Partners’ separate estimates (78%, 65%). Under the Nov. 24 count, the reversed-gap scenario gives approximately D+10.6 versus D+14.1 counted, with 242 modeled Democratic House seats; equal turnout gives D+8.3. These outputs are illustrative, including assumptions for uncalled races and Alaska. They do not identify the source of polling error.
- **Compare the D+6 and D+10.6 calculations:** the proportional benchmark reproduces `−2 + 10 × (4/13) + 5 = D+6.1` using J.L. Partners’ rounded R+2 baseline, ten-point turnout swing and five-point switching swing. Scaling turnout swing linearly with the turnout-rate gap is an additional analyst assumption, not the pollster’s counterfactual. The existing cohort model starts at a 10.1-point inferred gap; an optional J.L. Partners calibration instead starts at 78% Harris / 65% Trump. Reweighting that larger gap down to four points yields about D+8.8 (235 modeled Democratic House seats) with combined participation and within-group House choices fixed. Its reference reproduces each counted margin; within-group choices still use the voter-only poll, making this a hybrid sensitivity model. The comparison table shows all three methods at the selected gap; these are model alternatives, not a confidence interval. The proportional result can be applied as one uniform national shift, while the cohort results apply their turnout rates. The simulator displays its active calibration; resetting or returning to the 2024 baseline restores the J.L. Partners calibration, and the 2020 baseline uses the inferred one. These are hypothetical House vote margins, not newly measured generic-ballot polling.
- **Freshness:** the Nov. 24 civicAPI refresh succeeded (the Nov. 17 attempt had returned HTTP 403). County, national, district, turnout and measure counts are as of Nov. 24, with every race at 98% or more reporting. Calls were updated separately; the update log states exactly which ones. NC-3 (Smith leads; Murphy conceded, no AP call found) and MN-1 (certified for Johnson; recount Dec. 8) stay uncalled, and LA-5 and LA-6 go to December runoffs.

## 2028 presidential scenarios

The new tab treats Harris and Trump as labels for **2024 voter cohorts**, with the 2028 nominees unspecified. For each cohort, multiply its FEC vote total by assumed return turnout, then allocate only returning voters among the Democratic, Republican and other candidates. Add a separate number of 2028 voters who cast no 2024 presidential vote, including newly eligible voters. Divide the Democratic–Republican vote difference by all modeled votes. This is national popular-vote accounting; it supplies no state allocation, Electoral College conversion or win probabilities.

- **Historical presets change one factor:** the approximate 90% / 90% 2020 return pattern, the 85% / 89% 2024 pattern, and its 89% / 85% reversal change turnout only. Other assumptions remain fixed. Pew’s “about nine-in-ten” is not treated as an exact measurement. The optional switching button separately converts rounded 2024 flows to choices conditional on returning: Biden→Trump `5/85`, Trump→Harris `3/89`, with other-candidate residuals. Same-party retention and returning turnout are distinct.
- **New/returning voters:** their assumed volume is independent of their vote mix. Optional Pew preferences are D52/R44/other4 in 2020 and D45/R52/other3 in 2024, including people previously too young to vote. These voters are disjoint from all three 2024 voting cohorts; remaining 2024 nonreturners are never added back as entrants.
- **Midterm comeback:** optionally partition each 2024 major-party cohort using J.L. Partners’ 2026 participation estimates (78% Harris, 65% Trump). Apply explicit assumed 2028 return rates to its midterm voters and nonvoters, then recombine into one 2028 return rate. This does not track validated individuals or copy 2026 House choices into 2028. With the illustrative 95% repeat-voter and 80% drop-off return assumptions, the resulting return rates are 91.7% Harris and 89.75% Trump.
- **Compare and export:** save up to six named scenarios for the current page session; export assumptions, source links, input cohorts and calculated votes as JSON. The entrant break-even share solves a national popular-vote tie with other settings fixed, where feasible. Invalid inputs clear outputs rather than preserving stale results.
- **Historical context:** the 2008 House D+10.6 to 2010 House R+6.8 change was a 17.4-point Republican swing; Obama then won the 2012 presidential vote by about 3.9 points. McCain’s 2008 presidential defeat was about 7.3 points. Comparing House with House avoids mixing that swing with a presidential-to-midterm shift. Pre-Trump examples are context, not interchangeable coalition estimates.

Defaults are editable illustrations, not 2028 polling or a forecast. There is no automatic carryover from the 2026 margin. The national model does not explicitly estimate eligibility changes, deaths, migration or candidate effects. Historical Pew panel transitions are benchmarks for assumptions about a changed 2024 electorate, not a census of every original voter.

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
node --check assets/presidential-model.js
node --check assets/presidential.js
node --check assets/war-model.js
node --check assets/war.js
```

The model tests cover prewar-only fitting, slope choices, margin direction and bounds, no-Dobbs endpoints, New Jersey arithmetic and denominators, fixed combined participation with reversed/equal/original turnout gaps, simulator integration, proportional swing scaling, J.L. Partners calibration and call consistency. Presidential tests check vote conservation, returner denominators, disjoint entrants, break-even calculations, invalid inputs, the midterm-comeback partition and historical references. Refresh tests cover blocked and incomplete responses without making network calls. Data-integrity tests fail when a called race is missing vote totals, when calls disagree between the race tables and the simulator datasets, or when an uncalled race has no next step. WAR tests cover the baseline arithmetic, uncontested exclusions, the Alaska ranked-choice case, uniform swing, retention and vote conservation in the turnout check.

## Updating the data

```sh
python3 scripts/refresh_civicapi.py
```

A scheduled GitHub Action (`.github/workflows/refresh.yml`) runs this daily at 15:17 UTC and opens or updates a pull request when counts change, reporting whether the checks pass on the new data. A blocked refresh fails the job, so it shows up in the Actions tab. It needs "Allow GitHub Actions to create and approve pull requests" turned on under Settings → Actions → General.

The script re-downloads every Senate, governor, House and statewide measure race from civicAPI and rebuilds `data/counties.json`, `data/sim_house.json`, `data/sim_races.json`, `data/state_turnout.json` and the counts in `data/measures.json`. It also updates national House totals and count dates in `data/results_meta.json`, which supplies both the national environment and turnout calculations. It rejects missing House races or candidate lists before writing. HTTP 401/403 stops immediately and preserves the existing snapshot. Race calls (`data/senate_races.json`, `data/governor_races.json`, `data/house.json`) are not changed by the script; update them with verified sources and keep the corresponding `actual` / `called` fields in simulator datasets and candidate winner markers in sync. Record per-race sources and verification dates in `results_meta.json`; a concession alone is not an AP call. After a successful count refresh, review the explanatory snapshot-date text in `index.html` and this README.

`scripts/archive/` holds the one-time scripts used to build the original datasets from Wikipedia and other sources. They're kept for reference and use paths from the environment they were run in.

## Repository layout

```
index.html            page markup
assets/app.js         charts, maps, calculations and the simulator model
assets/environment-model.js  pure counterfactual calculations (also loaded by Node tests)
assets/environment.js        comparison charts, evidence panels and scenario controls
assets/turnout.js            NJ case study and turnout-gap controls
assets/presidential-model.js pure national presidential cohort calculations
assets/presidential.js       2028 scenario controls, comparisons and export
assets/war-model.js          pure WAR, retention and turnout-check calculations (also loaded by Node tests)
assets/war.js                Candidate WAR tab, turnout check and pending-race list
assets/dash.js        small runtime that loads data/*.json and redraws charts
assets/page.css       page styles
assets/theme.css      colors, type and spacing (light and dark)
data/                 JSON datasets
scripts/              data refresh script and archived build scripts
.github/workflows/    deploys the site on every push to main, runs checks, and refreshes counts daily
```

## Earlier version

Before the election this repo held the Election Path 2026 forecast model (a Next.js site comparing the generic ballot with historical polling paths). It was replaced by this results site on Nov. 9, 2026; the full forecast code is still in the git history.

## License

The code is released under the [MIT License](LICENSE). The data in `data/` comes from the sources above and keeps their terms: Wikipedia text is CC BY-SA 4.0, and civicAPI asks for attribution.
