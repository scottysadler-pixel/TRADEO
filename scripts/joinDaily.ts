/**
 * Merge data/prices.csv + trends + sentiment into one daily backtest CSV.
 *
 * Usage:
 *   npx tsx scripts/joinDaily.ts --trends data/trends.csv --sentiment data/sentiment.csv [--out data/audusd_merged.csv]
 */
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";
import { joinDailyFromFiles } from "../src/data/joinDaily.ts";

function reqArg(name: string, argv: string[]): string {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return argv[i + 1]!;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const trends = resolve(process.cwd(), reqArg("--trends", argv));
  const sentiment = resolve(process.cwd(), reqArg("--sentiment", argv));
  const outIdx = argv.indexOf("--out");
  const out =
    outIdx !== -1 && outIdx < argv.length - 1
      ? resolve(process.cwd(), argv[outIdx + 1]!)
      : resolve(process.cwd(), "data/audusd_merged.csv");

  const prices = resolve(process.cwd(), "data/prices.csv");
  const rows = await joinDailyFromFiles(prices, trends, sentiment);
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });

  const csv = stringify(
    rows.map((r) => ({
      date: r.date,
      audusd_close: r.audusd_close,
      trends_index: r.trends_index,
      trends_wow: r.trends_wow === null ? "" : r.trends_wow,
      sentiment_score: r.sentiment_score,
    })),
    { header: true }
  );
  await writeFile(out, csv, "utf8");
  console.log(`Wrote ${rows.length} rows to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
