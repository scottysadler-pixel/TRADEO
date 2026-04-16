# AUD/USD “Three green lights” strategy (Python)

**Trade app (static UI, Chameleon + Catchup):** see [`docs/USER_GUIDE.md`](../docs/USER_GUIDE.md) in the repo root.

Hypothesis-driven, **non-curve-fit** rule set:

1. **Rate differential** (RBA − Fed): carry / relative policy stance.
2. **Commodity momentum** (~20 trading days): AUD as commodity proxy.
3. **News sentiment** (FinBERT daily score): narrative / risk appetite.

**LONG** only if all three are bullish; **SHORT** only if all three are bearish; **FLAT** otherwise.

## Real data (recommended)

Before backtesting, refresh **gold**, **RBA/Fed rates**, and **news sentiment** aligned to `data/prices.csv`.

### News sentiment (GDELT + VADER — free, no keys)

The repo now fetches **real Australian economic news** daily:

```bash
python aud_strategy/scripts/fetch_news_gdelt.py
```

This uses:
- **GDELT Doc API** (no signup): searches for AUD/Australia/RBA headlines from the last 7 days.
- **RSS feeds** (ABC News, RBA speeches) as backup if GDELT fails.
- **VADER sentiment** (rule-based, already in `scripts/requirements.txt`) to score each headline.

Output: `data/sentiment.csv` (one score per trading day, forward-filled when no news).

**Automatic via GitHub Actions:** `.github/workflows/daily-refresh.yml` runs this script every morning (6 AM Sydney) + fetches gold/rates + runs the backtest + deploys the dashboard to GitHub Pages. Zero manual steps on your end.

### FRED API key (Fed funds — free)

1. Open [FRED API Keys](https://fredaccount.stlouisfed.org/apikeys) and sign in (or create a free St. Louis Fed account).
2. **Request API Key** and copy the key.
3. Put the key in the **repo root** file `.env` as `FRED_API_KEY=...` (that file is gitignored). The fetch script loads it automatically via `python-dotenv`.  
   Or set it in the shell: **PowerShell** `$env:FRED_API_KEY="..."` / **cmd** `set FRED_API_KEY=...` (shell wins over `.env`).

With the key set, `fetch_real_data.py` downloads the daily **effective federal funds rate** (`DFF` by default). Without the key, it falls back to a hardcoded step ladder.

Optional: `--fred-series DFEDTARU` for the **upper** bound of the FOMC target range instead of `DFF`.

**One command** (from repo root, after `.env` has `FRED_API_KEY`):

```bash
npm run refresh:data
```

First time or after dependency changes (runs `pip install` then the same pipeline):

```bash
npm run refresh:all
```

Manual steps (equivalent to `refresh:data`):

```bash
pip install -r aud_strategy/requirements.txt
python aud_strategy/scripts/fetch_real_data.py
npm run join:daily -- --trends data/trends.csv --sentiment data/sentiment.csv --out data/audusd_merged.csv
python aud_strategy/run.py
```

## Quick start

From the **Trade1 repo root** (parent of `aud_strategy/`):

```bash
pip install -r aud_strategy/requirements.txt
python aud_strategy/run.py
```

Outputs land in `output/`:

- `py_strategy_summary.json` — metrics, trades, daily preview (for the HTML dashboard)
- `py_strategy_trades.csv`, `py_strategy_equity_curve.csv`, `py_strategy_summary.txt`

## Data files (`data/`)

| File | Columns |
|------|---------|
| `prices.csv` | `date`, `audusd_close` |
| `commodities.csv` | `date`, `gold_close` (optional `iron_ore_close`) |
| `rates.csv` | `date`, `rba_rate`, `fed_rate` (meeting dates OK; loader forward-fills) |
| `sentiment.csv` | `date`, `sentiment_score` |

If `commodities.csv` or `rates.csv` are **missing**, `run.py` creates **demo-aligned** files from `prices.csv` so the pipeline runs. **Replace them with real data** for research.

Regenerate aligned stubs without Python running the full backtest:

```bash
node scripts/build-seed-csvs.mjs
```

## FinBERT sentiment (`data/sentiment.csv`)

Optional heavy install:

```bash
pip install -r aud_strategy/requirements-finbert.txt
python aud_strategy/scripts/score_sentiment.py --headlines data/headlines.csv --out data/sentiment.csv
```

`headlines.csv`: `date`, `headline` (multiple rows per day allowed).

## Walk-forward vs simple

- **Walk-forward** (default): `train_window=500` warmup rows (no trades), then `test_window=90` out-of-sample steps, sliding by90. Needs enough history; short samples fall back to a note in the summary.
- **Simple**: full-history backtest after signal warmup (`--simple`).

## Live signal

```bash
python aud_strategy/run.py --live
```

Prints the latest row’s combined signal and component signs.

## Integration with Trade1 dashboard

Run the Python backtest, then `npm run trial`. The dashboard embeds `output/py_strategy_summary.json` when present.
