# Optional AdImpact weekly wrapper

AdImpact publicly advertises API access and custom data feeds, but Election Path does not assume an undocumented political endpoint or scrape an authenticated dashboard.

If you obtain a licensed export or manually transcribe the public/authorized toplines, save a dated CSV here. The newest CSV is used automatically by `scripts/update_finance_data.mjs`.

Required columns:

`race_id,dem_ad_spend,rep_ad_spend`

Optional columns:

`dem_future_reservations,rep_future_reservations,as_of`

Examples:

```csv
race_id,dem_ad_spend,rep_ad_spend,dem_future_reservations,rep_future_reservations,as_of
PA-07,5200000,4800000,3100000,2900000,2026-09-06
PA-SEN,18000000,16500000,9000000,10500000,2026-09-06
```

House IDs use `PA-07`. Senate IDs use `PA-SEN`; a plain state abbreviation such as `PA` is also accepted for Senate.

When present, the ad signal is blended with the FEC resource signal. FEC disbursements remain separately displayed because they are broader campaign spending and must not be described as AdImpact advertising expenditure.
