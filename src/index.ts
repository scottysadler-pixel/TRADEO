/**
 * CLI entry: load daily CSV → SMAs → signals → single-position backtest → CSV + summary.
 *
 * **P&L units:** raw AUD/USD rate change per one unit of notional (1 pip = 0.0001).
 *
 * Usage:
 *   npm run build
 *   node dist/index.js --file data/audusd_example.csv [--trends-mode sma|wow] [--split-date YYYY-MM-DD] ...
 */
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { stringify } from "csv-stringify/sync";
import { resolve } from "node:path";
import { parseCliArgs, argsToSignalConfig } from "./cli/args.js";
import { printBacktestSummary } from "./cli/printSummary.js";
import { loadDataFromCsv } from "./data/csvLoader.js";
import {
  enrichRows,
  runFullBacktest,
  splitByDate,
} from "./pipeline.js";
import { getPresetById } from "./strategy/presets.js";
import { compareIsoDates } from "./utils/dateUtils.js";

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv);
  const csvPath = resolve(process.cwd(), args.file);
  const daily = await loadDataFromCsv(csvPath);
  daily.sort((a, b) => compareIsoDates(a.date, b.date));

  const enrichOpts =
    args.presetId !== null
      ? (() => {
          const p = getPresetById(args.presetId);
          if (!p) {
            console.error(`Unknown --preset "${args.presetId}". Run: npm run compare:variants -- --list`);
            process.exit(1);
          }
          console.log(`Preset: ${p.id} — ${p.nicheNote}`);
          return { ...p.enrich };
        })()
      : {
          priceSmaPeriod: args.priceSmaPeriod,
          trendsSmaPeriod: args.trendsSmaPeriod,
          sentimentLagDays: 0,
          signalConfig: argsToSignalConfig(args),
        };

  if (args.splitDate) {
    const { inSample, outOfSample } = splitByDate(daily, args.splitDate);
    if (inSample.length > 0) {
      printBacktestSummary("In-sample", runFullBacktest(inSample, enrichOpts));
    } else {
      console.log("\n--- In-sample: no rows before split date ---");
    }
    if (outOfSample.length > 0) {
      printBacktestSummary(
        "Out-of-sample",
        runFullBacktest(outOfSample, enrichOpts)
      );
    } else {
      console.log("\n--- Out-of-sample: no rows from split date onward ---");
    }
  }

  const result = runFullBacktest(daily, enrichOpts);
  printBacktestSummary("Full sample", result);

  const outDir = resolve(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });

  const tradesCsv = stringify(
    result.trades.map((t) => ({
      entry_date: t.entryDate,
      exit_date: t.exitDate,
      direction: t.side,
      entry_price: t.entryPrice.toFixed(5),
      exit_price: t.exitPrice.toFixed(5),
      pnl: t.pnl.toFixed(5),
    })),
    { header: true }
  );
  await writeFile(resolve(outDir, "trades.csv"), tradesCsv, "utf8");

  const enriched = enrichRows(daily, enrichOpts);
  const enrichedCsv = stringify(
    enriched.map((r) => ({
      date: r.date,
      audusd_close: r.audusd_close.toFixed(5),
      trends_index: String(r.trends_index),
      trends_wow: r.trends_wow === null ? "" : String(r.trends_wow),
      sentiment_score: String(r.sentiment_score),
      price_sma: r.priceSma50 === null ? "" : r.priceSma50.toFixed(5),
      trends_sma: r.trendsSma20 === null ? "" : r.trendsSma20.toFixed(5),
      signal: r.signal,
    })),
    { header: true }
  );
  await writeFile(resolve(outDir, "enriched_daily.csv"), enrichedCsv, "utf8");

  const equityCsv = stringify(
    result.equityCurve.map((p) => ({
      date: p.date,
      equity: p.equity.toFixed(5),
    })),
    { header: true }
  );
  await writeFile(resolve(outDir, "equity_curve.csv"), equityCsv, "utf8");

  console.log(`\nWrote ${resolve(outDir, "trades.csv")}`);
  console.log(`Wrote ${resolve(outDir, "equity_curve.csv")}`);
  console.log(`Wrote ${resolve(outDir, "enriched_daily.csv")}`);

  const op = result.openPosition;
  if (op) {
    console.log(
      "\n--- Open position (still held after last row; no later close in this file) ---"
    );
    console.log(
      `Side: ${op.side}  Entry date: ${op.entryDate}  Entry price: ${op.entryPrice.toFixed(5)}`
    );
    console.log(
      "(Summary P&L above is realized closed trades only; this leg is not in trades.csv.)"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
