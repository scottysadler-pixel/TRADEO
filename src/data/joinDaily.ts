/**
 * Merge price, trends, and sentiment CSVs into `DailyRow[]` with as-of joins * (each trading day gets the latest known trends/sentiment on or before that date).
 */
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { DailyRow, PriceColumnUsed } from "../types.js";
import { compareIsoDates, normalizeDateString } from "../utils/dateUtils.js";
import {
  parseNumberStrict,
  resolvePriceFromRecord,
} from "./resolvePriceColumn.js";

/** prices.csv: date, audusd_close **or** date, fx_close */
export async function loadPricesCsv(path: string): Promise<{
  rows: { date: string; audusd_close: number }[];
  priceColumnUsed: PriceColumnUsed;
}> {
  const text = await readFile(path, "utf8");
  const recs = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  let fileCol: PriceColumnUsed | null = null;
  const rows: { date: string; audusd_close: number }[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!;
    const { close, which } = resolvePriceFromRecord(r, `prices row ${i}`);
    if (fileCol === null) fileCol = which;
    else if (fileCol !== which) {
      throw new Error(
        `prices row ${i}: inconsistent price column (${fileCol} vs ${which})`
      );
    }
    rows.push({
      date: normalizeDateString(r.date),
      audusd_close: close,
    });
  }
  if (rows.length === 0 || fileCol === null) {
    throw new Error("prices CSV is empty");
  }
  return { rows, priceColumnUsed: fileCol };
}

/** trends CSV: date, trends_index [, trends_wow] */
export async function loadTrendsCsv(path: string): Promise<
  { date: string; trends_index: number; trends_wow: number | null }[]
> {
  const text = await readFile(path, "utf8");
  const recs = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return recs.map((r, i) => {
    let wow: number | null = null;
    if (
      "trends_wow" in r &&
      r.trends_wow !== undefined &&
      String(r.trends_wow).trim() !== ""
    ) {
      wow = parseNumberStrict(r.trends_wow, `trends row ${i} trends_wow`);
    }
    return {
      date: normalizeDateString(r.date),
      trends_index: parseNumberStrict(r.trends_index, `trends row ${i}`),
      trends_wow: wow,
    };
  });
}

/** sentiment.csv: date, sentiment_score */
export async function loadSentimentCsv(path: string): Promise<
  { date: string; sentiment_score: number }[]
> {
  const text = await readFile(path, "utf8");
  const recs = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return recs.map((r, i) => ({
    date: normalizeDateString(r.date),
    sentiment_score: parseNumberStrict(r.sentiment_score, `sentiment row ${i}`),
  }));
}

/**
 * As-of join: for each price row, use last trends/sentiment row with date <= price date.
 */
export function asOfJoinDaily(
  prices: { date: string; audusd_close: number }[],
  trends: { date: string; trends_index: number; trends_wow: number | null }[],
  sentiment: { date: string; sentiment_score: number }[]
): DailyRow[] {
  const pSorted = [...prices].sort((a, b) => compareIsoDates(a.date, b.date));
  const tSorted = [...trends].sort((a, b) => compareIsoDates(a.date, b.date));
  const sSorted = [...sentiment].sort((a, b) =>
    compareIsoDates(a.date, b.date)
  );

  let ti = -1;
  let si = -1;
  const out: DailyRow[] = [];

  for (const p of pSorted) {
    while (ti + 1 < tSorted.length && compareIsoDates(tSorted[ti + 1]!.date, p.date) <= 0) {
      ti++;
    }
    while (si + 1 < sSorted.length && compareIsoDates(sSorted[si + 1]!.date, p.date) <= 0) {
      si++;
    }

    if (ti < 0 || si < 0) {
      throw new Error(
        `Missing trends or sentiment on or before ${p.date} (need overlapping history).`
      );
    }

    const tr = tSorted[ti]!;
    const se = sSorted[si]!;

    out.push({
      date: p.date,
      audusd_close: p.audusd_close,
      trends_index: tr.trends_index,
      trends_wow: tr.trends_wow,
      sentiment_score: se.sentiment_score,
    });
  }

  return out;
}

export async function joinDailyFromFiles(
  pricesPath: string,
  trendsPath: string,
  sentimentPath: string
): Promise<DailyRow[]> {
  const [priceResult, trends, sentiment] = await Promise.all([
    loadPricesCsv(pricesPath),
    loadTrendsCsv(trendsPath),
    loadSentimentCsv(sentimentPath),
  ]);
  return asOfJoinDaily(priceResult.rows, trends, sentiment);
}
