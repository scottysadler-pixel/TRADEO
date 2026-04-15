/**
 * Static HTML landing page after `npm run trial` (no server).
 */
import type { AnalystBundle } from "./bundle.js";
import type { DataHealthReport } from "./dataHealth.js";
import type { ReplayCatalog } from "./replay.js";
import type { PipelineContext, RunStatus } from "./runStatus.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trendsLabel(src: PipelineContext["trendsSource"]): string {
  switch (src) {
    case "google_trends_pytrends":
      return "Real (pytrends)";
    case "synthetic_flat_python_failed":
      return "Synthetic flat (Trends fetch failed)";
    case "synthetic_flat_no_python":
      return "Synthetic flat (no Python)";
    default:
      return String(src);
  }
}

function sentimentLabel(src: PipelineContext["sentimentSource"]): string {
  switch (src) {
    case "python_fetchSentiment":
      return "Python script";
    case "synthetic_neutral_python_failed":
      return "Neutral0.0 (sentiment script failed)";
    case "synthetic_neutral_no_python":
      return "Neutral 0.0 (no Python)";
    default:
      return String(src);
  }
}

export interface TrialDashboardInput {
  generatedAt: string;
  sourceCsv: string;
  outputDir: string;
  health: DataHealthReport;
  bundle: AnalystBundle;
  geminiBriefPath: string | null;
  geminiResponsePath: string | null;
  /** From `npm run go` via `_pipeline_context.json`; null if trial-only. */
  pipeline: PipelineContext | null;
  plainEnglish: string;
  runStatus: RunStatus;
  /** Beginner “start here” block (HTML fragment). */
  operatorHeroHtml: string;
  /** Educational help section (HTML fragment). */
  operatorHelpHtml: string;
  /** Precomputed as-of replay (null if dataset too short or disabled). */
  replayCatalog: ReplayCatalog | null;
}

