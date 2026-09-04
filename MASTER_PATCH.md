# Election Path 2026 master patch v0.8

This master version consolidates the working House model and adds the HillCast Senate demographic scenario engine.

Included:
- House aggregate mirrors and historical path model
- weekly HillCast House CSV ingestion
- zoomable/clickable 435-district House map
- 2026 racial/ethnic margin and turnout baseline
- real-time House demographic scenario adjustments
- dedicated Census geometry workflow
- HillCast/Datawrapper Senate wrapper ingestion
- Senate-only zoomable state map (governor UI removed)
- real-time Senate racial-margin and turnout scenario adjustments
- state demographic aggregation from the House Census dataset

Upload this version over the repository root and replace matching files. Existing committed map geometry files can remain in `public/data/`.
