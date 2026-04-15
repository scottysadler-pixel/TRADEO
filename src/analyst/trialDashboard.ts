/**
 * Static HTML landing page after `npm run trial` (no server).
 */
import type { AnalystBundle } from "./bundle.js";
import type { DataHealthReport } from "./dataHealth.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface TrialDashboardInput {
  generatedAt: string;
  sourceCsv: string;
  outputDir: string;
  health: DataHealthReport;
  bundle: AnalystBundle;
  geminiBriefPath: string | null;
  geminiResponsePath: string | null;
}

export function buildTrialDashboardHtml(input: TrialDashboardInput): string {
  const files = [
    { label: "Equity chart", file: "variant_equity_chart.html" },
    { label: "Variant CSV", file: "variant_comparison.csv" },
    { label: "Analyst JSON", file: "analyst_bundle.json" },
    { label: "Analyst markdown", file: "analyst_for_llm.md" },
    { label: "Data health", file: "data_health.json" },
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
    .meta { color: #8b949e; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; margin: 1rem 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 0.85rem; }
    .card b { display: block; font-size: 1.1rem; }
    .card span { color: #8b949e; font-size: 0.8rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #30363d; }
    th { color: #8b949e; font-weight: 500; }
    code { background: #21262d; padding: 0.12rem 0.35rem; border-radius: 4px; }
    .ok { color: #3fb950; }
    .warn { color: #d29922; }
    ul.warn li { margin: 0.35rem 0; }
    .hint { background: #21262d; border-radius: 8px; padding: 0.85rem 1rem; margin-top: 1.25rem; font-size: 0.88rem; color: #8b949e; }
  </style>
</head>
<body>
  <h1>Trial dashboard</h1>
  <p class="meta">Generated ${escapeHtml(input.generatedAt)} · Pair <strong>${escapeHtml(input.health.pairId)}</strong> · Price column <code>${escapeHtml(input.health.priceColumnUsed)}</code></p>
  <p class="meta">Source CSV: <code>${escapeHtml(input.sourceCsv)}</code></p>
  <p class="meta">Output folder: <code>${escapeHtml(input.outputDir)}</code></p>

  <div class="cards">
    <div class="card"><span>Rows</span><b>${input.health.rowCount}</b></div>
    <div class="card"><span>Span (calendar days)</span><b>${input.health.spanCalendarDays}</b></div>
    <div class="card"><span>% rows w/ WoW</span><b>${input.health.pctRowsWithTrendsWow.toFixed(0)}%</b></div>
    <div class="card"><span>Best Sharpe (preset)</span><b>${escapeHtml(bestSharpe)}</b></div>
  </div>

  <h2>Data health</h2>
  ${warnHtml}

  <h2>Output files</h2>
  <p class="meta">Open HTML/CSV from this folder in File Explorer (double-click). Cursor may not preview these paths.</p>
  <table>
    <thead><tr><th>Artifact</th><th>Filename</th></tr></thead>
    <tbody>${fileRows}</tbody>
  </table>

  <div class="hint">
    <strong>Repair:</strong> see <code>docs/OPERATOR_GUIDE.md</code>. Research angles: <code>docs/TRIAL_PLAYBOOK.md</code>.
    Gemini: <code>gemini_research_brief.md</code> is for manual paste unless <code>GEMINI_API_KEY</code> produced <code>gemini_response.md</code>.
  </div>
</body>
</html>`;
}
