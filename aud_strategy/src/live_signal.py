"""Print today's (latest row) three-signal readout for quick operator checks."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .loader import ensure_seed_auxiliary_csvs, load_all
from .signals import compute_signals


def describe_row(row: pd.Series) -> str:
    d = row.name
    d_s = d.date().isoformat() if hasattr(d, "date") else str(d)
    parts = [
        f"date={d_s}",
        f"signal={row['signal']}",
        f"rate_diff={row['rate_diff']:.4f} -> sig_rate={row['sig_rate']}",
        f"commodity_mom={row['commodity_momentum']:.6f} -> sig_commodity={row['sig_commodity']}",
        f"sentiment={row['sentiment_score']:.4f} -> sig_sentiment={row['sig_sentiment']}",
        f"audusd_close={row['audusd_close']:.5f}",
    ]
    return " | ".join(parts)


def print_live_signal(repo_root: Path) -> int:
    ensure_seed_auxiliary_csvs(repo_root)
    data = repo_root / "data"
    merged = load_all(
        data / "prices.csv",
        data / "commodities.csv",
        data / "rates.csv",
        data / "sentiment.csv",
    )
    sig = compute_signals(merged)
    last = sig.iloc[-1]
    print(describe_row(last))
    print(
        "\nRule: LONG only if rate, commodity momentum, and sentiment are all +1; "
        "SHORT only if all -1; else FLAT (wait)."
    )
    return 0
