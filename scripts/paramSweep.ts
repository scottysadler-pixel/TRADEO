/**
 * Grid search: price SMA, sentiment threshold, trends mode.
 * Reports in-sample vs out-of-sample metrics; optional sanity checks.
 *
 * Usage:
 *   npx tsx scripts/paramSweep.ts --file data/audusd_merged.csv --split-date 2024-01-01 [--sanity]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";
import { runFullBacktest, splitByDate } from "../src/pipeline.ts";
import { runBacktest } from "../src/backtest/backtester.ts";
import type { EnrichedRow, TrendsMode } from "../src/types.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";
import { enrichRows } from "../src/pipeline.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

function hasFlag(name: string, argv: string[]): boolean {
  return argv.includes(name);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = arg("--file", argv, null);
  if (!file) {
    console.error("Usage: npx tsx scripts/paramSweep.ts --file <merged.csv> --split-date YYYY-MM-DD");
    process.exit(1);
  }
  const splitDate = arg("--split-date", argv, "2024-01-01")!;
  const sanity = hasFlag("--sanity", argv);

  const csvPath = resolve(process.cwd(), file);
  let daily = await loadDataFromCsv(csvPath);
  daily.sort((a, b) => compareIsoDates(a.date, b.date));

  if (sanity) {
    const enriched = enrichRows(daily, {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      sentimentLagDays: 0,
      signalConfig: {
        trendsMode: "sma",
        sentimentThreshold: 0.25,
        flavor: "standard",
        minAbsWow: 0,
      },
    });
    const shuffled: EnrichedRow[] = enriched.map((r) => ({ ...r }));
    const sigs = shuffled.map((r) => r.signal);
    shuffleInPlace(sigs);
    shuffled.forEach((r, i) => {
      r.signal = sigs[i]!;
    });
    const rev = enriched.map((r) => ({
      ...r,
      signal:
        r.signal === "LONG"
          ? ("SHORT" as const)
          : r.signal === "SHORT"
            ? ("LONG" as const)
            : ("FLAT" as const),
    }));
    const base = runBacktest(enriched);
    const shuf = runBacktest(shuffled);
    const revRes = runBacktest(rev);
    console.log("\n--- Sanity checks (full sample) ---");
    console.log(`Baseline total P&L: ${base.summary.totalPnl.toFixed(5)}`);
    console.log(`Shuffled signals P&L:   ${shuf.summary.totalPnl.toFixed(5)}`);
    console.log(`Reversed signals P&L:   ${revRes.summary.totalPnl.toFixed(5)}`);
    console.log("(Shuffled should be ~noise; reversed should differ from baseline.)\n");
  }

  const pricePeriods = [30, 40, 50, 60, 70];
  const thresholds = [0.15, 0.2, 0.25, 0.3, 0.35];
  const modes: TrendsMode[] = ["sma", "wow"];

  const { inSample, outOfSample } = splitByDate(daily, splitDate);

  type Row = {
    priceSma: number;
    sentimentTh: number;
    trendsMode: TrendsMode;
    isSharpe: number;
    oosSharpe: number;
    oosPnl: number;
  };
  const grid: Row[] = [];

  for (const priceSma of pricePeriods) {
    for (const sentimentTh of thresholds) {
      for (const trendsMode of modes) {
        const opts = {
          priceSmaPeriod: priceSma,
          trendsSmaPeriod: trendsMode === "sma" ? 20 : 20,
          sentimentLagDays: 0,
          signalConfig: {
            trendsMode,
            sentimentThreshold: sentimentTh,
            flavor: "standard",
            minAbsWow: 0,
          },
        };
        const isRes =
          inSample.length > 0 ? runFullBacktest(inSample, opts) : null;
        const oosRes =
          outOfSample.length > 0
            ? runFullBacktest(outOfSample, opts)
            : null;
        grid.push({
          priceSma,
          sentimentTh,
          trendsMode,
          isSharpe: isRes?.summary.sharpeAnnualized ?? NaN,
          oosSharpe: oosRes?.summary.sharpeAnnualized ?? NaN,
          oosPnl: oosRes?.summary.totalPnl ?? 0,
        });
      }
    }
  }

  grid.sort((a, b) => {
    const sa = Number.isFinite(a.oosSharpe) ? a.oosSharpe : -999;
    const sb = Number.isFinite(b.oosSharpe) ? b.oosSharpe : -999;
    return sb - sa;
  });

  console.log(`\nTop 15 param sets by OOS Sharpe (split ${splitDate})\n`);
  for (const r of grid.slice(0, 15)) {
    console.log(
      `priceSma=${r.priceSma} sent=${r.sentimentTh} mode=${r.trendsMode} | ` +
        `OOS sharpe=${Number.isFinite(r.oosSharpe) ? r.oosSharpe.toFixed(3) : "n/a"} ` +
        `OOS pnl=${r.oosPnl.toFixed(5)} | IS sharpe=${Number.isFinite(r.isSharpe) ? r.isSharpe.toFixed(3) : "n/a"}`
    );
  }

  const outPath = resolve(process.cwd(), "output/param_sweep.csv");
  mkdirSync(resolve(process.cwd(), "output"), { recursive: true });
  writeFileSync(
    outPath,
    stringify(
      grid.map((r) => ({
        price_sma: r.priceSma,
        sentiment_threshold: r.sentimentTh,
        trends_mode: r.trendsMode,
        is_sharpe: Number.isFinite(r.isSharpe) ? r.isSharpe.toFixed(6) : "",
        oos_sharpe: Number.isFinite(r.oosSharpe) ? r.oosSharpe.toFixed(6) : "",
        oos_pnl: r.oosPnl.toFixed(6),
      })),
      { header: true }
    ),
    "utf8"
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
