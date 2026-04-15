# Operator guide — run, fix, schedule

This repo backtests **daily FX + Google Trends + sentiment** with many strategy presets. You operate it from the command line on Windows (PowerShell). No server is required unless you add one later.

## Easiest path (one command)

From the project folder:

```powershell
npm run go
```

This **automatically**:

1. Downloads ~2 years of **AUD/USD** daily closes (Frankfurter, no API key).
2. Tries **Google Trends** via Python; if that fails, writes **flat synthetic** trends so nothing breaks.
3. Runs **sentiment** via Python (neutral `0.0` if you have no `NEWSAPI_KEY`).
4. **Merges** into `data/audusd_merged.csv`.
5. Runs **`npm run trial`** (all presets, analyst bundle, dashboard, health JSON).
6. Tries to **open** `output/trial_dashboard.html` in your browser.

You do not need to remember file names or step order. For **real** Trends data, install Python and run `pip install -r scripts/requirements.txt` once.

## What runs where

| Action | Network | API keys |
|--------|---------|----------|
| **`npm run go`** | Yes (Frankfurter + optional Trends) | Optional (`NEWSAPI_KEY` for richer sentiment) |
| `npm run trial` | No* | No* |
| `npm run fetch:price` | Yes (data vendor) | Often (e.g. Twelve Data) |
| Python `fetchTrends.py` / `fetchSentiment.py` | Yes | Optional (NewsAPI, etc.) |
| Optional Gemini in trial | Yes | `GEMINI_API_KEY` only if you enable the fetch |

\*Trial does **not** call Google unless **`GEMINI_API_KEY`** is set and you did not pass **`--no-gemini-fetch`**.

### Gemini: static brief vs API

- **`output/gemini_research_brief.md`** — always written when you run trial (unless `--no-gemini-brief`). This is a **prompt for you to paste** into the Gemini **website** (or another chat). **No API, no cost, no automatic answer.**
- **`output/gemini_response.md`** — only if **`GEMINI_API_KEY`** is set in the environment. Trial then **calls** the Gemini API once, appends the model reply here. Quotas and billing are **your** Google Cloud / AI Studio account — check current Google pricing. If the call fails, the file still contains an error note (fail-soft).

## Manual steps (if you prefer not to use `npm run go`)

1. **Price**: `npm run fetch:price` → `data/prices.csv` ([`scripts/fetchPrice.ts`](../scripts/fetchPrice.ts)).
2. **Trends / sentiment** (Python): `scripts/fetchTrends.py`, `scripts/fetchSentiment.py`, or manual CSVs.
3. **Join**: `npm run join:daily -- --trends data/trends.csv --sentiment data/sentiment.csv --out data/audusd_merged.csv`
4. **Trial**: `npm run trial` (reads merged CSV if present).
5. **Open**: `npm run open:dashboard` / `npm run open:chart`, or open HTML files from `output/`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | If set, trial may call Gemini API (see above). Never commit this key. |
| `GEMINI_MODEL` | Optional. Default: `gemini-2.0-flash` (change if Google renames models). |
| `FX_PAIR_ID` | Optional label for non–AUD/USD CSVs (e.g. `EURUSD`). See multi-pair below. |

## Multi-pair CSV (`fx_close`)

- **Legacy column:** `audusd_close` (still supported).
- **Generic column:** `fx_close` — same meaning: **one daily close in rate units** for whatever pair you merged. Use **one column name per file**, not both.
- Optional CSV column **`pair_id`** (e.g. `EURUSD`) or set **`FX_PAIR_ID`** so exports (`data_health.json`, dashboard) show the pair. **Backtests do not model spreads or slippage**; thin/exotic pairs are proportionally harder to trade in reality.

`joinDaily` **`prices.csv`** may use **`date, audusd_close`** or **`date, fx_close`**.

## Outputs (after `npm run trial`)

| File | Role |
|------|------|
| `output/variant_comparison.csv` | Metrics per preset |
| `output/variant_equity_chart.html` | Chart.js equity curves |
| `output/trial_dashboard.html` | Simple operator landing page |
| `output/analyst_bundle.json` | Full analyst export (dream scenarios, optional regime split) |
| `output/analyst_for_llm.md` | Markdown companion for other models |
| `output/gemini_research_brief.md` | Paste into Gemini **web** (optional) |
| `output/gemini_response.md` | Only if API key set — model reply or error |
| `output/data_health.json` | Row counts, dates, `%` rows with `trends_wow`, warnings |

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `missing column "audusd_close"` | Merged CSV uses only `fx_close` | Add `fx_close` column (no `audusd_close`) — loader accepts either |
| `Missing trends or sentiment on or before DATE` | Join gap | Extend trends/sentiment CSVs earlier so they cover first price date |
| `invalid number in column` | Bad CSV cell | Fix row in source CSV; no silent coercion |
| Trial runs but `regimeSplit.lowSampleWarning` | Short history | Prefer ≥60 rows per half; collect more daily data |
| `gemini_response.md` shows API error | Quota, key, or model name | Check key, billing, `GEMINI_MODEL`; trial still finishes without crashing |
| Chart does not open in Cursor | Editor limitation | Use browser: `npm run open:chart` or double-click the HTML file |

## Schedule regular runs (Windows Task Scheduler)

Example **weekly** refresh (adjust paths to your clone):

1. Open **Task Scheduler** → **Create Task**.
2. **Triggers:** Weekly, day/time of your choice.
3. **Actions:** Start a program   - **Program:** `powershell.exe`  
   - **Arguments:** `-NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\Users\Scotty\Trade1'; npm run fetch:price; npm run join:daily -- --trends data\trends.csv --sentiment data\sentiment.csv; npm run trial"`  
   (Omit `fetch:price` / `join:daily` if you only refresh CSVs manually.)
4. **Conditions:** Uncheck “Start only on AC power” if on a laptop and you want battery runs.

Use a dedicated log: append `*>> C:\Users\Scotty\Trade1\output\scheduler.log` inside the command if desired.

## Where to read next

- Research angles and presets: [`docs/TRIAL_PLAYBOOK.md`](TRIAL_PLAYBOOK.md)
- Loader column contract: [`src/data/csvLoader.ts`](../src/data/csvLoader.ts)
