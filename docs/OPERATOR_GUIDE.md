# Operator guide — CLI, trial, and automation

**End-user manual (Trade app, data checks, Vercel):** [`USER_GUIDE.md`](USER_GUIDE.md)

This page is for **developers and operators** running the TypeScript pipeline, Python backtester, and optional GitHub Actions.

---

## One-command pipeline

```powershell
npm run go
```

Downloads AUD/USD (Frankfurter), Trends + sentiment (Python, with fallbacks), merges to `data/audusd_merged.csv`, runs **`npm run trial`**, opens `output/trial_dashboard.html`.

---

## Trade app JSON (Chameleon / Catchup)

The static Trade app reads **`standalone/chameleon_data.json`** and **`standalone/catchup_data.json`**.

Refresh after updating `data/*.csv`:

```powershell
python scripts/update_chameleon.py
python scripts/update_catchup.py
```

Or `npm run refresh:apps` (same thing; expects CSVs already exist).

**Important:** `npm run trial` publishes the **analyst** HTML to **`standalone/trial_dashboard.html`** only. It **does not** overwrite **`standalone/index.html`** (Trade app entry).

---

## Trial only (presets, charts, replay)

```powershell
npm run trial
```

Uses **`data/audusd_merged.csv`** if present, else **`data/audusd_example.csv`**. Writes outputs under **`output/`** and refreshes **`standalone/trial_dashboard.html`** plus copied artifacts (bundle JSON, replay, etc.).

---

## Manual pipeline steps

1. **Price:** `npm run fetch:price` → `data/prices.csv`
2. **Trends / sentiment:** Python `scripts/fetchTrends.py`, `scripts/fetchSentiment.py`, or hand-built CSVs
3. **Join:**  
   `npm run join:daily -- --trends data/trends.csv --sentiment data/sentiment.csv --out data/audusd_merged.csv`
4. **Trial:** `npm run trial`
5. **Python strategy (optional):** `python aud_strategy/run.py` — see [`aud_strategy/README.md`](../aud_strategy/README.md)
6. **Refresh Trade app JSON:** `npm run refresh:apps`

Full refresh (Python real data + merge + backtest + trial): **`npm run refresh:data`** (see `package.json`).

---

## GitHub Actions (optional)

| Workflow | Role |
|----------|------|
| **`pages.yml`** | Build `standalone/` and deploy **GitHub Pages** (if enabled). May run fetches + trial; check logs if it fails. |
| **`daily-refresh.yml`** | Scheduled refresh + commit + Pages (if you use it). Requires secrets such as **`FRED_API_KEY`** for full Fed data. |

CI is **not required** to use the Trade app locally or on Vercel.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `FRED_API_KEY` | Fed series in `fetch_real_data.py` (local `.env` or GitHub secret) |
| `GEMINI_API_KEY` | Optional Gemini call inside `npm run trial` |
| `NEWSAPI_KEY` | Optional richer sentiment in legacy Python scripts |

---

## Outputs (after `npm run trial`)

| File | Role |
|------|------|
| `output/trial_dashboard.html` | Full analyst dashboard |
| `output/variant_comparison.csv` | Metrics per preset |
| `output/variant_equity_chart.html` | Equity chart |
| `standalone/trial_dashboard.html` | Copy of analyst dashboard for static hosting |
| `standalone/index.html` / `trade.html` | **Trade app** — maintain in git; not overwritten by trial |

See table in [`USER_GUIDE.md`](USER_GUIDE.md) for the Trade app vs analyst split.

---

## Health and verify

```powershell
npm run doctor
npm run verify
```

---

## Windows scheduling and .cmd launchers

See [`RUN_WITHOUT_CURSOR.md`](RUN_WITHOUT_CURSOR.md).

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `ENOENT trends.csv` on join | Missing `data/trends.csv` | Run `npm run go` or `python scripts/fetchTrends.py`, or add CSV |
| `missing column "audusd_close"` | Merged CSV uses `fx_close` only | Use one column per file per loader rules |
| Trial OK but Trade app stale | JSON not regenerated | Run `npm run refresh:apps` after price/commodity updates |
| Pages shows wrong home page | Old `index.html` on branch | Ensure Trade app is committed as `standalone/index.html` |

---

## Code references

- CSV loader: [`src/data/csvLoader.ts`](../src/data/csvLoader.ts)
- Standalone publish: [`src/analyst/standaloneSite.ts`](../src/analyst/standaloneSite.ts)
