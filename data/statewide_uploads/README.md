# Statewide race uploads

Drop optional dated CSV files here to populate the Senate and governor maps.

Recommended filenames:

- `senate-2026-09-11.csv`
- `governors-2026-09-11.csv`

The build selects the newest dated file for each map.

## Accepted columns

At minimum:

```csv
state,margin
PA,D+3.2
GA,R+1.1
```

Optional columns:

```csv
state,republican,democrat,margin,rating,source,as_of,note
PA,Republican Candidate,Democratic Candidate,D+3.2,Tossup,Your model,2026-09-11,
```

`margin` may be `D+3.2`, `R+1.1`, `TIE`, or a signed number where positive = Democratic and negative = Republican.
