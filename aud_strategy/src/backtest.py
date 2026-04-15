"""
Backtest engine: single-position LONG / SHORT / FLAT with same PnL convention as Trade1 TS backtester.

PnL per unit of notional (AUD in AUD/USD terms):
  LONG:  exit - entry
  SHORT: entry - exit
"""

from __future__ import annotations

from typing import Any, Literal

import pandas as pd

PositionSide = Literal["FLAT", "LONG", "SHORT"]


def _compare_iso(a: str, b: str) -> int:
    if a < b:
        return -1
    if a > b:
        return 1
    return 0


def run_backtest_slice(df: pd.DataFrame) -> dict[str, Any]:
    """
    Run the state machine on a chronological slice of rows with columns:
    date (index or column), audusd_close, signal (LONG/SHORT/FLAT).
    """
    work = df.copy().reset_index()
    if "date" not in work.columns and "index" in work.columns:
        work = work.rename(columns={"index": "date"})
    if "date" not in work.columns:
        raise ValueError("Backtest slice needs a DatetimeIndex or a date column.")
    work["date"] = work["date"].astype(str)

    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, float | str]] = []

    current: PositionSide = "FLAT"
    entry_price: float | None = None
    entry_date: str | None = None
    equity = 0.0

    rows = work.to_dict("records")

    for row in rows:
        date = str(row["date"])
        price = float(row["audusd_close"])
        signal = str(row["signal"])

        if current == "FLAT":
            if signal in ("LONG", "SHORT"):
                current = signal  # type: ignore[assignment]
                entry_price = price
                entry_date = date
        elif current == "LONG":
            if signal == "LONG":
                pass
            else:
                assert entry_price is not None and entry_date is not None
                pnl = price - entry_price
                trades.append(
                    {
                        "entryDate": entry_date,
                        "exitDate": date,
                        "side": "LONG",
                        "entryPrice": entry_price,
                        "exitPrice": price,
                        "pnl": pnl,
                    }
                )
                equity += pnl
                if signal == "SHORT":
                    current = "SHORT"
                    entry_price = price
                    entry_date = date
                else:
                    current = "FLAT"
                    entry_price = None
                    entry_date = None
        else:  # SHORT
            if signal == "SHORT":
                pass
            else:
                assert entry_price is not None and entry_date is not None
                pnl = entry_price - price
                trades.append(
                    {
                        "entryDate": entry_date,
                        "exitDate": date,
                        "side": "SHORT",
                        "entryPrice": entry_price,
                        "exitPrice": price,
                        "pnl": pnl,
                    }
                )
                equity += pnl
                if signal == "LONG":
                    current = "LONG"
                    entry_price = price
                    entry_date = date
                else:
                    current = "FLAT"
                    entry_price = None
                    entry_date = None

        equity_curve.append({"date": date, "equity": equity})

    # Close at last close if position opened before last bar
    if rows and current != "FLAT" and entry_price is not None and entry_date is not None:
        last = rows[-1]
        last_price = float(last["audusd_close"])
        last_date = str(last["date"])
        if _compare_iso(entry_date, last_date) < 0:
            if current == "LONG":
                pnl = last_price - entry_price
                trades.append(
                    {
                        "entryDate": entry_date,
                        "exitDate": last_date,
                        "side": "LONG",
                        "entryPrice": entry_price,
                        "exitPrice": last_price,
                        "pnl": pnl,
                    }
                )
                equity += pnl
            else:
                pnl = entry_price - last_price
                trades.append(
                    {
                        "entryDate": entry_date,
                        "exitDate": last_date,
                        "side": "SHORT",
                        "entryPrice": entry_price,
                        "exitPrice": last_price,
                        "pnl": pnl,
                    }
                )
                equity += pnl
            current = "FLAT"
            if equity_curve:
                equity_curve[-1] = {"date": last_date, "equity": equity}

    return {
        "trades": trades,
        "equityCurve": equity_curve,
        "finalEquity": equity,
        "openPosition": None
        if current == "FLAT"
        else {"side": current, "entryDate": entry_date, "entryPrice": entry_price},
    }


def run_simple_backtest(df: pd.DataFrame) -> dict[str, Any]:
    """Full-history backtest on the full signal dataframe."""
    return run_backtest_slice(df)


def run_walkforward(
    df: pd.DataFrame,
    train_window: int = 500,
    test_window: int = 90,
) -> dict[str, Any]:
    """
    Walk-forward validation:

    For k = 0, 1, ... while slices fit:
      - Rows [k*H : k*H + T) are warmup / training span (no trades; indicators already computed on full df).
      - Rows [k*H + T : k*H + T + H) are the out-of-sample test window (trade).

    Rule-based signals are not re-fitted per window; sliding simulates sequential OOS periods.
    """
    n = len(df)
    all_trades: list[dict[str, Any]] = []
    stitched_equity: list[dict[str, float | str]] = []
    windows: list[dict[str, Any]] = []
    equity_offset = 0.0

    k = 0
    while True:
        train_start = k * test_window
        train_end = train_start + train_window
        test_start = train_end
        test_end = test_start + test_window
        if test_end > n:
            break
        test_df = df.iloc[test_start:test_end]
        res = run_backtest_slice(test_df)
        w_trades = res["trades"]
        for t in w_trades:
            t2 = dict(t)
            t2["walkforwardWindow"] = k
            all_trades.append(t2)

        for pt in res["equityCurve"]:
            stitched_equity.append(
                {
                    "date": pt["date"],
                    "equity": float(pt["equity"]) + equity_offset,
                    "walkforwardWindow": k,
                }
            )
        equity_offset += float(res["finalEquity"])
        window_pnl = res["finalEquity"]
        windows.append(
            {
                "index": k,
                "testStartIndex": test_start,
                "testEndIndex": test_end - 1,
                "testStartDate": str(test_df.index[0].date()),
                "testEndDate": str(test_df.index[-1].date()),
                "tradeCount": len(w_trades),
                "windowPnl": window_pnl,
            }
        )
        k += 1

    return {
        "windows": windows,
        "trades": all_trades,
        "equityCurve": stitched_equity,
        "windowCount": k,
    }
