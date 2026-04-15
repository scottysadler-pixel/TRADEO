# Analyst export (for a second AI)

Paste **this file** plus **`output/analyst_bundle.json`** into another model. Ask it to critique overfitting, pre/post stability, and dream-scenario multiple testing.

## Brief

```
AUD/USD alt-data analyst bundle v4.
Rows=510, dates 2024-04-15..2026-04-14, span~729d.
Buy-hold PnL (rate)=0.06408.
Sentiment std=0.0000; 100% rows have trends_wow.
Exploratory Pearson: sentiment vs fwd1d=n/a, fwd5d=n/a, fwd10d=n/a; wow vs fwd5d=n/a (NOT causal).
Unconventional: panicAttentionDays=0, regimeWildShare=24.6%.
Dream scenarios: ghostAttention days=128; strength+coolSearch count=0; priceShock days=53.
Rolling leaders: 60d→n/a, 120d→n/a, 252d→n/a. Stability: Same best-Sharpe leader across all rolling windows shown (still not causal).
Regime split @ 2025-04-11 (auto_mid_row): sameSignSharpe 0/9 (flip=0, unknown=9).
Best Sharpe (full sample, finite): none finite.
Ask the receiving model: multiple-testing risk, whether pre/post stability matters for your favorite preset, and one falsifiable next experiment.
```

## Variant table (full sample)

| id | label | totalPnl | trades | sharpe | maxDD | winRate |
|---|------|---------:|-------:|-------:|------:|--------:|
| mainstreamTriple | Mainstream triple-lock | 0.00000 | 0 | — | 0.00000 | 0% |
| slowConviction | Slow conviction | 0.00000 | 0 | — | 0.00000 | 0% |
| attentionBurst | Attention burst only | 0.00000 | 0 | — | 0.00000 | 0% |
| quietUptrend | Quiet uptrend / loud downtrend | 0.00000 | 0 | — | 0.00000 | 0% |
| contrarianMood | Contrarian mood | 0.00000 | 0 | — | 0.00000 | 0% |
| yesterdayHeadlines | Yesterday’s headlines | 0.00000 | 0 | — | 0.00000 | 0% |
| fadeSearchMania | Fade search mania (anti-hype) | 0.00000 | 0 | — | 0.00000 | 0% |
| iceAgeHeadlines | Ice-age headlines (5d lag) | 0.00000 | 0 | — | 0.00000 | 0% |
| mediaReversalLite | Media-reversal lite (no Trends gate) | 0.00000 | 0 | — | 0.00000 | 0% |

## Data fingerprint

```json
{
  "rowCount": 510,
  "firstDate": "2024-04-15",
  "lastDate": "2026-04-14",
  "spanCalendarDays": 729,
  "audusdCloseMin": 0.60057,
  "audusdCloseMax": 0.7151,
  "sentimentMin": 0,
  "sentimentMax": 0,
  "sentimentStd": 0,
  "trendsIndexMin": 50,
  "trendsIndexMax": 50,
  "pctRowsWithTrendsWow": 100
}
```

## Exploratory correlations (not advice)

```json
{
  "sentiment_vs_fwdReturn1d": null,
  "sentiment_vs_fwdReturn5d": null,
  "sentiment_vs_fwdReturn10d": null,
  "trends_wow_vs_fwdReturn5d": null
}
```

## Unconventional diagnostics

```json
{
  "panicAttentionDays": 0,
  "regimeWildShare": 0.2455795677799607,
  "meanAbsRet1dWhenSentimentExtreme": 0.0028236542239685634,
  "meanAbsRet1dWhenSentimentMiddle": null
}
```

## Dream scenarios (hypothesis prompts only)

```json
{
  "ghostAttention": {
    "count": 128,
    "meanFwdRet1d": 0.00012984374999999541,
    "meanFwdRet5d": 0.00048789062499999484,
    "note": "Adaptive: |WoW| in top quartile AND |1d return| in bottom quartile vs series."
  },
  "strengthWhileSearchCools": {
    "count": 0,
    "meanFwdRet10d": null,
    "note": "5d price up, same-day WoW < 0; fwd = 10d close-to-close."
  },
  "weaknessWhileSearchHeats": {
    "count": 0,
    "meanFwdRet10d": null,
    "note": "5d price down, same-day WoW > 0."
  },
  "afterSentimentVeryCold": {
    "threshold": -0.28,
    "events": 0,
    "meanFwdRet1d": null,
    "meanFwdRet5d": null,
    "note": "Event-time average after sentiment < threshold (overlapping windows possible)."
  },
  "afterSentimentVeryHot": {
    "threshold": 0.28,
    "events": 0,
    "meanFwdRet1d": null,
    "meanFwdRet5d": null,
    "note": "Symmetrical hot-headline bar."
  },
  "weekdayMeanRet1d": {
    "Sun": null,
    "Mon": 0.00040725490196078017,
    "Tue": 0.00009685714285714297,
    "Wed": 0.0005399999999999982,
    "Thu": 0.00004669999999999952,
    "Fri": -0.0004637623762376182,
    "Sat": null
  },
  "sentimentVolRegime": {
    "highChaosDays": 0,
    "meanAbsRet1dOnHighChaos": null,
    "meanAbsRet1dOnCalm": null,
    "note": "20d rolling std(sentiment): high = >=80th pct of rolling stds; calm = <50% of cut."
  },
  "trendsIndexLevelVsNextAbsMove": null,
  "priceShockDays": {
    "thresholdNote": "|1d return| >= 90th percentile of |1d returns| in sample",
    "count": 53,
    "meanFwdRet1d": 0.00040961538461538436,
    "meanFwdRet5d": 0.0018472549019607804,
    "meanFwdRet10d": 0.004427083333333336,
    "shareWithSentimentExtreme": 1,
    "shareWithTrendsWowExtreme": 0,
    "note": "Exploratory only; overlapping events; not a trading rule."
  }
}
```

