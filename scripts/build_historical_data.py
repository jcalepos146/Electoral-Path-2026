#!/usr/bin/env python3
"""Build the historical generic-ballot dataset from RealClearPolling PDF exports.

Requires the `pdftotext` CLI (Poppler). The parser is intentionally narrow: it
reads poll rows from the five supplied RealClearPolling PDF exports and turns
those rows into a reproducible daily historical-adjustment curve.

Model convention:
  * Democratic margin is positive; Republican margin is negative.
  * A historical snapshot is a simple average of polls whose fieldwork ended
    in the trailing 14 days as of that snapshot date.
  * Each election cycle gets equal weight in the cross-cycle correction.
  * correction = final House popular-vote margin - snapshot polling margin.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import statistics
import subprocess
from pathlib import Path

YEARS = [2006, 2010, 2014, 2018, 2022]
PARTY_ORDER = {
    2006: ("R", "D"),
    2010: ("R", "D"),
    2014: ("R", "D"),
    2018: ("D", "R"),
    2022: ("R", "D"),
}
ELECTION_DATES = {
    2006: dt.date(2006, 11, 7),
    2010: dt.date(2010, 11, 2),
    2014: dt.date(2014, 11, 4),
    2018: dt.date(2018, 11, 6),
    2022: dt.date(2022, 11, 8),
}
FINAL_RESULTS = {
    2006: {"dem": 52.0, "rep": 44.1},
    2010: {"dem": 44.8, "rep": 51.6},
    2014: {"dem": 45.7, "rep": 51.4},
    2018: {"dem": 53.3, "rep": 44.9},
    2022: {"dem": 47.8, "rep": 50.6},
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
    """Infer the year for an RCP date that omits the year.

    The exports run from the preceding November/December through Election Day.
    November dates after that cycle's Election Day are therefore assigned to
    the prior calendar year.
    """
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
        if pollster == "RCP Average":
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
        key = (
            pollster,
            row["startDate"],
            row["endDate"],
            row["dem"],
            row["rep"],
        )
        deduped[key] = row

    rows = sorted(deduped.values(), key=lambda r: (r["endDate"], r["pollster"]))
    return rows


def snapshot_average(rows: list[dict], snapshot: dt.date, window_days: int) -> dict | None:
    cutoff = snapshot - dt.timedelta(days=window_days - 1)
    included = [
        row
        for row in rows
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


def build_dataset(pdf_dir: Path, window_days: int = 14, max_days: int = 240) -> dict:
    cycles: list[dict] = []
    parsed_by_year: dict[int, list[dict]] = {}

    for year in YEARS:
        pdf = pdf_dir / f"{year} Generic Congressional Vote _ RealClearPolling.pdf"
        if not pdf.exists():
            raise FileNotFoundError(f"Missing source PDF: {pdf}")

        rows = parse_poll_rows(pdf, year)
        parsed_by_year[year] = rows
        final = FINAL_RESULTS[year]
        cycles.append(
            {
                "year": year,
                "electionDate": ELECTION_DATES[year].isoformat(),
                "finalDem": final["dem"],
                "finalRep": final["rep"],
                "finalMargin": round(final["dem"] - final["rep"], 3),
                "pollCount": len(rows),
                "polls": rows,
            }
        )

    curve: list[dict] = []
    for days_to_election in range(max_days, -1, -1):
        analogs = []
        for year in YEARS:
            snapshot_date = ELECTION_DATES[year] - dt.timedelta(days=days_to_election)
            avg = snapshot_average(parsed_by_year[year], snapshot_date, window_days)
            if avg is None:
                continue
            final = FINAL_RESULTS[year]
            final_margin = final["dem"] - final["rep"]
            correction = final_margin - avg["margin"]
            analogs.append(
                {
                    "year": year,
                    "pollCount": avg["n"],
                    "snapshotMargin": round(avg["margin"], 3),
                    "snapshotDem": round(avg["dem"], 3),
                    "snapshotRep": round(avg["rep"], 3),
                    "finalMargin": round(final_margin, 3),
                    "correction": round(correction, 3),
                    "demChange": round(final["dem"] - avg["dem"], 3),
                    "repChange": round(final["rep"] - avg["rep"], 3),
                }
            )

        if not analogs:
            continue

        corrections = [a["correction"] for a in analogs]
        dem_changes = [a["demChange"] for a in analogs]
        rep_changes = [a["repChange"] for a in analogs]
        curve.append(
            {
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
            }
        )

    return {
        "meta": {
            "name": "Election Path historical generic-ballot model",
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": "RealClearPolling PDF exports supplied by the user",
            "years": YEARS,
            "trailingWindowDays": window_days,
            "maxDaysToElection": max_days,
            "meanFinalMajorPartyTotal": round(statistics.fmean(FINAL_RESULTS[y]["dem"] + FINAL_RESULTS[y]["rep"] for y in YEARS), 3),
            "meanFinalOtherShare": round(100 - statistics.fmean(FINAL_RESULTS[y]["dem"] + FINAL_RESULTS[y]["rep"] for y in YEARS), 3),
            "marginConvention": "Democratic margin positive; Republican margin negative",
            "method": (
                "For each historical cycle and snapshot date, average all individual polls whose "
                f"fieldwork ended in the trailing {window_days} days. Subtract that polling margin "
                "from the cycle's final national House popular-vote margin. The forecast correction "
                "is the equal-weight mean of those cycle-level corrections."
            ),
        },
        "cycles": cycles,
        "curve": curve,
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
        print(cycle["year"], cycle["pollCount"], cycle["finalMargin"])


if __name__ == "__main__":
    main()
