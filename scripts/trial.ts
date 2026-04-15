/**
 * One-shot trial: optional verify → variant comparison → chart → analyst bundle for other AIs.
 *
 * Usage:
 *   npm run trial
 *   npm run trial -- --file data/audusd_merged.csv
 *   npm run trial -- --verify
 *
 * Default CSV: data/audusd_merged.csv if it exists, else data/audusd_example.csv
 */
import { existsSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stringify } from "csv-stringify/sync";
import { buildAnalystBundle, formatAnalystMarkdown } from "../src/analyst/bundle.ts";
import { writeVariantEquityChartHtml } from "../src/analyst/variantChartHtml.ts";
import { runVariantComparison } from "../src/analyst/variantComparison.ts";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

function hasFlag(name: string, argv: string[]): boolean {
  return argv.includes(name);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();

  if (hasFlag("--verify", argv)) {
    const r = spawnSync("npm", ["run", "verify"], {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) {
      process.exit(r.status ?? 1);
    }
  }

  const explicit = arg("--file", argv, null);
  const merged = resolve(cwd, "data/audusd_merged.csv");
  const example = resolve(cwd, "data/audusd_example.csv");
  const csvPath = explicit
    ? resolve(cwd, explicit)
    : existsSync(merged)
      ? merged
      : example;

  if (!existsSync(csvPath)) {
    console.error(`No CSV found at ${csvPath}`);
    process.exit(1);
  }

  console.log(`Using: ${csvPath}`);
  const daily = await loadDataFromCsv(csvPath);
  const variantResult = runVariantComparison(daily);
  const outDir = resolve(cwd, "output");
  mkdirSync(outDir, { recursive: true });

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
  writeFileSync(
    resolve(outDir, "variant_comparison.csv"),
    stringify(rows, { header: true }),
    "utf8"
  );

  writeVariantEquityChartHtml(
    resolve(outDir, "variant_equity_chart.html"),
    variantResult.labels,
    variantResult.buyHoldPnl,
    variantResult.series
  );

  const bundle = buildAnalystBundle(
    daily,
    variantResult,
    csvPath.replace(/\\/g, "/")
  );
  writeFileSync(
    resolve(outDir, "analyst_bundle.json"),
    JSON.stringify(bundle, null, 2),
    "utf8"
  );
  writeFileSync(
    resolve(outDir, "analyst_for_llm.md"),
    formatAnalystMarkdown(bundle),
    "utf8"
  );

  console.log("\nWrote:");
  console.log(`  ${resolve(outDir, "variant_comparison.csv")}`);
  console.log(`  ${resolve(outDir, "variant_equity_chart.html")}`);
  console.log(`  ${resolve(outDir, "analyst_bundle.json")}  ← feed to another AI with analyst_for_llm.md`);
  console.log(`  ${resolve(outDir, "analyst_for_llm.md")}`);
  console.log("\nNext: npm run open:chart   (Windows opens the chart in browser)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
