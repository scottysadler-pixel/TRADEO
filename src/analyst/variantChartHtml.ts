/**
 * Self-contained Chart.js HTML for variant equity curves.
 */
import { writeFileSync } from "node:fs";
import type { VariantSeries } from "./variantComparison.js";

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#db2777",
  "#0d9488",
  "#ea580c",
];

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function writeVariantEquityChartHtml(
  htmlPath: string,
  labels: string[],
  buyHoldPnl: number,
  series: VariantSeries[]
): void {
  const chartPayload = {
    labels,
    buyHold: buyHoldPnl,
    datasets: series.map((s, i) => ({
      label: s.label,
      borderColor: COLORS[i % COLORS.length]!,
      backgroundColor: "transparent",
      data: s.equity,
      tension: 0.1,
      pointRadius: 0,
      borderWidth: 2,
    })),
    notes: series.map((s) => ({ id: s.id, note: s.nicheNote })),
  };

  const json = JSON.stringify(chartPayload).replace(/</g, "\\u003c");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AUD/USD strategy variants — equity curves</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    h1 { font-size: 1.25rem; }
    p.hint { color: #64748b; font-size: 0.9rem; }
    #notes { margin-top: 24px; font-size: 0.85rem; }
    #notes dt { font-weight: 600; margin-top: 12px; }
    #notes dd { margin: 4px 0 0 1rem; color: #475569; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 0.85rem; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Equity curves (same data, different rules)</h1>
  <p class="hint">Cumulative realized P&amp;L per unit notional (strategy). Dashed line = buy-and-hold over the same window. Niche ideas are meant for paper testing — not advice.</p>
  <canvas id="chart" height="120"></canvas>
  <table>
    <thead><tr><th>Variant</th><th>Total P&amp;L</th><th>Trades</th><th>Sharpe</th><th>Max DD</th><th>Profit factor</th></tr></thead>
    <tbody>
${series
  .map(
    (s) =>
      `      <tr><td>${escHtml(s.label)}</td><td>${s.summary.totalPnl.toFixed(5)}</td><td>${s.summary.totalTrades}</td><td>${Number.isFinite(s.summary.sharpeAnnualized) ? s.summary.sharpeAnnualized.toFixed(3) : "—"}</td><td>${s.summary.maxDrawdown.toFixed(5)}</td><td>${Number.isFinite(s.summary.profitFactor) ? s.summary.profitFactor.toFixed(3) : s.summary.profitFactor === Infinity ? "∞" : "—"}</td></tr>`
  )
  .join("\n")}
      <tr><td><strong>Buy &amp; hold</strong></td><td>${buyHoldPnl.toFixed(5)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
    </tbody>
  </table>
  <dl id="notes">
${series
  .map(
    (s) =>
      `    <dt>${escHtml(s.id)} — ${escHtml(s.label)}</dt>\n    <dd>${escHtml(s.nicheNote)}</dd>`
  )
  .join("\n")}
  </dl>
  <script>
    const payload = ${json};
    const ctx = document.getElementById("chart").getContext("2d");
    const bh = payload.labels.map(() => payload.buyHold);
    const datasets = [
      {
        label: "Buy & hold (total return)",
        data: bh,
        borderColor: "#94a3b8",
        borderDash: [6, 4],
        pointRadius: 0,
        borderWidth: 2,
      },
      ...payload.datasets,
    ];
    new Chart(ctx, {
      type: "line",
      data: { labels: payload.labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom" },
          title: { display: false },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12 } },
          y: { title: { display: true, text: "Cumulative P&amp;L (rate)" } },
        },
      },
    });
  </script>
</body>
</html>`;

  writeFileSync(htmlPath, html, "utf8");
}
