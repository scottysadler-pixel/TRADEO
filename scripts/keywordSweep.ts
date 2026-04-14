/**
 * Rank keyword-specific trends files by out-of-sample backtest stats.
 *
 * Place CSVs in data/keywords/ each with columns: date,trends_index[,trends_wow]
 * Requires data/prices.csv and data/sentiment.csv (run fetchPrice + fetchSentiment first).
 *
 * Usage:
 *   npx tsx scripts/keywordSweep.ts [--split-date YYYY-MM-DD] [--keywords-dir data/keywords]
 */
import { readdirSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { asOfJoinDaily, loadPricesCsv, loadSentimentCsv, loadTrendsCsv } from "../src/data/joinDaily.ts";
import { runFullBacktest, splitByDate } from "../src/pipeline.ts";
import type { TrendsMode } from "../src/types.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const splitDate =
    arg("--split-date", argv, null) ?? "2024-01-01";
  const kwDir = resolve(
    process.cwd(),
    arg("--keywords-dir", argv, "data/keywords")!
  );
  const trendsMode = (arg("--trends-mode", argv, "sma") as TrendsMode) || "sma";

  const pricesPath = resolve(process.cwd(), "data/prices.csv");
  const sentimentPath = resolve(process.cwd(), "data/sentiment.csv");
  const [prices, sentiment] = await Promise.all([
    loadPricesCsv(pricesPath),
    loadSentimentCsv(sentimentPath),
  ]);

  let files: string[] = [];
  try {
    files = readdirSync(kwDir).filter((f) => f.endsWith(".csv"));
  } catch {
    mkdirSync(kwDir, { recursive: true });
    writeFileSync(
      resolve(kwDir, "README.txt"),
      "Drop one CSV per keyword: date,trends_index[,trends_wow]\n"
    );
    console.log(`Created empty ${kwDir} — add keyword CSVs and re-run.`);
    return;
  }

  type Row = {
    keyword: string;
    oosSharpe: number;
    oosPnl: number;
    oosTrades: number;
    isSharpe: number;
  };
  const results: Row[] = [];

  for (const file of files) {
    const trendsPath = resolve(kwDir, file);
    const trends = await loadTrendsCsv(trendsPath);
    const daily = asOfJoinDaily(prices, trends, sentiment);
    const { inSample, outOfSample } = splitByDate(daily, splitDate);

    const enrichOpts = {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      sentimentLagDays: 0,
      signalConfig: {
        trendsMode,
        sentimentThreshold: 0.25,
        flavor: "standard",
        minAbsWow: 0,
      },
    };

    const isRes =
      inSample.length > 0 ? runFullBacktest(inSample, enrichOpts) : null;
    const oosRes =
      outOfSample.length > 0
        ? runFullBacktest(outOfSample, enrichOpts)
        : null;

    results.push({
      keyword: file.replace(/\.csv$/i, ""),
      isSharpe: isRes?.summary.sharpeAnnualized ?? NaN,
      oosSharpe: oosRes?.summary.sharpeAnnualized ?? NaN,
      oosPnl: oosRes?.summary.totalPnl ?? 0,
      oosTrades: oosRes?.summary.totalTrades ?? 0,
    });
  }

  results.sort((a, b) => {
    const sa = Number.isFinite(a.oosSharpe) ? a.oosSharpe : -999;
    const sb = Number.isFinite(b.oosSharpe) ? b.oosSharpe : -999;
    return sb - sa;
  });

  console.log(`\nKeyword sweep (split ${splitDate}, trends-mode=${trendsMode})\n`);
  console.log(
    "keyword".padEnd(28) +
      "oos_sharpe".padStart(12) +
      "oos_pnl".padStart(12) +
      "oos_trades".padStart(12) +
      "is_sharpe".padStart(12)
  );
  for (const r of results) {
    console.log(
      r.keyword.padEnd(28) +
        (Number.isFinite(r.oosSharpe) ? r.oosSharpe.toFixed(3) : "n/a").padStart(12) +
        r.oosPnl.toFixed(5).padStart(12) +
        String(r.oosTrades).padStart(12) +
        (Number.isFinite(r.isSharpe) ? r.isSharpe.toFixed(3) : "n/a").padStart(12)
    );
  }

  const outCsv = stringify(
    results.map((r) => ({
      keyword: r.keyword,
      oos_sharpe: Number.isFinite(r.oosSharpe) ? r.oosSharpe.toFixed(6) : "",
      oos_pnl: r.oosPnl.toFixed(6),
      oos_trades: r.oosTrades,
      is_sharpe: Number.isFinite(r.isSharpe) ? r.isSharpe.toFixed(6) : "",
    })),
    { header: true }
  );
  const outPath = resolve(process.cwd(), "output/keyword_sweep.csv");
  mkdirSync(resolve(process.cwd(), "output"), { recursive: true });
  writeFileSync(outPath, outCsv, "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
