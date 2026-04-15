#!/usr/bin/env python3
"""
CLI: load CSVs -> signals -> backtest -> metrics -> output/ artifacts for Trade1 dashboard.

Run from repo root:
  python aud_strategy/run.py
  python aud_strategy/run.py --simple
  python aud_strategy/run.py --live
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

_AUD_ROOT = Path(__file__).resolve().parent
if str(_AUD_ROOT) not in sys.path:
    sys.path.insert(0, str(_AUD_ROOT))

from src.backtest import run_simple_backtest, run_walkforward
from src.loader import ensure_seed_auxiliary_csvs, load_all
from src.live_signal import print_live_signal
from src.metrics import summarize_from_equity_and_trades
from src.signals import (
    COMMODITY_MOMENTUM_PERIOD,
    SENTIMENT_BEAR_THRESHOLD,
    SENTIMENT_BULL_THRESHOLD,
    compute_signals,
)


def _repo_root() -> Path:
    """Trade1 repo root (parent of aud_strategy/)."""
    return Path(__file__).resolve().parent.parent


def _write_trades_csv(path: Path, trades: list) -> None:
    if not trades:
        path.write_text("entryDate,exitDate,side,entryPrice,exitPrice,pnl,walkforwardWindow\n", encoding="utf-8")
        return
    keys = list(trades[0].keys())
    lines = [",".join(keys)]
    for t in trades:
        lines.append(",".join(str(t.get(k, "")) for k in keys))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_equity_csv(path: Path, curve: list) -> None:
    if not curve:
        path.write_text("date,equity,walkforwardWindow\n", encoding="utf-8")
        return
    cols = list(curve[0].keys())
    lines = [",".join(str(c) for c in cols)]
    for pt in curve:
        lines.append(",".join(str(pt.get(c, "")) for c in cols))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="AUD three-signal FX backtester")
    parser.add_argument(
        "--simple",
        action="store_true",
        help="Full-history backtest instead of walk-forward",
    )
    parser.add_argument("--live", action="store_true", help="Print latest row signal and exit")
    parser.add_argument("--train-window", type=int, default=500)
    parser.add_argument("--test-window", type=int, default=90)
    args = parser.parse_args()

    root = _repo_root()
    if args.live:
        return print_live_signal(root)

    ensure_seed_auxiliary_csvs(root)
    data = root / "data"
    out_dir = root / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    merged = load_all(
        data / "prices.csv",
        data / "commodities.csv",
        data / "rates.csv",
        data / "sentiment.csv",
    )
    sig = compute_signals(merged)

    mode = "simple" if args.simple else "walkforward"
    wf_note: str | None = None
    wf_windows = None

    if args.simple:
        bt = run_simple_backtest(sig)
        trades = bt["trades"]
        curve = bt["equityCurve"]
    else:
        wf = run_walkforward(
            sig,
            train_window=args.train_window,
            test_window=args.test_window,
        )
        trades = wf["trades"]
        curve = wf["equityCurve"]
        wf_windows = wf["windows"]
        if wf["windowCount"] == 0:
            wf_note = (
                f"Walk-forward skipped: need at least train_window + test_window rows "
                f"({args.train_window + args.test_window}); dataset has {len(sig)}. "
                f"Falling back to simple backtest for this run."
            )
            bt = run_simple_backtest(sig)
            trades = bt["trades"]
            curve = bt["equityCurve"]
            mode = "simple_fallback"

    metrics = summarize_from_equity_and_trades(curve, trades)
    metrics_json: dict = {}
    for k, v in metrics.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            metrics_json[k] = None
        else:
            metrics_json[k] = v

    daily_cols = [
        "audusd_close",
        "rate_diff",
        "commodity_momentum",
        "sentiment_score",
        "sig_rate",
        "sig_commodity",
        "sig_sentiment",
        "signal",
    ]
    preview_df = sig[daily_cols].copy()
    preview_df.insert(
        0,
        "date",
        preview_df.index.map(lambda x: x.date().isoformat()),
    )
    daily_preview = preview_df.tail(60).to_dict(orient="records")

    last_row = sig.iloc[-1]
    sc = last_row["sig_commodity"]
    latest = {
        "date": str(last_row.name.date()),
        "signal": str(last_row["signal"]),
        "sig_rate": int(last_row["sig_rate"]),
        "sig_commodity": int(sc)
        if sc is not None and not (isinstance(sc, float) and pd.isna(sc))
        else None,
        "sig_sentiment": int(last_row["sig_sentiment"]),
        "rate_diff": float(last_row["rate_diff"]),
        "sentiment_score": float(last_row["sentiment_score"]),
        "commodity_momentum": float(last_row["commodity_momentum"])
        if pd.notna(last_row["commodity_momentum"])
        else None,
    }

    generated_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "strategyId": "py_three_green_lights",
        "mode": mode,
        "parameters": {
            "commodityMomentumPeriod": COMMODITY_MOMENTUM_PERIOD,
            "sentimentBullThreshold": SENTIMENT_BULL_THRESHOLD,
            "sentimentBearThreshold": SENTIMENT_BEAR_THRESHOLD,
            "trainWindow": args.train_window,
            "testWindow": args.test_window,
        },
        "metrics": metrics_json,
        "walkforwardWindows": wf_windows,
        "walkforwardNote": wf_note,
        "rowCount": len(sig),
        "latest": latest,
        "dailyPreview": daily_preview,
        "trades": trades[-200:],  # cap JSON size for dashboard
        "tradeCountTotal": len(trades),
    }

    summary_path = out_dir / "py_strategy_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    _write_trades_csv(out_dir / "py_strategy_trades.csv", trades)
    _write_equity_csv(out_dir / "py_strategy_equity_curve.csv", curve)

    txt_lines = [
        "AUD/USD three-signal strategy (Python) — paper backtest",
        f"Generated: {generated_at}",
        f"Mode: {mode}",
        f"Rows (merged): {len(sig)}",
        f"Total PnL (per1 unit base, no costs): {metrics['totalPnl']:.6f}",
        f"Max drawdown: {metrics['maxDrawdown']:.6f}",
        f"Sharpe (annualized, from equity diffs): {metrics['sharpeAnnualized']}",
        f"Trades: {metrics['totalTrades']}",
        f"Win rate: {metrics['winRate']}",
        "",
        "Latest bar:",
        f"  {latest['date']}  signal={latest['signal']}  "
        f"rates={latest['sig_rate']} comm={latest['sig_commodity']} sent={latest['sig_sentiment']}",
        "",
        "Not financial advice. Prefer `python aud_strategy/scripts/fetch_real_data.py` for gold + rates + sentiment proxy.",
    ]
    if wf_note:
        txt_lines.insert(5, wf_note)
    (out_dir / "py_strategy_summary.txt").write_text("\n".join(txt_lines) + "\n", encoding="utf-8")

    print(f"Wrote {summary_path}")
    print(f"Wrote {out_dir / 'py_strategy_trades.csv'}")
    print(f"Wrote {out_dir / 'py_strategy_equity_curve.csv'}")
    print(f"Wrote {out_dir / 'py_strategy_summary.txt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
