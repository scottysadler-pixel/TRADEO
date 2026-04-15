"""Performance metrics from trades and equity curve (paper, no costs)."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def _annualized_sharpe(daily_returns: np.ndarray, trading_days: float = 252.0) -> float:
    if len(daily_returns) < 2:
        return float("nan")
    mu = float(np.mean(daily_returns))
    sd = float(np.std(daily_returns, ddof=1))
    if sd == 0 or not math.isfinite(sd):
        return float("nan")
    return (mu / sd) * math.sqrt(trading_days)


def summarize_from_equity_and_trades(
    equity_curve: list[dict[str, Any]],
    trades: list[dict[str, Any]],
) -> dict[str, Any]:
    """Sharpe on daily equity changes, max drawdown on equity curve, win rate on trades."""
    if not equity_curve:
        return {
            "totalPnl": 0.0,
            "maxDrawdown": 0.0,
            "sharpeAnnualized": float("nan"),
            "totalTrades": 0,
            "winRate": float("nan"),
            "profitFactor": float("nan"),
            "avgTradePnl": float("nan"),
        }

    eq_df = pd.DataFrame(equity_curve)
    eq_df["date"] = pd.to_datetime(eq_df["date"])
    eq_df = eq_df.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    eq_series = eq_df["equity"].astype(float)
    rets = eq_series.diff().dropna().values
    sharpe = _annualized_sharpe(rets)

    max_eq = eq_series.cummax()
    dd = (max_eq - eq_series).max()
    total_pnl = float(eq_series.iloc[-1]) if len(eq_series) else 0.0

    wins = [t for t in trades if t.get("pnl", 0) > 0]
    losses = [t for t in trades if t.get("pnl", 0) < 0]
    win_rate = len(wins) / len(trades) if trades else float("nan")
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = -sum(t["pnl"] for t in losses)
    profit_factor = (
        gross_win / gross_loss if gross_loss > 0 else (float("inf") if gross_win > 0 else 0.0)
    )
    avg_trade = float(np.mean([t["pnl"] for t in trades])) if trades else float("nan")

    return {
        "totalPnl": total_pnl,
        "maxDrawdown": float(dd),
        "sharpeAnnualized": float(sharpe),
        "totalTrades": len(trades),
        "winRate": float(win_rate),
        "profitFactor": float(profit_factor) if math.isfinite(profit_factor) else profit_factor,
        "avgTradePnl": avg_trade,
    }
