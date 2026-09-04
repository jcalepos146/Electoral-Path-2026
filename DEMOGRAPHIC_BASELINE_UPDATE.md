# 2026 demographic projection baseline update

This patch changes the district scenario engine so the demographic controls begin from explicit 2026 polling-derived vote margins instead of `TIE`.

## Starting vote margins

- White non-Hispanic: **R+9.5**
- Black: **D+58.5**
- Hispanic: **D+18.0**
- Asian: **D+35.0**
- Other / residual: **D+22.0**

The overlapping White, Black, and Hispanic estimates average Morning Consult's Aug. 16, 2026 midterm tracker with Pew Research Center's July 6–12, 2026 survey. Asian uses Pew because Morning Consult's public tracker groups Asian respondents into `Other`; Other/residual uses Morning Consult.

## Turnout

The overall starting turnout is **52.8% of the citizen voting-age population (CVAP)**, the mean of Census-reported 2018 turnout (53.4%) and 2022 turnout (52.2%). It is a transparent high-turnout-midterm starting assumption, not a poll of future turnout.

The overall turnout slider controls the absolute participation assumption. Each demographic card retains a relative-turnout control and now displays an **implied group turnout percentage** rather than only an abstract index.

## Model behavior

With `Preserve national anchor` enabled, the group projections redistribute the selected national margin geographically rather than changing the national generic-ballot anchor. This avoids double counting national movement.

`Reset to 2026 projection` restores all margins and turnout to these starting values. `Neutralize demographic effects` restores the previous all-TIE / equal-relative-turnout scenario.
