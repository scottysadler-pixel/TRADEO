/**
 * Run all strategy presets on one CSV and write:
 *   - output/variant_comparison.csv (metrics table)
 *   - output/variant_equity_chart.html (interactive Chart.js — open in a browser)
 *
 * Usage:
 *   npx tsx scripts/compareVariants.ts --file data/audusd_merged.csv
 *   npx tsx scripts/compareVariants.ts --list
 *
 * Prefer `npm run trial` for one command + analyst export.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { writeVariantEquityChartHtml } from "../src/analyst/variantChartHtml.ts";
import { runVariantComparison } from "../src/analyst/variantComparison.ts";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";
import { STRATEGY_PRESETS } from "../src/strategy/presets.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

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
      "Usage: npx tsx scripts/compareVariants.ts --file <merged.csv>\n npx tsx scripts/compareVariants.ts --list\nOr: npm run trial"
    );
    process.exit(1);
  }

  const csvPath = resolve(process.cwd(), file);
  const daily = await loadDataFromCsv(csvPath);
  daily.sort((a, b) => compareIsoDates(a.date, b.date));

  const variantResult = runVariantComparison(daily);
  const rows = variantResult.series.map((s) => ({
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
    buy_hold: variantResult.buyHoldPnl.toFixed(6),
  }));

  const outDir = resolve(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const csvOut = resolve(outDir, "variant_comparison.csv");
  writeFileSync(csvOut, stringify(rows, { header: true }), "utf8");
  console.log(`Wrote ${csvOut}`);

  writeVariantEquityChartHtml(
    resolve(outDir, "variant_equity_chart.html"),
    variantResult.labels,
    variantResult.buyHoldPnl,
    variantResult.series
  );
  console.log(`Wrote ${resolve(outDir, "variant_equity_chart.html")}`);
  console.log("Open the HTML file in your browser to see the chart.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
