/**
 * Run all strategy presets on one CSV and write:
 *   - output/variant_comparison.csv (metrics table)
 *   - output/variant_equity_chart.html (interactive Chart.js — open in a browser)
 *
 * Usage:
 *   npx tsx scripts/compareVariants.ts --file data/audusd_merged.csv
 *   npx tsx scripts/compareVariants.ts --list
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";
import { runFullBacktest } from "../src/pipeline.ts";
import { STRATEGY_PRESETS } from "../src/strategy/presets.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) {
    console.log("Presets (use with --preset ID or compare all in HTML):\n");
    for (const p of STRATEGY_PRESETS) {
      console.log(`  ${p.id}`);
      console.log(`    ${p.label}`);
      console.log(`    ${p.nicheNote}\n`);
    }
    return;
  }

  const file = arg("--file", argv, null);
  if (!file) {
    console.error(
      "Usage: npx tsx scripts/compareVariants.ts --file <merged.csv>\n npx tsx scripts/compareVariants.ts --list"
    );
    process.exit(1);
  }

  const csvPath = resolve(process.cwd(), file);
  const daily = await loadDataFromCsv(csvPath);
  daily.sort((a, b) => compareIsoDates(a.date, b.date));

  const buyHold =
    daily.length > 0
      ? daily[daily.length - 1]!.audusd_close - daily[0]!.audusd_close
      : 0;

  type Series = {
    id: string;
    label: string;
    nicheNote: string;
    equity: number[];
    summary: (ReturnType<typeof runFullBacktest>)["summary"];
  };

  const labels = daily.map((r) => r.date);
  const series: Series[] = [];

  for (const preset of STRATEGY_PRESETS) {
    const result = runFullBacktest(daily, preset.enrich);
    const eq = result.equityCurve.map((p) => p.equity);
    series.push({
      id: preset.id,
      label: preset.label,
      nicheNote: preset.nicheNote,
      equity: eq,
      summary: result.summary,
    });
  }

  const rows = series.map((s) => ({
    id: s.id,
    label: s.label,
    total_pnl: s.summary.totalPnl.toFixed(6),
    trades: s.summary.totalTrades,
    sharpe: Number.isFinite(s.summary.sharpeAnnualized)
      ? s.summary.sharpeAnnualized.toFixed(4)
      : "",
    max_dd: s.summary.maxDrawdown.toFixed(6),
    profit_factor: Number.isFinite(s.summary.profitFactor)
      ? s.summary.profitFactor.toFixed(4)
      : s.summary.profitFactor === Infinity
        ? "inf"
        : "0",
    buy_hold: buyHold.toFixed(6),
  }));

  const outDir = resolve(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const csvOut = resolve(outDir, "variant_comparison.csv");
  writeFileSync(csvOut, stringify(rows, { header: true }), "utf8");
  console.log(`Wrote ${csvOut}`);

  const chartPayload = {
    labels,
    buyHold,
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
      <tr><td><strong>Buy &amp; hold</strong></td><td>${buyHold.toFixed(5)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
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

  const htmlPath = resolve(outDir, "variant_equity_chart.html");
  writeFileSync(htmlPath, html, "utf8");
  console.log(`Wrote ${htmlPath}`);
  console.log("Open the HTML file in your browser to see the chart.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