function buildReplayBlock(catalog: ReplayCatalog | null): string {
  if (!catalog || catalog.days.length === 0) {
    return `
  <h2>Historical replay (paper)</h2>
  <p class="meta">Replay needs at least ~30 daily rows and room for +10 trading days ahead in the CSV. Re-run trial after collecting more history, or use <code>output/replay_data.json</code> when present.</p>`;
  }
  const safeJson = JSON.stringify(catalog).replace(/</g, "\\u003c");
  return `
  <h2>Historical replay (paper)</h2>
  <p class="meta">${escapeHtml(catalog.trustDisclaimer)}</p>
  <p class="meta">${escapeHtml(catalog.historicalPaperDisclaimer)}</p>
  <div class="operator-hero replay-panel">
    <h2>Pick a date — what would it have said?</h2>
    <div class="replay-guide">
      <strong>How to read this</strong>
      <ul class="why-list">
        <li><strong>LONG</strong> = the system leaned toward the base currency strengthening.</li>
        <li><strong>SHORT</strong> = the system leaned toward the base currency weakening.</li>
        <li><strong>FLAT</strong> = no strong edge; think “wait / observe,” not “take a side.”</li>
        <li><strong>Helped / hurt</strong> = whether that historical lean matched what the market did next.</li>
      </ul>
    </div>
    <div class="replay-controls">
      <label for="replay-date">As-of date</label>
      <input type="date" id="replay-date" min="${escapeHtml(catalog.firstReplayDate)}" max="${escapeHtml(catalog.lastReplayDate)}" value="${escapeHtml(catalog.lastReplayDate)}" />
      <button type="button" id="replay-go">Analyze</button>
    </div>
    <div id="replay-result" class="replay-summary" aria-live="polite">Select a date and click Analyze.</div>
    <div class="replay-slots">
      <strong>Future headline / sentiment slots (not wired yet)</strong>
      <ul>
        <li><em>AU vs NZ:</em> ${escapeHtml(catalog.headlineSlots.australiaVsNewZealand)}</li>
        <li><em>RBA vs RBNZ:</em> ${escapeHtml(catalog.headlineSlots.rbaVsRbnz)}</li>
        <li><em>Risk-off / USD:</em> ${escapeHtml(catalog.headlineSlots.riskOffUsdDominance)}</li>
      </ul>
    </div>
  </div>
  <script type="application/json" id="trade1-replay-data">${safeJson}</script>
  <script>
(function () {
  var raw = document.getElementById("trade1-replay-data");
  if (!raw || !raw.textContent) return;
  var CATALOG;
  try { CATALOG = JSON.parse(raw.textContent); } catch (e) { return; }
  var byDate = {};
  for (var i = 0; i < CATALOG.days.length; i++) {
    byDate[CATALOG.days[i].asOfDate] = CATALOG.days[i];
  }
  var dateEl = document.getElementById("replay-date");
  var btn = document.getElementById("replay-go");
  var out = document.getElementById("replay-result");
  if (!dateEl || !out) return;
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function fmtPnl(x) {
    if (x === null || x === undefined || !isFinite(x)) return "n/a";
    return (x >= 0 ? "+" : "") + x.toFixed(5);
  }
  function verdictLabel(v) {
    if (v === "helped") return '<span class="ok">would have helped</span>';
    if (v === "hurt") return '<span class="warn">would have hurt</span>';
    if (v === "flat") return "about flat";
    return "n/a";
  }
  function signalHint(signal) {
    if (signal === "LONG") return "Learning read: the model would have preferred base-currency strength on that day.";
    if (signal === "SHORT") return "Learning read: the model would have preferred base-currency weakness on that day.";
    return "Learning read: this was a wait day. The model did not see enough edge to lean LONG or SHORT.";
  }
  function notionalNote(signal) {
    if (signal === "FLAT") {
      return "No illustrative notionals shown here because a FLAT read means no directional paper position was being suggested.";
    }
    return "Crude paper only - no spreads, fees, or leverage. Use these to learn sign and rough size, not execution realism.";
  }
  function qualityClass(q) {
    if (q === "real") return "ok";
    if (q === "fallback") return "warn";
    return "";
  }
  function render() {
    var d = dateEl.value;
    var row = byDate[d];
    if (!row) {
      out.innerHTML = "<p>No replay for that date. Choose a trading day between <code>" + esc(CATALOG.firstReplayDate) + "</code> and <code>" + esc(CATALOG.lastReplayDate) + "</code> (from the merged CSV).</p>";
      return;
    }
    var f1 = null, f5 = null, f10 = null;
    for (var j = 0; j < row.forwards.length; j++) {
      if (row.forwards[j].horizonDays === 1) f1 = row.forwards[j];
      if (row.forwards[j].horizonDays === 5) f5 = row.forwards[j];
      if (row.forwards[j].horizonDays === 10) f10 = row.forwards[j];
    }
    var why = row.whyBullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
    var ill = row.illustrativePnls.map(function (r) {
      return "<tr><td>" + esc(String(r.notionalUnits)) + "</td><td>" + fmtPnl(r.pnl1d) + "</td><td>" + fmtPnl(r.pnl5d) + "</td><td>" + fmtPnl(r.pnl10d) + "</td></tr>";
    }).join("");
    var frag = row.fragile ? "<strong class=\\"warn\\">Fragile at this date:</strong> rolling-window leaders disagreed — treat the lean as tentative." : "<strong class=\\"ok\\">Stability:</strong> rolling-window leaders agreed (still small-sample).";
    var sentZ = row.sentimentZ !== null && row.sentimentZ !== undefined && isFinite(row.sentimentZ)
      ? esc(row.sentimentZ.toFixed(2)) : "n/a";
    var signalExplain = signalHint(row.latestSignal);
    var prov = row.provenance || null;
    var provHtml = prov
      ? "<h3>As-of trust</h3>" +
        "<p><strong class=\\"" + qualityClass(prov.overallQuality) + "\\">" + esc(prov.overallLabel) + "</strong> - " + esc(prov.overallSummary) + "</p>" +
        "<ul class=\\"why-list\\"><li><strong>Trends:</strong> " + esc(prov.trendsSummary) + "</li><li><strong>Sentiment:</strong> " + esc(prov.sentimentSummary) + "</li></ul>"
      : "<p class=\\"meta\\">Replay-specific provenance was not generated for this row.</p>";
    out.innerHTML =
      "<p class=\\"lean\\"><strong>As-of " + esc(row.asOfDate) + "</strong> — " + esc(row.leanHeadline) + "</p>" +
      "<p class=\\"meta\\">Leading preset (from data through that day only): <code>" + esc(row.leadingPresetId) + "</code> · Signal <strong>" + esc(row.latestSignal) + "</strong> · Entry close " + esc(String(row.entryRate)) + "</p>" +
      "<p class=\\"replay-takeaway\\">" + esc(signalExplain) + "</p>" +
      "<p class=\\"meta\\">Sentiment (last row of as-of slice): score " + esc(String(row.sentimentScore)) + " · rolling z " + sentZ + " (same machinery as the main “why” bullets).</p>" +
      "<p class=\\"meta\\">Data through that day: <strong>" + esc(String(row.pctRowsWithTrendsWow.toFixed(0))) + "%</strong> of rows had Trends week-over-week in the slice.</p>" +
      provHtml +
      "<h3>Why (plain English)</h3><ul class=\\"why-list\\">" + why + "</ul>" +
      "<p>" + frag + "</p>" +
      "<h3>What happened next (historical paper)</h3>" +
      "<table><thead><tr><th>Horizon</th><th>Exit date</th><th>PnL / 1 unit base</th><th>vs lean</th></tr></thead><tbody>" +
      (f1 ? "<tr><td>+1 trading day</td><td>" + esc(f1.exitDate || "—") + "</td><td>" + fmtPnl(f1.pnlPerUnit) + "</td><td>" + verdictLabel(f1.verdict) + "</td></tr>" : "") +
      (f5 ? "<tr><td>+5 trading days</td><td>" + esc(f5.exitDate || "—") + "</td><td>" + fmtPnl(f5.pnlPerUnit) + "</td><td>" + verdictLabel(f5.verdict) + "</td></tr>" : "") +
      (f10 ? "<tr><td>+10 trading days</td><td>" + esc(f10.exitDate || "—") + "</td><td>" + fmtPnl(f10.pnlPerUnit) + "</td><td>" + verdictLabel(f10.verdict) + "</td></tr>" : "") +
      "</tbody></table>" +
      "<h3>Illustrative notionals (" + esc(CATALOG.baseCurrency) + " units, quote terms)</h3>" +
      "<p class=\\"meta\\">" + esc(notionalNote(row.latestSignal)) + "</p>" +
      "<table><thead><tr><th>Notional</th><th>~1d</th><th>~5d</th><th>~10d</th></tr></thead><tbody>" + ill + "</tbody></table>" +
      "<h3>One-line summary</h3>" +
      "<p>That day: <strong>" + esc(row.latestSignal) + "</strong> via <code>" + esc(row.leadingPresetId) + "</code>. Next day: " + verdictLabel(f1 ? f1.verdict : "n/a") + " · 5d: " + verdictLabel(f5 ? f5.verdict : "n/a") + " · 10d: " + verdictLabel(f10 ? f10.verdict : "n/a") + ". " + (row.latestSignal === "FLAT" ? "This was mainly a stand-aside read." : "") + " " + (row.fragile ? "Setup looked fragile." : "Setup looked less fragile across windows.") + "</p>";
  }
  if (btn) btn.addEventListener("click", render);
  dateEl.addEventListener("change", render);
  render();
})();
  </script>`;
}

