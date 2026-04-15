"""
Load and merge daily inputs for the three-signal AUD/USD strategy.

Merges prices, commodities, (forward-filled) rates, and sentiment on date.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd


def ensure_seed_auxiliary_csvs(repo_root: Path) -> None:
    """
    If data/commodities.csv or data/rates.csv are missing, create demo files
    aligned to data/prices.csv dates so beginners can run the pipeline immediately.
    Replace with real commodity and policy-rate history for research.
    """
    data_dir = repo_root / "data"
    prices_path = data_dir / "prices.csv"
    comm_path = data_dir / "commodities.csv"
    rates_path = data_dir / "rates.csv"
    if not prices_path.is_file():
        return
    if comm_path.is_file() and rates_path.is_file():
        return

    with prices_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        return

    def rate_for(date_s: str) -> tuple[float, float]:
        t = pd.Timestamp(date_s)
        if t < pd.Timestamp("2025-06-01"):
            return 4.35, 5.33
        if t < pd.Timestamp("2026-01-01"):
            return 4.10, 4.75
        return 4.10, 4.25

    base = 2350.0
    if not comm_path.is_file():
        with comm_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date", "gold_close"])
            for i, r in enumerate(rows, start=1):
                d = r["date"]
                gold = base + i * 0.35 + (i % 17) * 2.1
                w.writerow([d, f"{gold:.2f}"])

    if not rates_path.is_file():
        with rates_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["date", "rba_rate", "fed_rate"])
            for r in rows:
                d = r["date"]
                rb, fd = rate_for(d)
                w.writerow([d, rb, fd])


def load_all(
    prices_path: str | Path,
    commodities_path: str | Path,
    rates_path: str | Path,
    sentiment_path: str | Path,
) -> pd.DataFrame:
    """
    Load each CSV with date as index, forward-fill rates to calendar days over the
    price span, inner-join all four frames, add rate_diff, validate numeric columns.
    """
    prices_path = Path(prices_path)
    commodities_path = Path(commodities_path)
    rates_path = Path(rates_path)
    sentiment_path = Path(sentiment_path)

    prices_df = pd.read_csv(prices_path, parse_dates=["date"])
    prices_df = prices_df.set_index("date").sort_index()

    comm_df = pd.read_csv(commodities_path, parse_dates=["date"])
    comm_df = comm_df.set_index("date").sort_index()

    rates_df = pd.read_csv(rates_path, parse_dates=["date"])
    rates_df = rates_df.set_index("date").sort_index()

    sent_df = pd.read_csv(sentiment_path, parse_dates=["date"])
    sent_df = sent_df.set_index("date").sort_index()

    start = prices_df.index.min()
    end = prices_df.index.max()
    daily_index = pd.date_range(start=start, end=end, freq="D")
    rates_daily = rates_df.reindex(daily_index).ffill().bfill()

    merged = prices_df.join(comm_df, how="inner")
    merged = merged.join(rates_daily, how="inner")
    merged = merged.join(sent_df, how="inner")

    merged["rate_diff"] = merged["rba_rate"] - merged["fed_rate"]

    if "iron_ore_close" in merged.columns:
        merged["iron_ore_close"] = merged["iron_ore_close"].ffill().bfill()
        if merged["iron_ore_close"].isna().all():
            merged = merged.drop(columns=["iron_ore_close"])

    expected = [
        "audusd_close",
        "gold_close",
        "rba_rate",
        "fed_rate",
        "sentiment_score",
        "rate_diff",
    ]
    for col in expected:
        if col not in merged.columns:
            raise ValueError(f"Merged data missing expected column: {col}")

    numeric = [
        "audusd_close",
        "gold_close",
        "rba_rate",
        "fed_rate",
        "sentiment_score",
        "rate_diff",
    ]
    if "iron_ore_close" in merged.columns:
        numeric.append("iron_ore_close")

    for col in numeric:
        if col not in merged.columns:
            continue
        if merged[col].isna().any():
            bad = merged[merged[col].isna()].index.min()
            raise ValueError(
                f"Column {col!r} has NaN after merge; first problematic date: {bad}"
            )

    merged = merged.sort_index()
    return merged
