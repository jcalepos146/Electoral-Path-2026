# Election Path 2026 master patch v0.9

This cumulative master consolidates the working v0.8 House + Senate model and adds campaign-finance signals and race-level polling mirrors.

Included:
- House aggregate mirrors and historical path model
- weekly HillCast House CSV ingestion
- zoomable/clickable 435-district House map
- 2026 racial/ethnic margin and turnout baseline
- real-time House demographic scenario adjustments
- dedicated Census geometry workflow
- HillCast/Datawrapper Senate wrapper ingestion
- Senate-only zoomable state map
- real-time Senate racial-margin and turnout scenario adjustments
- FEC House/Senate campaign-resource refresh before every deployment
- small, capped campaign-finance margin overlay with user-adjustable maximum effect
- optional weekly AdImpact spending/reservation wrapper
- RCP official race-average mirrors where discoverable
- VoteHub-data-derived race mirrors from its free raw polling API
- race inspector panels showing finance and polling evidence separately from the HillCast prior

The polling mirrors remain display-only in v0.9 so the same poll information is not automatically counted both inside HillCast and again inside Election Path. The next statistically cleaner step is to archive mirror snapshots and apply only the post-HillCast change.
