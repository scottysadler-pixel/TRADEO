/**
 * Fetch daily FX closes from Frankfurter (ECB proxy, no API key).
 *
 * Usage:
 *   npx tsx scripts/fetchPrice.ts [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 *   npx tsx scripts/fetchPrice.ts --from EUR --to USD --out data/prices_eur.csv
 *
 * Default: AUD/USD → data/prices.csv
 */
import { resolve } from "node:path";
import { fetchFrankfurterToCsv } from "../src/data/frankfurterFetch.ts";

function parseArg(name: string, argv: string[], fallback: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1]!;
}

function addYears(iso: string, deltaY: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCFullYear(dt.getUTCFullYear() + deltaY);
  return dt.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const end = parseArg("--end", argv, new Date().toISOString().slice(0, 10))!;
  const start =
    parseArg("--start", argv, addYears(end, -2)) ?? addYears(end, -2);
  const from = parseArg("--from", argv, "AUD")!;
  const to = parseArg("--to", argv, "USD")!;
  const out =
    parseArg("--out", argv, resolve(process.cwd(), "data", "prices.csv"))!;

  const n = await fetchFrankfurterToCsv({ start, end, from, to, outPath: out });
  console.log(`Wrote ${n} rows to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
