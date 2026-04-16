#!/usr/bin/env python3
"""
Populate data/commodities.csv, data/rates.csv, and data/sentiment.csv with real or
derived series aligned to data/prices.csv trading dates.

Usage (from Trade1 repo root):
  pip install -r aud_strategy/requirements.txt
  set FRED_API_KEY=your_key   # Windows PowerShell: $env:FRED_API_KEY="..."
  python aud_strategy/scripts/fetch_real_data.py

Gold: Yahoo Finance (GC=F) — no API key.
RBA: Official cash-rate decision table — no API key.
Fed: FRED daily series (default DFF = effective fed funds) if FRED_API_KEY is set;
 otherwise hardcoded FOMC ladder (forward-filled).
Sentiment: Price-action proxy from AUD/USD (5d momentum +20d realized vol) — no news API.
"""

from __future__ import annotations

import argparse
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

# Repo root = parent of aud_strategy/
_REPO = Path(__file__).resolve().parent.parent.parent


def _load_price_dates_and_closes(repo: Path) -> pd.DataFrame:
    p = repo / "data" / "prices.csv"
    if not p.is_file():
        raise FileNotFoundError(f"Missing {p}")
    df = pd.read_csv(p, parse_dates=["date"])
    df = df.sort_values("date").drop_duplicates(subset=["date"])
    df = df.set_index("date")
    return df


def fetch_gold_aligned(index: pd.DatetimeIndex) -> pd.Series:
    import yfinance as yf

    start = index.min().strftime("%Y-%m-%d")
    end = (index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    raw = yf.download(
        "GC=F",
        start=start,
        end=end,
        interval="1d",
        progress=False,
        auto_adjust=False,
    )
    if raw.empty:
        raise RuntimeError("yfinance returned no gold data (check network / ticker).")
    close = raw["Close"].copy()
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    close = close.squeeze()
    close.index = pd.to_datetime(close.index).normalize()
    close = close.sort_index()
    # Align to FX trading dates: ffill from last gold close
    gold = close.reindex(index.normalize(), method="ffill")
    gold = gold.ffill().bfill()
    if gold.isna().any():
        raise RuntimeError("Gold series still has NaN after ffill/bfill.")
    return gold


def fetch_rba_cash_target_decisions() -> pd.DataFrame:
    """
    Scrape RBA cash rate target (% pa) at each effective decision date.
    Falls back to a minimal hardcoded series if the page layout changes.
    """
    url = "https://www.rba.gov.au/statistics/cash-rate/"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; Trade1-data-fetch/1.0)"}
    try:
        r = requests.get(url, headers=headers, timeout=45)
        r.raise_for_status()
        tables = pd.read_html(r.text)
    except Exception as exc:
        print(f"WARN: RBA read_html failed ({exc}); using fallback decision ladder.")
        return _rba_fallback_decisions()

    for tbl in tables:
        cols = [str(c).lower() for c in tbl.columns]
        col_join = " ".join(cols)
        if "effective" in col_join and "cash" in col_join:
            df = tbl.copy()
            # Normalise column names
            rename = {}
            for c in df.columns:
                cl = str(c).lower()
                if "effective" in cl:
                    rename[c] = "effective_date"
                elif "cash" in cl and "target" in cl:
                    rename[c] = "cash_target"
            df = df.rename(columns=rename)
            if "effective_date" not in df.columns or "cash_target" not in df.columns:
                continue
            df["effective_date"] = pd.to_datetime(
                df["effective_date"], dayfirst=True, errors="coerce"
            )
            df["cash_target"] = pd.to_numeric(df["cash_target"], errors="coerce")
            df = df.dropna(subset=["effective_date", "cash_target"])
            df = df.sort_values("effective_date")
            if len(df) < 5:
                continue
            return df[["effective_date", "cash_target"]]

    print("WARN: Could not parse RBA table; using fallback decision ladder.")
    return _rba_fallback_decisions()


