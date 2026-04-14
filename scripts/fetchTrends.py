#!/usr/bin/env python3
"""
Fetch Google Trends interest over time for a keyword (unofficial pytrends).

Install: pip install -r scripts/requirements.txt

Usage:
  python scripts/fetchTrends.py --keyword "iron ore price" [--geo AU] [--out data/trends.csv]

Output CSV: date,trends_index,trends_wow
  - trends_wow = change vs prior week's value (0 for first row after sort).

Note: Respect Google Trends ToS; rate-limit requests; data is often weekly granularity.
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime, timedelta

try:
    from pytrends.request import TrendReq
except ImportError:
    print("Install pytrends: pip install -r scripts/requirements.txt", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--keyword", required=True, help="Single search term")
    p.add_argument("--geo", default="", help="Trends geo code, e.g. AU or empty for worldwide")
    p.add_argument("--out", default="data/trends.csv")
    p.add_argument("--years", type=int, default=3, help="Lookback in years")
    args = p.parse_args()

    end = datetime.utcnow().date()
    start = end - timedelta(days=365 * args.years)
    timeframe = f"{start.isoformat()} {end.isoformat()}"

    pt = TrendReq(hl="en-US", tz=360)
    pt.build_payload([args.keyword], timeframe=timeframe, geo=args.geo)
    df = pt.interest_over_time()
    if df.empty:
        print("No data returned (keyword too niche or blocked).", file=sys.stderr)
        sys.exit(2)

    if "isPartial" in df.columns:
        df = df.drop(columns=["isPartial"])

    col = args.keyword
    if col not in df.columns:
        col = df.columns[0]

    rows: list[tuple[str, float, float]] = []
    prev: float | None = None
    for idx, val in df[col].items():
        d = idx.date().isoformat()
        v = float(val)
        wow = 0.0 if prev is None else v - prev
        rows.append((d, v, wow))
        prev = v

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "trends_index", "trends_wow"])
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
