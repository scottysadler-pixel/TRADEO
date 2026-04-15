# Trial playbook — non‑norm angles & how to test them

This project is built for **paper trials**: same data, many rule sets, one chart. You do **not** need extra Cursor permissions. Optional: **NewsAPI** key, **Python** + `scripts/requirements.txt` for Trends/sentiment automation.

## One command (simplest)

```bash
npm run trial
```

Uses **`data/audusd_merged.csv`** if it exists, otherwise **`data/audusd_example.csv`**. Writes:

- `output/variant_comparison.csv` — table of all presets  
- `output/variant_equity_chart.html` — open in browser (`npm run open:chart` on Windows)  
- **`output/analyst_bundle.json`** — structured metrics + tail panel + exploratory stats (**upload this + the markdown file to another AI**)  
- **`output/analyst_for_llm.md`** — short prompt + tables for that second model  

Optional: **`npm run trial -- --verify`** runs build + tests first.

## Weekly rhythm (lightweight)

| When | Do |
|------|-----|
| After you refresh data | `npm run verify` or `npm run trial -- --verify` |
| Any time | **`npm run trial`** (or `npm run compare:variants -- --file data/audusd_merged.csv` + `npm run open:chart`) |
| Monthly | Re‑run with a new **split date** (`node dist/index.js --file ... --split-date YYYY-MM-DD`) so you always see **out‑of‑sample** half |
| Paper log | `npm run daily:check -- --preset <id>` (updates `data/daily_log.csv`) |

## What’s already coded (presets)

Run `npm run compare:variants -- --list` for IDs. Highlights:

- **mainstreamTriple** — reference only (three signals agree).
- **quietUptrend** — attention *cooling* in an uptrend (not “buy the hype”).
- **contrarianMood** — needs “wrong” sentiment vs trend+attention.
- **mediaReversalLite** — **drops Google Trends**; only **trend MA + extreme sentiment**, loosely motivated by FX media **reversal** evidence (Filippou, Taylor & Wang, 2024).
- **yesterdayHeadlines** — sentiment lagged 1 day (lookahead hygiene).

## Research angles you can **approximate** without new code (data / keywords only)

1. **Attention → reversal (stocks, keyword‑dependent)**  
   High Google search volume sometimes precedes **weak or negative** subsequent returns (e.g. Bijl et al., *International Review of Financial Analysis*, 2016 — company names / GSV; results vary by sample).  
   **Trial:** run **iron ore** vs **AUD USD** vs **debt**‑style macro fear terms as separate `fetchTrends` pulls; compare variant charts **side by side** (keyword sweep folder).

2. **FX + media sentiment reversals**  
   [Filippou, Taylor & Wang (2024), *Journal of Financial and Quantitative Analysis* — “Media Sentiment and Currency Reversals”](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/media-sentiment-and-currency-reversals/84CEB4F2EEE1521C3C694F547AC35A0B)  
   **Trial:** use **mediaReversalLite** preset + your best daily sentiment series; compare to **mainstreamTriple** on the same CSV.

3. **Attention conditional on term “sentiment” (econometrics)**  
   Huang et al. (*Empirical Economics*, 2020) — Trends signals depend on **which** terms you track.  
   **Trial:** never rely on one keyword; keep a **short list** (5–12) and rank them with `npm run sweep:keywords`.

4. **Under‑researched but cheap: timing hygiene**  
   Lag sentiment (`yesterdayHeadlines`), lag Trends (re‑export weekly and forward‑fill), **exclude** RBA day 0 if you add a `event` column later.  
   **Trial:** add a column in CSV later; for now use **split‑date** so you never tune on the same window you judge.

## Angles worth a **future** code tick (say the word)

| Idea | Why it’s non‑norm |
|------|-------------------|
| **Trends lag 1w** | Signal uses *last week’s* Trends only (stricter no‑peek). |
| **Dual sentiment** | RBA‑only score vs commodity score; trade only when they **disagree** then resolve with price. |
| **Volatility gate** | Trade only when 20d realized vol in top/bottom tercile (needs vol column or derive from returns). |
| **“Panic” composite** | Long when *both* sentiment and Trends spike **down** together (capitulation) — opposite of triple‑agree long. |

## Permissions / keys (optional)

- **NEWSAPI_KEY** — richer sentiment on recent days (`fetchSentiment.py`).  
- **GitHub** — version control only; not required to run trials.  
- No special Cursor permission is required for research links or local backtests.

## Success criteria (realistic)

- **Not:** “beat the market every month.”  
- **Yes:** one or two presets with **stable** relative behaviour vs buy‑and‑hold across **multiple** out‑of‑sample windows; **fewer** giant drawdowns than a naive triple‑momentum toy; daily log roughly matches backtest direction **most** weeks.

When you have 2–3 months of `daily_log.csv` + refreshed merges, you can decide whether any line in the chart deserves a **tiny** live size — still your call.
