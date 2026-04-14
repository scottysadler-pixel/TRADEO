#!/usr/bin/env python3
"""
Build daily sentiment_score from news headlines (VADER) or neutral fallback.

Install: pip install -r scripts/requirements.txt

Usage:
  python scripts/fetchSentiment.py --prices data/prices.csv [--out data/sentiment.csv]

If NEWSAPI_KEY is set, pulls headlines and scores titles (needs vaderSentiment + requests).
Without packages or API: writes neutral 0.0 for every date in prices.csv.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from datetime import date, timedelta

try:
    import requests
except ImportError:
    requests = None  # type: ignore

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:
    SentimentIntensityAnalyzer = None  # type: ignore


def load_price_dates(path: str) -> list[str]:
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        return [row["date"].strip() for row in r if row.get("date")]


def fetch_newsapi(from_date: str, to_date: str, api_key: str) -> list[tuple[str, str]]:
    if requests is None:
        raise RuntimeError("pip install requests")
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": '(AUD OR RBA OR "Australian dollar" OR "iron ore")',
        "from": from_date,
        "to": to_date,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": 100,
        "apiKey": api_key,
    }
    out: list[tuple[str, str]] = []
    page = 1
    while page <= 5:
        params["page"] = page
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"NewsAPI {resp.status_code}: {resp.text}")
        data = resp.json()
        for art in data.get("articles", []):
            t = art.get("publishedAt", "")[:10]
            title = art.get("title") or ""
            if t:
                out.append((t, title))
        if page >= (data.get("totalResults", 0) + 99) // 100:
            break
        if not data.get("articles"):
            break
        page += 1
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--prices", default="data/prices.csv")
    p.add_argument("--out", default="data/sentiment.csv")
    args = p.parse_args()

    dates = load_price_dates(args.prices)
    if not dates:
        print("No dates in prices file", file=sys.stderr)
        sys.exit(1)

    api_key = os.environ.get("NEWSAPI_KEY", "")
    scores_by_day: dict[str, list[float]] = defaultdict(list)

    if (
        api_key
        and requests
        and SentimentIntensityAnalyzer is not None
    ):
        end_d = max(dates)
        start_d = min(dates)
        try:
            end = date.fromisoformat(end_d)
            start = date.fromisoformat(start_d)
            span = (end - start).days
            if span > 27:
                start = end - timedelta(days=27)
            from_s = start.isoformat()
            to_s = end.isoformat()
            analyzer = SentimentIntensityAnalyzer()
            articles = fetch_newsapi(from_s, to_s, api_key)
            for pub, title in articles:
                if not title:
                    continue
                compound = analyzer.polarity_scores(title)["compound"]
                scores_by_day[pub].append(compound)
            print(f"Scored {len(articles)} headlines across {len(scores_by_day)} days")
        except Exception as e:
            print(f"NewsAPI / VADER failed ({e}); using neutral fill.", file=sys.stderr)
            scores_by_day.clear()
    elif api_key:
        print(
            "NEWSAPI_KEY set but requests/vaderSentiment missing — using neutral fill.",
            file=sys.stderr,
        )

    rows: list[tuple[str, float]] = []
    for d in sorted(dates):
        vals = scores_by_day.get(d, [])
        if vals:
            s = sum(vals) / len(vals)
        else:
            s = 0.0
        rows.append((d, s))

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "sentiment_score"])
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
