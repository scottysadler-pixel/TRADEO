/**
 * Fetch daily AUD/USD closes from Frankfurter (ECB proxy, no API key).
 *
 * Usage: npx tsx scripts/fetchPrice.ts [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 * Output: data/prices.csv (date, audusd_close)
 */
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stringify } from "csv-stringify/sync";

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

interface FrankfurterResponse {
  rates: Record<string, { USD: number }>;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const end = parseArg("--end", argv, new Date().toISOString().slice(0, 10))!;
  const start =
    parseArg("--start", argv, addYears(end, -2)) ??
    addYears(end, -2);

  const url = `https://api.frankfurter.app/${start}..${end}?from=AUD&to=USD`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as FrankfurterResponse;
  const rates = body.rates;
  if (!rates || typeof rates !== "object") {
    throw new Error("Unexpected Frankfurter response (no rates)");
  }

  const dates = Object.keys(rates).sort();
  const rows = dates.map((date) => ({
    date,
    audusd_close: rates[date]!.USD,
  }));

  const outDir = resolve(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const csvPath = resolve(outDir, "prices.csv");
  const csv = stringify(rows, { header: true });
  await writeFile(csvPath, csv, "utf8");
  console.log(`Wrote ${rows.length} rows to ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
