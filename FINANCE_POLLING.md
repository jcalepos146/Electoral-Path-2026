# Campaign finance and race polling mirrors (v0.9)

## Campaign-resource overlay

Before each Pages build, `npm run update-finance` downloads the FEC 2025-2026 House/Senate current-campaigns bulk file and matches the Democratic and Republican candidates in the current HillCast House and Senate wrappers.

The default resource index is deliberately low-weight:

- 50% cash-on-hand log ratio
- 30% adjusted receipts log ratio
- 20% adjusted disbursements log ratio
- $100,000 padding before each ratio
- tanh shrinkage to a -1..+1 index

Positive values indicate a Democratic resource advantage; negative values indicate a Republican resource advantage. Transfers between authorized committees are subtracted where possible to reduce double counting.

The map turns the index into a small margin overlay and reduces its effect as the underlying race becomes less competitive. Default maximum effects are ±0.75 point for House and ±0.50 point for Senate. Both are adjustable in the UI up to ±2 points. These coefficients are experimental and should eventually be estimated from historical cycles rather than treated as causal effects of spending.

FEC total disbursements are broad campaign spending, not television/digital advertising expenditure.

## Optional AdImpact wrapper

AdImpact publicly advertises API access and custom feeds, but no public self-service political API credential flow or public endpoint schema is used by this project. The project therefore does not scrape an authenticated dashboard.

If licensed AdImpact data or an export becomes available, place a dated CSV in `data/adimpact_uploads/` with:

`race_id,dem_ad_spend,rep_ad_spend,dem_future_reservations,rep_future_reservations,as_of`

House IDs use `PA-07`; Senate IDs use `PA-SEN` (plain `PA` is also accepted for Senate). The newest CSV is used automatically.

When AdImpact-style data are present, the combined index is 60% FEC resources and 40% ad-spend/reservation index. The ad index itself is 70% current spend and 30% future reservations, log-ratio transformed and shrunk. This weighting is intentionally transparent and provisional.

## Race polling mirrors

Before each Pages build, `npm run update-race-polling` builds a race-level mirror bundle.

- **RealClearPolling:** mirrors an official published RCP average when a current candidate matchup page can be matched. The updater searches current Senate pages and is also prepared to discover House race pages as RCP publishes them.
- **VoteHub data-derived:** VoteHub's free public polling API exposes raw polls. Election Path builds a clearly labeled derived average from those raw polls when both current candidates can be matched. This is *not* represented as VoteHub's official published average.

If both sources are available, the inspector displays a simple mirror blend alongside the individual values.

Polling mirrors are display-only in v0.9. They are not yet added to the HillCast prior because HillCast itself uses polling and an immediate second polling adjustment could double count the same information. A later version can apply only the change in the polling mirror since the HillCast snapshot date.