def _rba_fallback_decisions() -> pd.DataFrame:
    """Major RBA cash target moves (approximate effective dates) if scrape fails."""
    rows = [
        ("2023-11-07", 4.35),
        ("2024-06-18", 4.35),
        ("2024-08-06", 4.35),
        ("2024-09-24", 4.35),
        ("2024-11-05", 4.35),
        ("2024-12-10", 4.35),
        ("2025-02-18", 4.10),
        ("2025-05-20", 3.85),
        ("2025-08-12", 3.60),
        ("2025-10-07", 3.60),
        ("2025-11-04", 3.60),
        ("2026-02-03", 3.60),
    ]
    return pd.DataFrame(
        {"effective_date": pd.to_datetime([a for a, _ in rows]), "cash_target": [b for _, b in rows]}
    )


def expand_step_rates(
    trading_index: pd.DatetimeIndex, steps: list[tuple[str, float]]
) -> pd.Series:
    """Piecewise-constant rate: last step with effective_date <= d applies on day d."""
    s = pd.DataFrame(
        {"d": pd.to_datetime([pd.Timestamp(x[0]) for x in steps]), "v": [x[1] for x in steps]}
    ).sort_values("d")
    out = []
    for dt in trading_index.normalize():
        mask = s["d"] <= dt
        if not mask.any():
            out.append(s["v"].iloc[0])
        else:
            out.append(float(s.loc[mask, "v"].iloc[-1]))
    return pd.Series(out, index=trading_index, name="rate")


# Fed funds target upper bound / effective-style levels (percent).
# Sparse ladder per project plan; forward-filled between dates on trading calendar.
FED_STEPS: list[tuple[str, float]] = [
    ("2024-01-01", 5.33),
    ("2024-09-19", 4.83),
    ("2024-11-08", 4.58),
    ("2024-12-19", 4.33),
    ("2025-06-18", 4.08),
    ("2026-01-29", 3.83),
]

FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations"


def fetch_fred_series_daily(
    series_id: str,
    api_key: str,
    start: str,
    end: str,
) -> pd.Series:
    """
    Download a FRED daily series (e.g. DFF = effective federal funds rate, %).
    Free API key: https://fred.stlouisfed.org/docs/api/api_key.html
    """
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
        "observation_end": end,
    }
    last_err: str | None = None
    for attempt in range(3):
        r = requests.get(FRED_OBSERVATIONS_URL, params=params, timeout=60)
        if r.status_code == 200:
            break
        try:
            body = r.json()
            last_err = str(body.get("error_message") or body.get("message") or body)[:300]
        except Exception:
            last_err = (r.text or "")[:300]
        if r.status_code in (500, 502, 503, 429) and attempt < 2:
            time.sleep(1.5 * (attempt + 1))
            continue
        raise RuntimeError(
            f"FRED HTTP {r.status_code} for series {series_id!r}. "
            f"Check FRED_API_KEY and https://fred.stlouisfed.org/docs/api/fred/ . Detail: {last_err}"
        )
    payload = r.json()
    if "error_code" in payload:
        raise RuntimeError(f"FRED API error: {payload}")
    obs = payload.get("observations") or []
    rows = []
    for o in obs:
        d = o.get("date")
        v = o.get("value")
        if not d or v in (None, ".", ""):
            continue
        try:
            rows.append((pd.Timestamp(d), float(v)))
        except ValueError:
            continue
    if not rows:
        raise RuntimeError(f"FRED returned no usable observations for {series_id!r}.")
    s = pd.Series({d: v for d, v in rows}).sort_index()
    s.index = pd.to_datetime(s.index).normalize()
    return s


