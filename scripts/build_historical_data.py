#!/usr/bin/env python3
"""Build Election Path's historical generic-ballot model from RCP PDF exports.

The dataset supports five historical filters:
  * Presidential: 2004, 2008, 2012, 2016, 2020, 2024
  * Midterm: 2006, 2010, 2014, 2018, 2022
  * Overall: all eleven cycles
  * Low-turnout midterm: 2006, 2010, 2014
  * High-turnout midterm: 2018, 2022

Low/high turnout uses the U.S. Census Bureau's citizen voting-age turnout series.
For this project, high-turnout midterms are cycles at or above 50% CVAP turnout.

Model convention:
  * Democratic margin is positive; Republican margin is negative.
  * A historical snapshot is a simple average of polls whose fieldwork ended
    in the trailing 14 days as of that snapshot date.
  * Each election cycle gets equal weight within the selected historical group.
  * correction = final House popular-vote margin - snapshot polling margin.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import statistics
import subprocess
from pathlib import Path

YEARS = [2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024]
PRESIDENTIAL_YEARS = [2004, 2008, 2012, 2016, 2020, 2024]
MIDTERM_YEARS = [2006, 2010, 2014, 2018, 2022]
LOW_TURNOUT_MIDTERMS = [2006, 2010, 2014]
HIGH_TURNOUT_MIDTERMS = [2018, 2022]

GROUPS = {
    "midterm": {
        "label": "Midterm",
        "description": "Midterm cycles only (2006-2022).",
        "years": MIDTERM_YEARS,
    },
    "presidential": {
        "label": "Presidential",
        "description": "Presidential-election-year generic ballot cycles (2004-2024).",
        "years": PRESIDENTIAL_YEARS,
    },
    "overall": {
        "label": "Overall",
        "description": "All available presidential and midterm cycles (2004-2024).",
        "years": YEARS,
    },
    "low_turnout_midterm": {
        "label": "Low Turnout Midterm",
        "description": "Midterms below 50% citizen voting-age turnout in the Census series.",
        "years": LOW_TURNOUT_MIDTERMS,
    },
    "high_turnout_midterm": {
        "label": "High Turnout Midterm",
        "description": "Midterms at or above 50% citizen voting-age turnout in the Census series.",
        "years": HIGH_TURNOUT_MIDTERMS,
    },
}

PARTY_ORDER = {
    2004: ("R", "D"),
    2006: ("R", "D"),
    2008: ("R", "D"),
    2010: ("R", "D"),
    2012: ("D", "R"),
    2014: ("R", "D"),
    2016: ("D", "R"),
    2018: ("D", "R"),
    2020: ("D", "R"),
    2022: ("R", "D"),
    2024: ("R", "D"),
}

ELECTION_DATES = {
    2004: dt.date(2004, 11, 2),
    2006: dt.date(2006, 11, 7),
    2008: dt.date(2008, 11, 4),
    2010: dt.date(2010, 11, 2),
    2012: dt.date(2012, 11, 6),
    2014: dt.date(2014, 11, 4),
    2016: dt.date(2016, 11, 8),
    2018: dt.date(2018, 11, 6),
    2020: dt.date(2020, 11, 3),
    2022: dt.date(2022, 11, 8),
    2024: dt.date(2024, 11, 5),
}

# Final nationwide House popular-vote shares as displayed in the supplied RCP files.
FINAL_RESULTS = {
    2004: {"dem": 46.6, "rep": 49.2},
    2006: {"dem": 52.0, "rep": 44.1},
    2008: {"dem": 53.2, "rep": 42.5},
    2010: {"dem": 44.8, "rep": 51.6},
    2012: {"dem": 49.2, "rep": 48.0},
    2014: {"dem": 45.7, "rep": 51.4},
    2016: {"dem": 48.0, "rep": 49.1},
    2018: {"dem": 53.3, "rep": 44.9},
    2020: {"dem": 50.8, "rep": 47.7},
    2022: {"dem": 47.8, "rep": 50.6},
    2024: {"dem": 47.9, "rep": 50.6},
}

# Census CPS Voting and Registration Supplement: citizen voting-age turnout.
MIDTERM_TURNOUT_CVAP = {
    2006: 47.8,
    2010: 45.5,
    2014: 41.9,
    2018: 53.4,
    2022: 52.2,
}

ROW_RE = re.compile(
    r"^\s*(.*?)\s+"
    r"(\d{1,2}/\d{1,2})\s*-\s*(\d{1,2}/\d{1,2})\s+"
    r"(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+"
    r"(Democrats|Republicans|Tie)(?:\s+\+?([0-9.]+))?\s*$"
)


def parse_md(md: str) -> tuple[int, int]:
    m, d = md.split("/")
    return int(m), int(d)


def end_date_for_cycle(md: str, cycle_year: int) -> dt.date:
    month, day = parse_md(md)
    election = ELECTION_DATES[cycle_year]
    if month < 11:
        year = cycle_year
    elif month == 11:
        year = cycle_year if day <= election.day else cycle_year - 1
    else:
        year = cycle_year - 1
    return dt.date(year, month, day)


def extract_text(pdf: Path) -> str:
    proc = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


def parse_poll_rows(pdf: Path, cycle_year: int) -> list[dict]:
    text = extract_text(pdf)
    first_party, second_party = PARTY_ORDER[cycle_year]
    deduped: dict[tuple, dict] = {}

    for line in text.splitlines():
        match = ROW_RE.match(line)
        if not match:
            continue

        pollster, start_md, end_md, a, b, _leader, _spread = match.groups()
        pollster = pollster.strip()
        if pollster in {"RCP Average", "Final Results"}:
            continue

        end_date = end_date_for_cycle(end_md, cycle_year)
        start_month, start_day = parse_md(start_md)
        end_month, _ = parse_md(end_md)
        start_year = end_date.year if start_month <= end_month else end_date.year - 1
        start_date = dt.date(start_year, start_month, start_day)

        values = {first_party: float(a), second_party: float(b)}
        row = {
            "pollster": pollster,
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dem": values["D"],
            "rep": values["R"],
            "margin": round(values["D"] - values["R"], 3),
        }
        key = (pollster, row["startDate"], row["endDate"], row["dem"], row["rep"])
        deduped[key] = row

    return sorted(deduped.values(), key=lambda r: (r["endDate"], r["pollster"]))


def snapshot_average(rows: list[dict], snapshot: dt.date, window_days: int) -> dict | None:
    cutoff = snapshot - dt.timedelta(days=window_days - 1)
    included = [
        row for row in rows
        if cutoff <= dt.date.fromisoformat(row["endDate"]) <= snapshot
    ]
    if len(included) < 2:
        return None
    return {
        "n": len(included),
        "dem": statistics.fmean(row["dem"] for row in included),
        "rep": statistics.fmean(row["rep"] for row in included),
        "margin": statistics.fmean(row["margin"] for row in included),
    }


def build_curve(years: list[int], parsed_by_year: dict[int, list[dict]], window_days: int, max_days: int) -> list[dict]:
    curve: list[dict] = []
    for days_to_election in range(max_days, -1, -1):
        analogs = []
        for year in years:
            snapshot_date = ELECTION_DATES[year] - dt.timedelta(days=days_to_election)
            avg = snapshot_average(parsed_by_year[year], snapshot_date, window_days)
            if avg is None:
                continue
            final = FINAL_RESULTS[year]
            final_margin = final["dem"] - final["rep"]
            correction = final_margin - avg["margin"]
            analogs.append({
                "year": year,
                "cycleType": "presidential" if year in PRESIDENTIAL_YEARS else "midterm",
                "turnoutClass": (
                    "high" if year in HIGH_TURNOUT_MIDTERMS else
                    "low" if year in LOW_TURNOUT_MIDTERMS else None
                ),
                "turnoutCVAP": MIDTERM_TURNOUT_CVAP.get(year),
                "pollCount": avg["n"],
                "snapshotMargin": round(avg["margin"], 3),
                "snapshotDem": round(avg["dem"], 3),
                "snapshotRep": round(avg["rep"], 3),
                "finalMargin": round(final_margin, 3),
                "correction": round(correction, 3),
                "demChange": round(final["dem"] - avg["dem"], 3),
                "repChange": round(final["rep"] - avg["rep"], 3),
            })

        if not analogs:
            continue

        corrections = [a["correction"] for a in analogs]
        dem_changes = [a["demChange"] for a in analogs]
        rep_changes = [a["repChange"] for a in analogs]
        curve.append({
            "daysToElection": days_to_election,
            "cycles": len(analogs),
            "meanCorrection": round(statistics.fmean(corrections), 3),
            "medianCorrection": round(statistics.median(corrections), 3),
            "stdevCorrection": round(statistics.stdev(corrections), 3) if len(corrections) > 1 else None,
            "minCorrection": round(min(corrections), 3),
            "maxCorrection": round(max(corrections), 3),
            "meanDemChange": round(statistics.fmean(dem_changes), 3),
            "meanRepChange": round(statistics.fmean(rep_changes), 3),
            "analogs": analogs,
        })
    return curve


def build_dataset(pdf_dir: Path, window_days: int = 14, max_days: int = 240) -> dict:
    cycles: list[dict] = []
    parsed_by_year: dict[int, list[dict]] = {}

    for year in YEARS:
        pdf = pdf_dir / f"{year} Generic Congressional Vote _ RealClearPolling.pdf"
        if not pdf.exists():
            raise FileNotFoundError(f"Missing source PDF: {pdf}")
        rows = parse_poll_rows(pdf, year)
        if not rows:
            raise RuntimeError(f"No poll rows parsed from {pdf}")
        parsed_by_year[year] = rows
        final = FINAL_RESULTS[year]
        cycles.append({
            "year": year,
            "cycleType": "presidential" if year in PRESIDENTIAL_YEARS else "midterm",
            "turnoutClass": (
                "high" if year in HIGH_TURNOUT_MIDTERMS else
                "low" if year in LOW_TURNOUT_MIDTERMS else None
            ),
            "turnoutCVAP": MIDTERM_TURNOUT_CVAP.get(year),
            "electionDate": ELECTION_DATES[year].isoformat(),
            "finalDem": final["dem"],
            "finalRep": final["rep"],
            "finalMargin": round(final["dem"] - final["rep"], 3),
            "pollCount": len(rows),
            "polls": rows,
        })

    group_data = {}
    for key, spec in GROUPS.items():
        years = spec["years"]
        major_party_total = statistics.fmean(FINAL_RESULTS[y]["dem"] + FINAL_RESULTS[y]["rep"] for y in years)
        group_data[key] = {
            "key": key,
            "label": spec["label"],
            "description": spec["description"],
            "years": years,
            "meanFinalMajorPartyTotal": round(major_party_total, 3),
            "meanFinalOtherShare": round(100 - major_party_total, 3),
            "curve": build_curve(years, parsed_by_year, window_days, max_days),
        }

    return {
        "meta": {
            "name": "Election Path historical generic-ballot model",
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": "RealClearPolling PDF exports supplied by the user",
            "years": YEARS,
            "presidentialYears": PRESIDENTIAL_YEARS,
            "midtermYears": MIDTERM_YEARS,
            "lowTurnoutMidterms": LOW_TURNOUT_MIDTERMS,
            "highTurnoutMidterms": HIGH_TURNOUT_MIDTERMS,
            "turnoutDefinition": "U.S. Census Bureau CPS citizen voting-age turnout; high-turnout midterm >= 50%.",
            "midtermTurnoutCVAP": MIDTERM_TURNOUT_CVAP,
            "trailingWindowDays": window_days,
            "maxDaysToElection": max_days,
            "marginConvention": "Democratic margin positive; Republican margin negative",
            "method": (
                "For each historical cycle and snapshot date, average all individual polls whose "
                f"fieldwork ended in the trailing {window_days} days. Subtract that polling margin "
                "from the cycle's final national House popular-vote margin. The selected historical "
                "filter determines which cycles enter the equal-weight correction."
            ),
        },
        "cycles": cycles,
        "groups": group_data,
        # Backward-compatible defaults for older UI code.
        "curve": group_data["midterm"]["curve"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-dir", type=Path, default=Path("/mnt/data"))
    parser.add_argument("--out", type=Path, default=Path("data/historical-generic.json"))
    parser.add_argument("--window-days", type=int, default=14)
    parser.add_argument("--max-days", type=int, default=240)
    args = parser.parse_args()

    dataset = build_dataset(args.pdf_dir, args.window_days, args.max_days)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    for cycle in dataset["cycles"]:
        print(cycle["year"], cycle["cycleType"], cycle["pollCount"], cycle["finalMargin"])


if __name__ == "__main__":
    main()
