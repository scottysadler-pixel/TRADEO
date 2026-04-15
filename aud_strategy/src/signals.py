"""
Compute the three economic signals and the combined LONG / SHORT / FLAT rule.

Parameters are fixed on economic grounds — not optimized on the test sample.
"""

from __future__ import annotations

import pandas as pd

# ~1 trading month; commodity cycle tilt vs noise
COMMODITY_MOMENTUM_PERIOD = 20

# Mild thresholds: require a consistent FinBERT consensus, not one extreme headline
SENTIMENT_BULL_THRESHOLD = 0.10
SENTIMENT_BEAR_THRESHOLD = -0.10


def compute_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add sig_rate, sig_commodity, sig_sentiment, commodity_momentum, and signal.

    Rate differential > 0 => AUD cash rate above USD => carry favors AUD => +1.
    Rate diff < 0 => signal -1 (bearish AUD).
    """
    out = df.copy()

    # --- 1) Rate differential ---
    # Carry: higher AU policy rate vs US tends to attract AUD bids (all else equal).
    out["sig_rate"] = out["rate_diff"].apply(
        lambda x: 1 if x > 0 else (-1 if x < 0 else 0)
    )

    # --- 2) Commodity momentum (gold; optional equal blend with iron ore) ---
    if "iron_ore_close" in out.columns and out["iron_ore_close"].notna().any():
        comm_px = (out["gold_close"] + out["iron_ore_close"]) / 2.0
    else:
        comm_px = out["gold_close"]
    # 20-day momentum in commodity proxy; positive => income/terms-of-trade tailwind for AUD.
    out["commodity_momentum"] = comm_px.pct_change(COMMODITY_MOMENTUM_PERIOD)

    def _sig_comm(x: float) -> int | None:
        if pd.isna(x):
            return None
        if x > 0:
            return 1
        if x < 0:
            return -1
        return 0

    out["sig_commodity"] = out["commodity_momentum"].apply(_sig_comm)

    # --- 3) Sentiment (precomputed FinBERT daily average) ---
    out["sig_sentiment"] = out["sentiment_score"].apply(
        lambda x: 1
        if x > SENTIMENT_BULL_THRESHOLD
        else (-1 if x < SENTIMENT_BEAR_THRESHOLD else 0)
    )

    # --- 4) Three green lights ---
    def _combine(row: pd.Series) -> str:
        parts = [row["sig_rate"], row["sig_commodity"], row["sig_sentiment"]]
        if any(p is None for p in parts):
            return "FLAT"
        if any(pd.isna(p) for p in parts):
            return "FLAT"
        if all(p == 1 for p in parts):
            return "LONG"
        if all(p == -1 for p in parts):
            return "SHORT"
        return "FLAT"

    out["signal"] = out.apply(_combine, axis=1)
    return out
