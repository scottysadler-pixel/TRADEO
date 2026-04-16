#!/usr/bin/env python3
"""
Fetch Australian economic news from GDELT (last 7 days) and score with VADER sentiment.

GDELT Doc API is free, no signup. Falls back to RSS feeds if GDELT fails.
Writes data/sentiment.csv aligned to data/prices.csv dates (forward-fill sentiment when no news).

Usage (from Trade1 repo root):
  pip install -r scripts/requirements.txt  # vaderSentiment + requests
  python aud_strategy/scripts/fetch_news_gdelt.py
"""

from __future__ import annotations

import csv
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import requests
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_REPO = Path(__file__).resolve().parent.parent.parent

GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

AUD_KEYWORDS = [
    "Australia",
    "AUD",
    "Australian dollar",
    "RBA",
    "Reserve Bank of Australia",
    "Australian economy",
]

RSS_FEEDS = [
    "https://www.abc.net.au/news/feed/51120/rss.xml",
    "https://www.rba.gov.au/rss-feeds/speeches.xml",
]


def fetch_gdelt_headlines(days_back: int = 7) -> list[dict[str, str]]:
    """
    GDELT Doc API: search for AUD-related articles in the last N days.
    Returns list of dicts: {date: YYYY-MM-DD, headline: str, url: str}.
    """
    now = datetime.utcnow()
    start = now - timedelta(days=days_back)
    query = " OR ".join(AUD_KEYWORDS)
    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": 250,
        "format": "json",
        "startdatetime": start.strftime("%Y%m%d%H%M%S"),
        "enddatetime": now.strftime("%Y%m%d%H%M%S"),
    }
    try:
        r = requests.get(GDELT_DOC_URL, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        articles = data.get("articles") or []
        out = []
        for a in articles:
            title = (a.get("title") or "").strip()
            url = (a.get("url") or "").strip()
            seendate = a.get("seendate") or ""
            if not title or not seendate:
                continue
            try:
                dt = datetime.strptime(seendate[:8], "%Y%m%d")
                date_s = dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
            out.append({"date": date_s, "headline": title, "url": url})
        return out
    except Exception as exc:
        print(f"WARN: GDELT failed ({exc}); falling back to RSS.")
        return []


def fetch_rss_headlines(feed_url: str, days_back: int = 7) -> list[dict[str, str]]:
    """Parse RSS feed for recent items."""
    cutoff = datetime.utcnow() - timedelta(days=days_back)
    try:
        r = requests.get(feed_url, timeout=30)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        items = root.findall(".//item")
        out = []
        for item in items:
            title_el = item.find("title")
            link_el = item.find("link")
            pubdate_el = item.find("pubDate")
            if title_el is None or title_el.text is None:
                continue
            title = title_el.text.strip()
            url = link_el.text.strip() if link_el is not None and link_el.text else ""
            if pubdate_el is not None and pubdate_el.text:
                try:
                    dt = pd.to_datetime(pubdate_el.text, utc=True)
                    if dt < cutoff:
                        continue
                    date_s = dt.strftime("%Y-%m-%d")
                except Exception:
                    date_s = datetime.utcnow().strftime("%Y-%m-%d")
            else:
                date_s = datetime.utcnow().strftime("%Y-%m-%d")
            out.append({"date": date_s, "headline": title, "url": url})
        return out
    except Exception as exc:
        print(f"WARN: RSS {feed_url} failed ({exc}).")
        return []


def score_vader(headlines: list[dict[str, str]]) -> dict[str, list[float]]:
    """Score headlines with VADER, group by date."""
    sia = SentimentIntensityAnalyzer()
    by_date: dict[str, list[float]] = defaultdict(list)
    for h in headlines:
        score = sia.polarity_scores(h["headline"])["compound"]
        by_date[h["date"]].append(score)
    return by_date


def main() -> int:
    repo = _REPO
    prices_path = repo / "data" / "prices.csv"
    if not prices_path.is_file():
        print(f"ERROR: {prices_path} not found.")
        return 1

    prices = pd.read_csv(prices_path, parse_dates=["date"])
    trading_dates = sorted(prices["date"].dt.strftime("%Y-%m-%d").unique())
    min_date_obj = pd.to_datetime(trading_dates[0])
    max_date_obj = pd.to_datetime(trading_dates[-1])

    print("Fetching GDELT news (last 7 days) …")
    gdelt = fetch_gdelt_headlines(days_back=7)
    print(f"  → {len(gdelt)} GDELT articles")

    rss_all = []
    if len(gdelt) < 5:
        print("GDELT returned few results; fetching RSS backups …")
        for feed in RSS_FEEDS:
            rss = fetch_rss_headlines(feed, days_back=7)
            print(f"  → {len(rss)} from {feed}")
            rss_all.extend(rss)

    all_headlines = gdelt + rss_all
    if not all_headlines:
        print("WARN: No headlines from GDELT or RSS. Writing neutral sentiment.")
        sentiment_path = repo / "data" / "sentiment.csv"
        with sentiment_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date", "sentiment_score"])
            for d in trading_dates:
                w.writerow([d, "0.0"])
        print(f"Wrote {sentiment_path} (all neutral).")
        return 0

    print(f"Scoring {len(all_headlines)} headlines with VADER …")
    by_date = score_vader(all_headlines)

    # Build sentiment series aligned to trading dates
    sent_map = {}
    for d, scores in by_date.items():
        sent_map[d] = sum(scores) / len(scores)

    # Forward-fill from last news date; backfill if first date has no news
    sentiment_series = []
    last_score = 0.0
    for d in trading_dates:
        if d in sent_map:
            last_score = sent_map[d]
        sentiment_series.append((d, last_score))

    sentiment_path = repo / "data" / "sentiment.csv"
    with sentiment_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "sentiment_score"])
        for d, s in sentiment_series:
            w.writerow([d, f"{s:.6f}"])

    print(f"Wrote {sentiment_path} ({len(by_date)} days with news, {len(trading_dates)} total rows).")
    unique_days = len(by_date)
    print(f"Recent headlines sample ({min(5, len(all_headlines))}):")
    for h in all_headlines[:5]:
        print(f"  {h['date']}: {h['headline'][:80]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
