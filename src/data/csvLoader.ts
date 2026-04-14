/**
 * Load the **unified daily CSV** consumed by the backtester.
 *
 * ---------------------------------------------------------------------------
 * How this file is usually produced (outside this repo)
 * ---------------------------------------------------------------------------
 *
 * **1) FX price (`audusd_close`)**
 * - Daily close from your data vendor (broker, Polygon, TrueFX, etc.).
 * - Append one row per trading day to a `prices.csv` (or merge in memory).
 *
 * **2) Google Trends (`trends_index`, 0–100)**
 * - Export a time series from the Trends web UI for keywords you care about
 *   (e.g. "AUD USD", "RBA", "iron ore price"). Tune keywords manually first.
 * - Trends is often **weekly**; store weekly points, then for each **trading day**
 *   attach the **latest known** week’s value (forward-filled / as-of join).
 * - Unofficial libraries can automate fetches; respect Google’s terms of use.
 *
 * **3) News sentiment (`sentiment_score`, e.g. −1…+1)**
 * - **Path A:** NewsAPI (or similar) → headlines → VADER / LLM / lexicon → daily average.
 * - **Path B:** Vendor JSON that already includes polarity (ForexNewsAPI, EODHD, etc.).
 *
 * **4) Join**
 * - Merge `prices` + `trends` + `sentiment` on `date` → columns:
 *   `date, audusd_close, trends_index, sentiment_score` plus optional `trends_wow`
 *   (week-over-week change; use with `--trends-mode wow`).
 *
 * **5) Run**
 * - `npm run build && node dist/index.js --file path/to/aud_strategy_input.csv`
 *
 * ---------------------------------------------------------------------------
 * Loader behavior
 * ---------------------------------------------------------------------------
 * - Header row required; column names must match exactly.
 * - Numeric fields: invalid numbers **throw** (fail fast; fix upstream data).
 */
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { DailyRow } from "../types.js";
import { normalizeDateString } from "../utils/dateUtils.js";

const REQUIRED_COLUMNS = [
  "date",
  "audusd_close",
  "trends_index",
  "sentiment_score",
] as const;

function parseNumber(value: string, rowIndex: number, column: string): number {
  const n = Number(String(value).trim());
  if (Number.isNaN(n)) {
    throw new Error(
      `Row ${rowIndex + 1}: invalid number in column "${column}": "${value}"`
    );
  }
  return n;
}

/**
 * Load daily rows from CSV. Header row required.
 * Bad numeric values throw (fail fast so data issues are obvious).
 */
export async function loadDataFromCsv(path: string): Promise<DailyRow[]> {
  const text = await readFile(path, "utf8");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: DailyRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    for (const col of REQUIRED_COLUMNS) {
      if (!(col in rec) || rec[col] === undefined || rec[col] === "") {
        throw new Error(`Row ${i + 2}: missing column "${col}"`);
      }
    }
    let trendsWow: number | null = null;
    if (
      "trends_wow" in rec &&
      rec.trends_wow !== undefined &&
      String(rec.trends_wow).trim() !== ""
    ) {
      trendsWow = parseNumber(rec.trends_wow!, i, "trends_wow");
    }

    rows.push({
      date: normalizeDateString(rec.date),
      audusd_close: parseNumber(rec.audusd_close, i, "audusd_close"),
      trends_index: parseNumber(rec.trends_index, i, "trends_index"),
      trends_wow: trendsWow,
      sentiment_score: parseNumber(rec.sentiment_score, i, "sentiment_score"),
    });
  }
  return rows;
}
