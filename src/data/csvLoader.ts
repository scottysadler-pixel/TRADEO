/**
 * Load the **unified daily CSV** consumed by the backtester.
 *
 * Price column: **`audusd_close`** (legacy) **or** **`fx_close`** (generic pair) — exactly one per row.
 * Optional **`pair_id`** (e.g. EURUSD) or set env **`FX_PAIR_ID`** for exports.
 */
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { DailyRow, PriceColumnUsed } from "../types.js";
import { normalizeDateString } from "../utils/dateUtils.js";
import {
  parseNumberStrict,
  resolvePriceFromRecord,
} from "./resolvePriceColumn.js";

const REQUIRED_BASE = ["date", "trends_index", "sentiment_score"] as const;

export interface LoadCsvResult {
  rows: DailyRow[];
  priceColumnUsed: PriceColumnUsed;
}

/**
 * Load daily rows + which price column the file uses (all rows must agree).
 */
export async function loadDataFromCsvWithMeta(path: string): Promise<LoadCsvResult> {
  const text = await readFile(path, "utf8");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: DailyRow[] = [];
  let filePriceCol: PriceColumnUsed | null = null;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    for (const col of REQUIRED_BASE) {
      if (!(col in rec) || rec[col] === undefined || rec[col] === "") {
        throw new Error(`Row ${i + 2}: missing column "${col}"`);
      }
    }

    const { close, which } = resolvePriceFromRecord(rec, `Row ${i + 2}`);
    if (filePriceCol === null) {
      filePriceCol = which;
    } else if (filePriceCol !== which) {
      throw new Error(
        `Row ${i + 2}: inconsistent price column (file uses ${filePriceCol}, found ${which})`
      );
    }

    let trendsWow: number | null = null;
    if (
      "trends_wow" in rec &&
      rec.trends_wow !== undefined &&
      String(rec.trends_wow).trim() !== ""
    ) {
      trendsWow = parseNumberStrict(rec.trends_wow!, `Row ${i + 2} trends_wow`);
    }

    let pairId: string | undefined;
    if (
      "pair_id" in rec &&
      rec.pair_id !== undefined &&
      String(rec.pair_id).trim() !== ""
    ) {
      pairId = String(rec.pair_id).trim();
    }

    rows.push({
      date: normalizeDateString(rec.date),
      audusd_close: close,
      ...(pairId ? { pair_id: pairId } : {}),
      trends_index: parseNumberStrict(rec.trends_index, `Row ${i + 2} trends_index`),
      trends_wow: trendsWow,
      sentiment_score: parseNumberStrict(
        rec.sentiment_score,
        `Row ${i + 2} sentiment_score`
      ),
    });
  }

  if (rows.length === 0) {
    throw new Error("CSV has no data rows");
  }

  return { rows, priceColumnUsed: filePriceCol! };
}

/**
 * Load daily rows from CSV. Header row required.
 */
export async function loadDataFromCsv(path: string): Promise<DailyRow[]> {
  const { rows } = await loadDataFromCsvWithMeta(path);
  return rows;
}
