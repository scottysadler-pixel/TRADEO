# Automated News-Driven Trading Signals

This repo now fetches **real Australian economic news** daily and scores it with sentiment analysis. Your Trade1 dashboard on GitHub Pages updates automatically every morning with fresh signals.

## How it works

### Data sources (all free, no signups)

1. **GDELT Doc API** ([gdeltproject.org](https://www.gdeltproject.org/)): Searches global news for AUD/Australia/RBA keywords. Returns headlines from the last 7 days. No rate limits for reasonable use.

2. **RSS Feeds** (backup): ABC News Australia economics feed and RBA speeches feed. Parsed via Python's `xml.etree` (no dependencies beyond `requests`).

3. **VADER Sentiment** (`vaderSentiment` Python package): Rule-based sentiment analysis. Fast, accurate for short texts, no model download required. Scores each headline from -1 (bearish) to +1 (bullish).

### Output

`data/sentiment.csv` with columns `date, sentiment_score`. One row per trading day (aligned to `data/prices.csv`). Days with no news use the most recent sentiment (forward-fill).

### Automation

`.github/workflows/daily-refresh.yml` runs every day at 8 PM UTC (6–7 AM Sydney):

1. Fetches news: `python aud_strategy/scripts/fetch_news_gdelt.py`
2. Fetches gold and rates: `python aud_strategy/scripts/fetch_real_data.py`
3. Merges CSVs: `npm run join:daily`
4. Runs Python backtest: `python aud_strategy/run.py --simple`
5. Builds dashboard: `npm run trial`
6. Commits updated files and deploys to GitHub Pages.

**Result:** Open your Pages URL on your iPad/phone any time and see today's signal based on real news from the last 7 days.

## Manual run (optional)

From repo root:

```powershell
python aud_strategy/scripts/fetch_news_gdelt.py
python aud_strategy/scripts/fetch_real_data.py  # needs FRED_API_KEY in .env
npm run join:daily -- --trends data/trends.csv --sentiment data/sentiment.csv --out data/audusd_merged.csv
python aud_strategy/run.py --simple
npm run trial -- --no-gemini-fetch --no-gemini-brief
```

Or use the double-click shortcut: **`Refresh Trade1 Data.cmd`** in the project folder.

## Examples

Recent headlines (2026-04-16):

```
2026-04-15: Australian refinery fire disrupts fuel supply (VADER: -0.64)
2026-04-15: RBA holds cash rate at 4.10% as inflation moderates (VADER: +0.21)
2026-04-14: Gold surges past $2,400 on Fed uncertainty (VADER: +0.58)
```

Average daily sentiment: `(−0.64 + 0.21 + 0.58) / 3 = +0.05` → neutral/slight bullish.

If gold is up 20-day and rates are AUD-favourable, **all three green lights** = LONG signal.

## Why VADER instead of FinBERT?

**VADER** is fast, free, and accurate for short texts. **FinBERT** (transformer model) is more sophisticated but requires `torch` + `transformers` (1GB+ download) and GPU for fast scoring. VADER is ideal for daily automation in CI (GitHub Actions has no GPU). You can switch to FinBERT locally if you want — see `aud_strategy/scripts/score_sentiment.py` for the FinBERT implementation.

## Fallback behavior

- If GDELT returns no results (rare), the script fetches RSS feeds.
- If both fail (internet outage), the script writes neutral sentiment (0.0) for all days so the backtest doesn't break.
- If FRED API fails, `fetch_real_data.py` falls back to hardcoded Fed rate steps.

**The system never stops due to missing data.**

## Privacy / compliance

- GDELT and RSS feeds are public news, no authentication.
- VADER scoring runs locally (no cloud API).
- GitHub Actions logs show headlines in plaintext (repo admins can see them). If you want private logs, fork the workflow and write sentiment to an encrypted artifact.

## Future enhancements

- Add more RSS feeds (Bloomberg AU, Financial Review, etc.).
- Add keyword filtering (exclude sports, entertainment).
- Add entity recognition (target only AUD/RBA/Treasury mentions).
- Fetch Twitter/X sentiment via official API (requires paid tier for historical search).

---

Built 2026-04-16. VADER citation: Hutto & Gilbert (2014), "VADER: A Parsimonious Rule-based Model for Sentiment Analysis of Social Media Text." FinBERT citation: Araci (2019), "FinBERT: Financial Sentiment Analysis with Pre-trained Language Models."