export function buildTrialDashboardHtml(input: TrialDashboardInput): string {
  const files = [
    { label: "Equity chart", file: "variant_equity_chart.html" },
    { label: "Variant CSV", file: "variant_comparison.csv" },
    { label: "Analyst JSON", file: "analyst_bundle.json" },
    { label: "Analyst markdown", file: "analyst_for_llm.md" },
    { label: "Run status (machine)", file: "run_status.json" },
    { label: "Plain-English summary", file: "plain_english_summary.txt" },
    { label: "Data health", file: "data_health.json" },
    { label: "Replay (JSON)", file: "replay_data.json" },
    ...(input.geminiBriefPath
      ? [{ label: "Gemini brief (paste)", file: "gemini_research_brief.md" }]
      : []),
    ...(input.geminiResponsePath
      ? [{ label: "Gemini API reply", file: "gemini_response.md" }]
      : []),
  ];

  const warnHtml =
    input.health.warnings.length === 0
      ? `<p class="ok">No data health warnings.</p>`
      : `<ul class="warn">${input.health.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;

  const fileRows = files
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.label)}</td><td><code>${escapeHtml(f.file)}</code></td></tr>`
    )
    .join("");

  const bestSharpe = (() => {
    let best = "";
    let bestS = -Infinity;
    for (const s of input.bundle.variantTable) {
      const sh = s.sharpeAnnualized;
      if (typeof sh === "number" && Number.isFinite(sh) && sh > bestS) {
        bestS = sh;
        best = s.id;
      }
    }
    return best ? `${best} (${bestS.toFixed(3)})` : "—";
  })();

  const p = input.pipeline;
  const trustBlock = p
    ? `
  <div class="trust">
    <h2>What this run used</h2>
    <p class="meta">Pipeline written at <code>${escapeHtml(p.writtenAt)}</code> · Primary pair <strong>${escapeHtml(p.primaryPairId)}</strong></p>
    <ul class="trust-list">
      <li><span class="badge price">Price</span> Frankfurter API (${p.pricesRowCount} rows)</li>
      <li><span class="badge trends">Trends</span> ${escapeHtml(trendsLabel(p.trendsSource))}</li>
      <li><span class="badge sent">Sentiment</span> ${escapeHtml(sentimentLabel(p.sentimentSource))}</li>
      <li><span class="badge meta2">Python</span> ${p.pythonDetected ? "Detected" : "Not found (synthetic fallbacks used where applicable)"}</li>
      <li><span class="badge meta2">NEWSAPI_KEY</span> ${p.newsApiKeySet ? "Set" : "Not set (often → neutral sentiment)"}</li>
      <li><span class="badge meta2">GEMINI_API_KEY</span> ${p.geminiApiKeySet ? "Set" : "Not set (brief is paste-only unless you add key)"}</li>
      <li><span class="badge meta2">Merged CSV</span> <code>${escapeHtml(p.mergedPath)}</code> · ${p.mergedRowCount} rows</li>
    </ul>
    ${
      p.warnings.length
        ? `<p class="warn-inline"><strong>Pipeline notes:</strong> ${p.warnings.map((w) => escapeHtml(w)).join(" ")}</p>`
        : ""
    }
  </div>`
    : `
  <div class="trust muted">
    <h2>What this run used</h2>
    <p>No pipeline snapshot — you likely ran <code>npm run trial</code> without <code>npm run go</code>. Price/Trends/sentiment provenance is unknown for this page; use <code>npm run go</code> for full trust signals and <code>run_status.json</code>.</p>
  </div>`;

  const top3Rows = input.runStatus.top3BySharpe
    .map(
      (r) =>
        `<tr><td><code>${escapeHtml(r.id)}</code></td><td>${escapeHtml(r.label)}</td><td>${r.sharpe !== null && Number.isFinite(r.sharpe) ? r.sharpe.toFixed(4) : "—"}</td><td>${Number.isFinite(r.totalPnl) ? r.totalPnl.toFixed(6) : "—"}</td></tr>`
    )
    .join("");

  const pairRows =
    p?.pairRanking && p.pairRanking.length > 0
      ? p.pairRanking
          .map(
            (e) =>
              `<tr><td><strong>${escapeHtml(e.pairId)}</strong></td><td>${e.bestSharpe !== null && Number.isFinite(e.bestSharpe) ? e.bestSharpe.toFixed(4) : "—"}</td><td><code>${escapeHtml(e.bestPresetId)}</code></td><td>${e.rowCount}</td><td>${escapeHtml(e.dataQualityNote)}</td></tr>`
          )
          .join("")
      : "";

  const pairSection =
    pairRows.length > 0
      ? `
  <h2>Pair ranking (multi-pair)</h2>
  <p class="meta">From <code>config/pairs.json</code> + <code>npm run go</code>. Cross-pair rows may use synthetic alt-data — see notes column.</p>
  <table>
    <thead><tr><th>Pair</th><th>Best Sharpe</th><th>Best preset</th><th>Rows</th><th>Note</th></tr></thead>
    <tbody>${pairRows}</tbody>
  </table>`
      : "";

  const rs = input.runStatus;
  const ynUnk = (v: boolean | null): string =>
    v === null ? "unknown (run trial after npm run go for provenance)" : v ? "yes" : "no";
  const runSnapshotWarnings =
    rs.warnings.length === 0
      ? `<p class="ok">No combined warnings in run_status.</p>`
      : `<ul class="warn">${rs.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;
  const runSnapshot = `
  <h2>Run status snapshot</h2>
  <p class="meta">Same fields as <code>run_status.json</code> (schema v${rs.schemaVersion}).</p>
  <ul class="trust-list">
    <li><strong>Trial finished</strong> <code>${escapeHtml(rs.trialFinishedAt)}</code></li>
    <li><strong>Trial steps</strong> all completed: variant comparison, analyst bundle, data health, run status + dashboard</li>
    <li><strong>Trends synthetic (fallback)</strong> ${escapeHtml(ynUnk(rs.fallbackFlags.trendsSynthetic))}</li>
    <li><strong>Sentiment neutral fallback</strong> ${escapeHtml(ynUnk(rs.fallbackFlags.sentimentNeutralFallback))}</li>
    <li><strong>Row counts</strong> source CSV ${rs.rowCounts.sourceCsvRows}${rs.rowCounts.pipelinePricesRows != null ? ` · pipeline prices ${rs.rowCounts.pipelinePricesRows}` : ""}${rs.rowCounts.pipelineMergedRows != null ? ` · pipeline merged ${rs.rowCounts.pipelineMergedRows}` : ""}</li>
  </ul>
  <p class="meta">Combined warnings (data health + pipeline):</p>
  ${runSnapshotWarnings}`;

  const rollingHint =
    input.bundle.rollingSnapshots.length > 0
      ? `<p class="meta rolling-hint"><strong>Rolling windows (60 / 120 / 252 trading days):</strong> see <code>analyst_bundle.json</code> → <code>rollingSnapshots</code> and <code>analyst_for_llm.md</code>.</p>`
      : "";
  const starterChecklist = `
  <div class="trust starter-checklist">
    <h2>Starter checklist</h2>
    <ol class="checklist">
      <li>Read <strong>Start here</strong> first: that is the current lean in plain English.</li>
      <li>Check <strong>What this run used</strong> so you know whether inputs were real, partial, or fallback-heavy.</li>
      <li>Open <strong>Historical replay (paper)</strong> to see what the system would have said on an earlier date and what happened next.</li>
      <li>If a replay date says <strong>FLAT</strong>, read it as “wait / observe,” not as a fake zero-return trade.</li>
    </ol>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trial dashboard — ${escapeHtml(input.health.pairId)}</title>
  <style>
    :root { font-family: system-ui, sans-serif; background: #0f1419; color: #e6edf3; }
    body { max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.35rem; font-weight: 600; }
    h2 { font-size: 1.05rem; margin-top: 1.5rem; font-weight: 600; }
    .meta { color: #8b949e; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; margin: 1rem 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 0.85rem; }
    .card b { display: block; font-size: 1.1rem; }
    .card span { color: #8b949e; font-size: 0.8rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #30363d; vertical-align: top; }
    th { color: #8b949e; font-weight: 500; }
    code { background: #21262d; padding: 0.12rem 0.35rem; border-radius: 4px; }
    .ok { color: #3fb950; }
    .warn { color: #d29922; }
    ul.warn li { margin: 0.35rem 0; }
    .hint { background: #21262d; border-radius: 8px; padding: 0.85rem 1rem; margin-top: 1.25rem; font-size: 0.88rem; color: #8b949e; }
    .trust { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem 1.1rem; margin: 1rem 0; }
    .trust.muted { border-style: dashed; }
    .trust-list { margin: 0.5rem 0 0; padding-left: 1.1rem; line-height: 1.7; }
    .trust-list li { margin: 0.25rem 0; }
    .badge { display: inline-block; font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 4px; margin-right: 0.35rem; text-transform: uppercase; letter-spacing: 0.02em; }
    .badge.price { background: #238636; color: #fff; }
    .badge.trends { background: #1f6feb; color: #fff; }
    .badge.sent { background: #8957e5; color: #fff; }
    .badge.meta2 { background: #30363d; color: #e6edf3; }
    .warn-inline { color: #d29922; font-size: 0.88rem; margin: 0.75rem 0 0; }
    pre.plain { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 1rem; white-space: pre-wrap; word-break: break-word; font-size: 0.85rem; line-height: 1.45; margin: 0.75rem 0; }
    .rolling-hint { margin-top: 0.5rem; }
    .operator-hero { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem 1.1rem; margin: 1rem 0; }
    .operator-hero h2 { margin-top: 0; }
    .operator-hero .lean { font-size: 1.05rem; line-height: 1.45; margin: 0.5rem 0; }
    .operator-hero h3 { font-size: 0.95rem; margin: 1rem 0 0.35rem; }
    .why-list { margin: 0.35rem 0 0; padding-left: 1.1rem; line-height: 1.55; }
       .override-slot { margin-top: 0.75rem; padding: 0.65rem 0.75rem; background: #21262d; border-radius: 6px; font-size: 0.88rem; color: #8b949e; }
    .replay-panel { margin: 1rem 0; }
    .replay-controls { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.75rem 0; }
    .replay-controls input[type="date"] { background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 0.35rem 0.5rem; }
    .replay-controls button { background: #238636; color: #fff; border: none; border-radius: 6px; padding: 0.4rem 0.85rem; font-weight: 600; cursor: pointer; }
    .replay-controls button:hover { filter: brightness(1.08); }
    .replay-summary { background: #21262d; border-radius: 8px; padding: 0.75rem 1rem; margin: 0.75rem 0; font-size: 0.9rem; line-height: 1.5; }
    .replay-guide { background: #21262d; border-radius: 8px; padding: 0.75rem 1rem; margin: 0.5rem 0 1rem; font-size: 0.9rem; }
    .replay-guide strong { display: block; margin-bottom: 0.35rem; }
    .replay-takeaway { background: #0d1117; border-left: 3px solid #1f6feb; padding: 0.6rem 0.75rem; border-radius: 6px; margin: 0.75rem 0; }
    .replay-slots { font-size: 0.85rem; color: #8b949e; margin-top: 1rem; }
    .replay-slots ul { margin: 0.35rem 0 0; padding-left: 1.1rem; }
    .checklist { margin: 0.5rem 0 0; padding-left: 1.2rem; line-height: 1.7; }
  </style>
</head>
<body>
  <h1>Trial dashboard</h1>
  <p class="meta">Generated ${escapeHtml(input.generatedAt)} · Pair <strong>${escapeHtml(input.health.pairId)}</strong> · Price column <code>${escapeHtml(input.health.priceColumnUsed)}</code></p>
  <p class="meta">Source CSV: <code>${escapeHtml(input.sourceCsv)}</code></p>
  <p class="meta">Output folder: <code>${escapeHtml(input.outputDir)}</code> · Bundle v${input.bundle.bundleVersion} · Data health: <span class="${input.runStatus.dataHealthOk ? "ok" : "warn"}">${input.runStatus.dataHealthOk ? "OK" : "warnings"}</span></p>

  ${input.operatorHeroHtml}

  ${starterChecklist}

  <div class="cards">
    <div class="card"><span>Rows</span><b>${input.health.rowCount}</b></div>
    <div class="card"><span>Span (calendar days)</span><b>${input.health.spanCalendarDays}</b></div>
    <div class="card"><span>% rows w/ WoW</span><b>${input.health.pctRowsWithTrendsWow.toFixed(0)}%</b></div>
    <div class="card"><span>Best Sharpe (preset)</span><b>${escapeHtml(bestSharpe)}</b></div>
  </div>

  ${trustBlock}

  ${runSnapshot}

  ${input.operatorHelpHtml}

  ${buildReplayBlock(input.replayCatalog)}

  <h2>What happened (plain English)</h2>
  <pre class="plain">${escapeHtml(input.plainEnglish)}</pre>

  <h2>Top 3 presets (by Sharpe, this run)</h2>
  <table>
    <thead><tr><th>ID</th><th>Label</th><th>Sharpe</th><th>Total PnL</th></tr></thead>
    <tbody>${top3Rows || `<tr><td colspan="4">—</td></tr>`}</tbody>
  </table>
  ${rollingHint}
  ${pairSection}

  <h2>Data health</h2>
  ${warnHtml}

  <h2>Output files</h2>
  <p class="meta">Open HTML/CSV from this folder in File Explorer (double-click). Cursor may not preview these paths.</p>
  <table>
    <thead><tr><th>Artifact</th><th>Filename</th></tr></thead>
    <tbody>${fileRows}</tbody>
  </table>

  <div class="hint">
    <strong>Health check:</strong> <code>npm run doctor</code> · <strong>Repair:</strong> <code>docs/OPERATOR_GUIDE.md</code> · Research angles: <code>docs/TRIAL_PLAYBOOK.md</code>.
    Gemini: <code>gemini_research_brief.md</code> is for manual paste unless <code>GEMINI_API_KEY</code> produced <code>gemini_response.md</code>.
  </div>
</body>
</html>`;
}
