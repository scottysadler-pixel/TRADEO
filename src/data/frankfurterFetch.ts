/**
 * Shared Frankfurter (ECB) daily FX fetch — no API key.
 */
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stringify } from "csv-stringify/sync";

export interface FrankfurterFetchOptions {
  start: string;
  end: string;
  /** ISO currency code, e.g. AUD */
  from: string;
  /** ISO currency code, e.g. USD */
  to: string;
  /** Absolute path to CSV (date, audusd_close) */
  outPath: string;
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

/**
 * Writes CSV with columns date, audusd_close (numeric close in `from`/`to` units).
 * @returns row count written
 */
export async function fetchFrankfurterToCsv(
  opts: FrankfurterFetchOptions
): Promise<number> {
  const { start, end, from, to, outPath } = opts;
  const url = `https://api.frankfurter.app/${start}..${end}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
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
  const rows = dates.map((date) => {
    const day = rates[date];
    if (!day || typeof day[to] !== "number") {
      throw new Error(`Frankfurter: missing rate for ${date} ${from}/${to}`);
    }
    return { date, audusd_close: day[to]! };
  });

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  const csv = stringify(rows, { header: true });
  await writeFile(outPath, csv, "utf8");
  return rows.length;
}
