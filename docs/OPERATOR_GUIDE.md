# Operator guide — run, fix, schedule

This repo backtests **daily FX + Google Trends + sentiment** with many strategy presets. You operate it from the command line on Windows (PowerShell). No server is required unless you add one later.

**No Cursor needed:** double-click **`Refresh Trade1 Data.cmd`** in the project folder (full data + Python + dashboard), or schedule it — see [`docs/RUN_WITHOUT_CURSOR.md`](RUN_WITHOUT_CURSOR.md).

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

Optional **`config/pairs.json`** lists FX pairs: the first entry is the **primary** (full Trends + sentiment pipeline); extra pairs get Frankfurter prices plus **synthetic** Trends/sentiment for **ranking only** (`data/merged_<PAIR>.csv`). The dashboard shows a pair table after `npm run go` when more than one pair is configured.

### Health check

```powershell
npm run doctor
```

Checks Python, `pytrends`, `NEWSAPI_KEY` / `GEMINI_API_KEY`, required CSVs, and whether `output/` has a recent trial (`<72h`). Fix any `WARN` lines, then run `npm run verify` or `npm run go`.

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
| `output/trial_dashboard.html` | Operator landing page (**Start here** beginner block: current lean, why, paper what-if, trust/caution), **historical replay** (date picker: as-of lean with no future leakage; 1d/5d/10d paper outcomes; illustrative notionals), trust signals, top presets, plain-English summary, optional pair ranking |
| `output/replay_data.json` | Precomputed replay rows (same logic as the dashboard picker). Regenerated on each `npm run trial`. Short CSVs may produce an empty `days` list — the dashboard explains the minimum history. |
| `output/run_status.json` | Machine-readable run metadata (schema v2: trial steps, fallback flags, row counts, merged warnings, top presets, pipeline snapshot when from `npm run go`) |
| `output/plain_english_summary.txt` | Short human-readable “what happened” (same text as dashboard) |
| `output/analyst_bundle.json` | Full analyst export (dream scenarios, rolling windows, optional regime split) |
| `output/analyst_for_llm.md` | Markdown companion for other models |
| `output/gemini_research_brief.md` | Paste into Gemini **web** (optional) |
| `output/gemini_response.md` | Only if API key set — model reply or error |
| `output/data_health.json` | Row counts, dates, `%` rows with `trends_wow`, warnings |
| `output/py_strategy_summary.json` | Optional: **Python** three-signal backtest (rates + commodity momentum + FinBERT-ready sentiment). Run `npm run py:strategy` (or `python aud_strategy/run.py`) after `pip install -r aud_strategy/requirements.txt`, then `npm run trial` so the dashboard shows the **Python strategy** panel. |
| `standalone/index.html` | Standalone static app bundle. Open this file directly on desktop, or host/sync the whole `standalone/` folder for phone/iPad viewing. |

### Python three-signal backtest (`aud_strategy/`)

Separate from the TypeScript preset grid: a **rule-based** AUD/USD read using **RBA−Fed rate diff**, **20-day commodity momentum** (gold; optional iron ore), and **daily sentiment** scores. See [`aud_strategy/README.md`](../aud_strategy/README.md).

**Refresh real data + merged CSV + Python outputs + dashboard in one go:** `npm run refresh:data` (expects repo-root `.env` with `FRED_API_KEY` for FRED; first time or after Python dep changes: `npm run refresh:all`).

For **US Fed funds**, set **`FRED_API_KEY`** in `.env` or the shell (see [FRED API keys](https://fredaccount.stlouisfed.org/apikeys)); without it, the fetch script uses a hardcoded Fed ladder. Optional GitHub Actions: add repo secret `FRED_API_KEY` so Pages builds use FRED too. FinBERT scoring: `aud_strategy/scripts/score_sentiment.py` (heavy deps in `requirements-finbert.txt`).

### Standalone app

- Double-click **`Open Trade1 App.cmd`** on Windows to open the standalone bundle without typing commands.
- Each fresh `trial` run now refreshes the whole **`standalone/`** folder automatically.
- For iPad or phone use, the practical path is to put the **entire `standalone/` folder** somewhere web-reachable or cloud-synced. The app itself stays static; no backend was added.
- GitHub Pages is now prewired via **`.github/workflows/pages.yml`**. After you connect this repo to your real GitHub repository and push `main`, GitHub can publish the standalone app automatically from the generated **`standalone/`** folder.
- Small Pages-friendly extras are generated too: **`standalone/.nojekyll`**, **`standalone/404.html`**, app manifest, and icon.

#### GitHub Pages next steps

1. Point this local repo at your real GitHub repo instead of the placeholder `origin`.
2. Push the `main` branch.
3. In GitHub: **Settings → Pages** and make sure the source is **GitHub Actions**.
4. Wait for the **Deploy Standalone App** workflow to finish.
5. Open the Pages URL on desktop or iPad and optionally **Add to Home Screen** in Safari.

### Historical replay (paper)

After `npm run trial`, open **`output/trial_dashboard.html`** and scroll to **Historical replay (paper)**.

1. Choose an **as-of date** in the picker (only dates covered by the merged CSV and with enough rows for a fair window).
2. Click **Analyze** to see what the system **would have leaned** using **only data through that date** (no look-ahead in the signal or preset choice).
3. Read **What happened next** for **+1 / +5 / +10 trading rows** in the CSV — crude quote-term paper only (not a brokerage record).
4. **Illustrative notionals** (500 / 2,000 / 5,000 base-currency units) use the same simple assumptions as the operator view: no spreads, fees, slippage, or leverage.

Beginner reading:
- **LONG** = the model leaned toward the base currency strengthening.
- **SHORT** = the model leaned toward the base currency weakening.
- **FLAT** = no strong edge; treat it as a wait / observe day.
- **Helped / hurt** = whether that historical lean matched what the market actually did next.

**Trust:** Replay now shows an **as-of trust** read for the selected date: an overall label plus separate **Trends** / **sentiment** notes. These are estimated from the as-of slice and the latest pipeline context when available; exact row-level source metadata is still not stored. The dashboard still shows **% of rows with Trends WoW** in the slice so you can see whether attention columns were thin at that time.

Placeholder lines under the replay block reserve space for future **AU vs NZ** / **RBA vs RBNZ** / **risk-off USD** headline comparisons — not wired in this build.

### Paper trail (`data/daily_log.csv`)

`npx tsx scripts/dailyCheck.ts` appends one line per run with the **signal** (LONG / SHORT / FLAT). By default it now auto-picks the same **leading preset** the dashboard prefers; you can still override with `--preset`. Re-run `npm run trial` afterward: the dashboard’s **Paper “what would have happened”** section reads this file and shows a crude last-step and last-30-transition summary. Numbers are **illustrative only** (no spreads, fees, or broker execution).

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
