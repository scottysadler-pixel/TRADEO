# Trade1

A self-contained, iPad-friendly learning app for **AUD/USD** trading.
Live market data, two research-backed signal strategies, a backtest sandbox,
a trade journal, and a connectivity health check — all in one page.

**Live app:** https://tradeo.vercel.app

No installs, no Python, no CSVs, no broker account. Everything runs in the
browser, pulling daily data through four Vercel serverless proxies.

---

## What it does

| Tab | What you can do |
|---|---|
| **Now** | See today's AUD/USD, gold, and rates with a Chameleon (trend) and Catchup (mean-reversion) signal. Tap "Explain" on any card to learn how the signal is built. |
| **Compare** | Overlay AUD/USD and gold to see how the two commodity-linked assets move together — or don't. |
| **News** | Recent AUD-relevant headlines from GDELT, filtered by topic (RBA, Fed, gold, risk-off). |
| **Sandbox** | Replay either strategy over a historical window, with an equity curve, win rate, max drawdown and trade list. Save runs locally or export to Files / Google Drive. |
| **Journal** | Keep a trade journal in the browser. Export to JSON or CSV. |
| **Learn** | Collapsible explanations of every concept: strategies, indicators, risk, glossary, what-can-go-wrong. |
| **Health** | One-tap connectivity check of all four data sources with a 0–6 readiness score. |

---

## What's under the hood

```
standalone/
├── index.html / trade.html     ← the whole app (same file, two names)
├── app-icon.svg                ← PWA icon for "Add to Home Screen"
├── manifest.webmanifest        ← PWA manifest
├── vercel.json                 ← Vercel static + function config
└── api/
    ├── fx.js      ← AUD/USD daily history via Frankfurter (ECB)
    ├── gold.js    ← Gold (GC=F) daily history via Yahoo Finance
    ├── news.js    ← English headlines via GDELT Doc API
    └── rates.js   ← Hand-maintained RBA + Fed policy rates
```

All four API functions run on **Vercel Edge Runtime** and use Web Request/Response.
They're free, no-key, and cached at the edge so a handful of users don't cost anything.

---

## Using it

**On an iPad (recommended).** Open https://tradeo.vercel.app in Safari, tap the
Share button → **Add to Home Screen**. It opens full-screen like a native app.
Exports from Sandbox and Journal save to **Files** or Google Drive.

**On desktop.** Just visit the URL.

**Offline.** The HTML is PWA-shaped and works offline for the Learn and Journal
tabs, but live feeds need internet.

See [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) for the full walkthrough.

---

## Updating the RBA / Fed rates

The rates pill is **hand-maintained** because central-bank policy rates change
infrequently and no free no-key API publishes them reliably. When they change:

1. Edit `standalone/api/rates.js` — update `rate`, `last_change`, and `as_of`.
2. `git commit` and `git push`. Vercel redeploys automatically.

The Learn tab and the Rates pill on the Now tab always make this limitation
visible to the reader.

---

## Development

To run the app locally (including the API proxies), install the Vercel CLI and:

```bash
cd standalone
vercel dev
```

Then open http://localhost:3000. Hot-reload works for both the HTML and the
serverless functions.

There is no build step. No bundler, no framework, no dependencies at runtime.

---

## Disclaimer

Educational only. Not financial advice. Daily data, not intraday —
this is a learning pad, not a trading terminal. Use a demo account.
