# Trade1 — User guide (iPad-friendly live learning pad)

This is a **self-contained web app** for learning about AUD/USD. Open the URL on any device (iPad, phone, laptop) and it fetches real public data and shows you what two simple strategies say today, headlines, a replay sandbox, and a journal. **No CSVs, no Python, no keys required.**

---

## 1. What it does

### Seven tabs

| Tab | What you see |
|---|---|
| **Now** | Live AUD/USD + gold + policy rates, Chameleon signal, Catchup signal, consensus, "Explain this" drop-downs on every card. |
| **Compare** | AUD/USD vs gold chart (normalised to 100), correlation, beta, and a regime-vs-baseline view. |
| **News** | Last 72 hours of AUD-relevant headlines from GDELT, filterable by topic (AUD / RBA / Fed / Gold / Risk-off). |
| **Sandbox** | Replay the fetched history as if you had followed the signals. Save runs, export JSON/CSV to iPad Files / Drive. |
| **Journal** | Log your (demo) trades. Export/import JSON or CSV. |
| **Learn** | Collapsible explanations of every term and every strategy. Start here. |
| **Health** | Live connectivity check of every data source, plus a 0–6 readiness score. |

### Where the data comes from

All fetching is done by **four small serverless proxies** in `standalone/api/`:

| Endpoint | Upstream | Notes |
|---|---|---|
| `/api/fx`    | [Frankfurter (ECB)](https://www.frankfurter.app/) | AUD/USD daily reference rate + history. Free, no key. |
| `/api/gold`  | Yahoo Finance (`GC=F` gold future) | Daily close + history. Free, no key. |
| `/api/news`  | [GDELT Doc API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) | Headlines, last 72 h, English. Free, no key. Rate-limited by upstream to ~1 request per 5 s; responses are edge-cached for 5 min. |
| `/api/rates` | Hand-maintained in `standalone/api/rates.js` | RBA cash rate + Fed funds target + differential. Why hand-maintained? Because free RBA/Fed feeds either block browsers or need keys. |

**Why a proxy and not direct browser calls?** Two reasons:
1. **CORS.** Some of these upstream APIs don't allow direct browser access.
2. **Caching and rate-limits.** The proxy shields you from upstream throttling and keeps loads fast.

The proxy runs on **Vercel's free tier** as part of the same deployment that serves the HTML. No separate infrastructure.

---

## 2. Is the data live?

**Short answer: daily, not tick.**

- AUD/USD (Frankfurter / ECB) is published **once per business day**, ~16:00 Central European Time. During Australian trading hours, today's number usually hasn't been published yet — you'll see yesterday's close.
- Gold (Yahoo GC=F) is the **previous session's close**.
- News (GDELT) is **near-real-time** (minutes behind publication).
- Rates (hand-maintained) change only when the RBA or Fed change policy.

For **learning and demo trading** that's fine and arguably better — daily data forces you to think in terms of trends, not ticks. For live intraday trading you'd need a paid/keyed API; see §6.

---

## 3. "Is it actually connected?" — quick test

Open the **Health** tab. Press **Run checks again**. You should see four ticks:

- ✓ AUD/USD — shows today's/yesterday's date and rate
- ✓ Gold — shows date and close
- ✓ Rates — shows the "as of" date baked into the function
- ✓ News — shows how many articles it pulled

If any are red, the corresponding card on **Now** will say so politely and the rest of the app keeps working. The **Readiness** score (0–6) on that tab combines feed health with whether the strategies are giving a clear, agreed-upon signal.

---

## 4. iPad tips

- Tap **Share → Add to Home Screen** in Safari to get a fullscreen app icon. The relevant meta tags are already wired.
- The **Sandbox Export** buttons (JSON / CSV) trigger a standard download — the iPad Share sheet then lets you save to **Files, Google Drive, email**, anywhere.
- Everything else (Journal, saved runs) lives in the browser's `localStorage`. Use Export before clearing Safari.

---

## 5. Hosting

Vercel is the recommended host because the `api/` functions run there for free.

1. New Vercel project → import this GitHub repo.
2. **Root directory:** `standalone`
3. **Framework:** Other
4. **Build command:** *empty*
5. **Output directory:** *empty* (or `.`)
6. After deploy, `https://<project>.vercel.app/` is the app. `/api/fx`, `/api/gold`, `/api/news`, `/api/rates` are the endpoints.

**Other hosts (GitHub Pages, Netlify static, etc.):** the HTML will load but the **`/api/*` routes will 404**, which means no live data. Vercel is the simplest path.

---

## 6. Future: intraday / tick data

Adding intraday prices means picking a provider. Realistic free options:

- **Alpha Vantage** (free tier ~25 calls/day, needs a free key)
- **Twelve Data** (free tier 800 calls/day, needs a key)
- **Finnhub** (free tier 60 calls/min, needs a key)

All three need a key stored in **Vercel environment variables** and a new `/api/fx_intraday` proxy. It's a ~30-minute add when you're ready.

---

## 7. Updating the hand-maintained rates

When the RBA or Fed change their target rate:

1. Edit `standalone/api/rates.js` — update the `RATES` constant (numbers, dates, direction, `as_of`).
2. Commit and push.
3. Vercel auto-redeploys in ~30 s.

That's it. No other files need to change.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| All feeds fail | You opened the HTML as `file://` | Deploy to Vercel, or run `vercel dev` locally |
| News always 429 | You clicked Refresh repeatedly in dev. GDELT rate-limits to 1/5 s | Wait a minute. In production, edge caching absorbs this. |
| Gold card empty, others OK | Yahoo occasionally rate-limits | Press Refresh on **Health** tab a minute later |
| Rates look stale | Nobody has updated `rates.js` since the last central bank decision | §7 |
| Signals never non-FLAT | The two strategies are meant to sit out most days. That's the design. | Use Sandbox to see how often they actually fire over 90 / 180 / 260 days |

---

## 9. What's in the repo

That's the whole thing. Nothing else. No Python, no Node build step, no CSVs.

```
Trade1/
├── README.md
├── docs/USER_GUIDE.md           ← this file
├── standalone/
│   ├── index.html / trade.html  ← the app (same file, two names)
│   ├── app-icon.svg             ← PWA icon
│   ├── manifest.webmanifest     ← PWA manifest
│   ├── vercel.json              ← static + function config
│   └── api/
│       ├── fx.js                ← AUD/USD proxy
│       ├── gold.js              ← Gold proxy
│       ├── news.js              ← News proxy
│       └── rates.js             ← Hand-maintained rates
├── .env.example                 ← placeholder (no keys needed for live app)
└── .gitignore
```

---

## 10. Honest disclaimers

- **Not financial advice.** The two strategies are simple rules that *can* fit recent history and *can* lose money going forward.
- **Demo first.** Use a demo account for weeks/months before any real capital.
- **Simulated Sandbox results ignore spread, slippage, and overnight swap.** Real trades cost more than the numbers you see.
- **Past performance does not predict future results.** Full stop.

---

*API functions run on **Vercel Edge Runtime** (Web Request/Response, native fetch). No Node compatibility quirks, no ES-module vs CommonJS headaches, and cold starts are faster than Node Lambda.*

---

*Updated: iPad-self-contained release — live Edge proxies for FX / gold / news / rates, browser-side signals, Sandbox replay, Compare tab, collapsible Learn content.*