## Rolling windows (recent rows only)

| window | rows | buyHold | bestSharpe preset | sharpe |
|---:|---:|---:|---|---:|
| 60 | 60 | 0.04154 | — | — |
| 120 | 120 | 0.06360 | — | — |
| 252 | 252 | 0.07487 | — | — |

Full tables: see `analyst_bundle.json` → `rollingSnapshots`.

## Rolling stability (cross-window)

```json
{
  "windowCount": 3,
  "bestSharpeLeadersByWindow": [
    {
      "windowDays": 60,
      "presetId": null
    },
    {
      "windowDays": 120,
      "presetId": null
    },
    {
      "windowDays": 252,
      "presetId": null
    }
  ],
  "bestSharpeLeaderChangesAcrossWindows": false,
  "presetsPositivePnlAllWindows": [],
  "presetsPositiveSharpeAllWindows": [],
  "positiveSharpeWindowCountByPreset": {
    "attentionBurst": 0,
    "contrarianMood": 0,
    "fadeSearchMania": 0,
    "iceAgeHeadlines": 0,
    "mainstreamTriple": 0,
    "mediaReversalLite": 0,
    "quietUptrend": 0,
    "slowConviction": 0,
    "yesterdayHeadlines": 0
  },
  "positivePnlWindowCountByPreset": {
    "attentionBurst": 0,
    "contrarianMood": 0,
    "fadeSearchMania": 0,
    "iceAgeHeadlines": 0,
    "mainstreamTriple": 0,
    "mediaReversalLite": 0,
    "quietUptrend": 0,
    "slowConviction": 0,
    "yesterdayHeadlines": 0
  },
  "mostStableSharpePresetId": null,
  "mostStableSharpeDispersion": null,
  "note": "Same best-Sharpe leader across all rolling windows shown (still not causal)."
}
```

## Regime split (pre vs post)

Split date: **2025-04-11** (auto_mid_row)

### Pre-split variant table

```json
[
  {
    "id": "mainstreamTriple",
    "label": "Mainstream triple-lock",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "slowConviction",
    "label": "Slow conviction",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "attentionBurst",
    "label": "Attention burst only",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "quietUptrend",
    "label": "Quiet uptrend / loud downtrend",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "contrarianMood",
    "label": "Contrarian mood",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "yesterdayHeadlines",
    "label": "Yesterday’s headlines",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "fadeSearchMania",
    "label": "Fade search mania (anti-hype)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "iceAgeHeadlines",
    "label": "Ice-age headlines (5d lag)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  },
  {
    "id": "mediaReversalLite",
    "label": "Media-reversal lite (no Trends gate)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": -0.02921000000000007
  }
]
```

### Post-split variant table

```json
[
  {
    "id": "mainstreamTriple",
    "label": "Mainstream triple-lock",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "slowConviction",
    "label": "Slow conviction",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "attentionBurst",
    "label": "Attention burst only",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "quietUptrend",
    "label": "Quiet uptrend / loud downtrend",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "contrarianMood",
    "label": "Contrarian mood",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "yesterdayHeadlines",
    "label": "Yesterday’s headlines",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "fadeSearchMania",
    "label": "Fade search mania (anti-hype)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "iceAgeHeadlines",
    "label": "Ice-age headlines (5d lag)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  },
  {
    "id": "mediaReversalLite",
    "label": "Media-reversal lite (no Trends gate)",
    "totalPnl": 0,
    "trades": 0,
    "sharpeAnnualized": null,
    "maxDrawdown": 0,
    "profitFactor": 0,
    "winRate": 0,
    "buyHoldPnl": 0.08884999999999998
  }
]
```

### Sharpe stability (same preset, two eras)

```json
[
  {
    "presetId": "mainstreamTriple",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "slowConviction",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "attentionBurst",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "quietUptrend",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "contrarianMood",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "yesterdayHeadlines",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "fadeSearchMania",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "iceAgeHeadlines",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  },
  {
    "presetId": "mediaReversalLite",
    "sharpePre": null,
    "sharpePost": null,
    "sharpeSameSign": null,
    "totalPnlPre": 0,
    "totalPnlPost": 0
  }
]
```

## Tail daily panel (last rows)

See `analyst_bundle.json` → `tailDailyPanel` for structured rows.