def build_fed_daily_from_fred(
    trading_index: pd.DatetimeIndex,
    api_key: str,
    series_id: str,
) -> pd.Series:
    """Align FRED daily fed rate to FX trading dates (forward-fill)."""
    start = (trading_index.min() - pd.Timedelta(days=14)).strftime("%Y-%m-%d")
    end = (trading_index.max() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    s = fetch_fred_series_daily(series_id, api_key, start, end)
    aligned = s.reindex(trading_index.normalize(), method="ffill")
    aligned = aligned.ffill().bfill()
    if aligned.isna().any():
        raise RuntimeError("Fed rate still has NaN after aligning FRED to trading days.")
    return pd.Series(aligned.values, index=trading_index, name="fed_rate")


def build_rba_daily(trading_index: pd.DatetimeIndex, decisions: pd.DataFrame) -> pd.Series:
    """Forward-fill RBA cash target from decision dates onto trading days."""
    d = decisions.sort_values("effective_date")
    out = []
    for dt in trading_index.normalize():
        mask = d["effective_date"] <= dt
        if not mask.any():
            out.append(float(d["cash_target"].iloc[0]))
        else:
            out.append(float(d.loc[mask, "cash_target"].iloc[-1]))
    return pd.Series(out, index=trading_index, name="rba_rate")


def price_action_sentiment(close: pd.Series) -> pd.Series:
    """
    Proxy for 'risk appetite' / directional pressure without headlines.
    Combines 5-day return (momentum) and 20-day realized vol of log returns.
    Output roughly in [-1, 1].
    """
    r = np.log(close).diff()
    vol = r.rolling(20, min_periods=5).std()
    mom5 = close.pct_change(5)
    risk_adj = mom5 / (vol + 1e-8)
    # High vol alone: slight negative tilt (stress)
    vol_norm = (vol - vol.expanding(min_periods=20).median()) / (
        vol.expanding(min_periods=20).std() + 1e-8
    )
    raw = 0.75 * np.tanh(risk_adj * 8.0) - 0.25 * np.tanh(vol_norm.fillna(0.0))
    return pd.Series(raw, index=close.index, name="sentiment_score").fillna(0.0)


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch real gold, rates, sentiment proxy.")
    parser.add_argument(
        "--repo",
        type=Path,
        default=_REPO,
        help="Trade1 repo root (default: auto)",
    )
    parser.add_argument(
        "--fred-series",
        default="DFF",
        help="FRED series id for US policy rate (default DFF = effective federal funds rate). "
        "Alternatives: DFEDTARU (target upper limit), DFEDTARL (target lower limit).",
    )
    args = parser.parse_args()
    repo = args.repo.resolve()

    try:
        from dotenv import load_dotenv

        # Repo-root .env (gitignored). Shell env wins if already set.
        load_dotenv(repo / ".env", override=False)
    except ImportError:
        pass

    prices = _load_price_dates_and_closes(repo)
    idx = prices.index

    print("Fetching gold (GC=F) …")
    gold = fetch_gold_aligned(idx)

    print("Fetching RBA cash rate decisions …")
    rba_decisions = fetch_rba_cash_target_decisions()
    rba_daily = build_rba_daily(idx, rba_decisions)

    fred_key = (os.environ.get("FRED_API_KEY") or "").strip()
    if fred_key:
        print(f"Fetching Fed from FRED ({args.fred_series}) …")
        fed_daily = build_fed_daily_from_fred(idx, fred_key, args.fred_series)
    else:
        print(
            "WARN: FRED_API_KEY not set — using hardcoded Fed ladder. "
            "Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html"
        )
        fed_daily = expand_step_rates(idx, FED_STEPS)

    print("Building price-action sentiment …")
    sent = price_action_sentiment(prices["audusd_close"])

    data_dir = repo / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    comm_path = data_dir / "commodities.csv"
    rates_path = data_dir / "rates.csv"
    sent_path = data_dir / "sentiment.csv"

    pd.DataFrame({"date": idx.strftime("%Y-%m-%d"), "gold_close": gold.values}).to_csv(
        comm_path, index=False
    )
    pd.DataFrame(
        {
            "date": idx.strftime("%Y-%m-%d"),
            "rba_rate": rba_daily.values,
            "fed_rate": fed_daily.values,
        }
    ).to_csv(rates_path, index=False)
    pd.DataFrame(
        {"date": idx.strftime("%Y-%m-%d"), "sentiment_score": sent.values}
    ).to_csv(sent_path, index=False)

    print(f"Wrote {comm_path}")
    print(f"Wrote {rates_path}")
    print(f"Wrote {sent_path}")
    print(
        "Done. Next: npm run join:daily -- --trends data/trends.csv "
        "--sentiment data/sentiment.csv --out data/audusd_merged.csv"
    )
    print("Then: python aud_strategy/run.py && npm run trial")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
