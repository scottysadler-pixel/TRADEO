/**
 * Lightweight health summary for operators (green/red checks without a UI server).
 */
import type { DailyRow, PriceColumnUsed } from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";

export interface DataHealthReport {
  generatedAt: string;
  sourceCsv: string;
  pairId: string;
  priceColumnUsed: PriceColumnUsed;
  rowCount: number;
  firstDate: string;
  lastDate: string;
  spanCalendarDays: number;
  pctRowsWithTrendsWow: number;
  ok: boolean;
  warnings: string[];
}

export function buildDataHealthReport(
  sortedInput: DailyRow[],
  sourceCsv: string,
  priceColumnUsed: PriceColumnUsed
): DataHealthReport {
  const sorted = [...sortedInput].sort((a, b) =>
    compareIsoDates(a.date, b.date)
  );
  const n = sorted.length;
  const wows = sorted.map((r) => r.trends_wow);
  const wowCount = wows.filter((w) => w !== null).length;
  const first = n ? sorted[0]!.date : "";
  const last = n ? sorted[n - 1]!.date : "";
  const d0 = first ? new Date(first + "T12:00:00Z").getTime() : 0;
  const d1 = last ? new Date(last + "T12:00:00Z").getTime() : 0;
  const span = Math.max(0, Math.round((d1 - d0) / 86400000));

  const fromRow = sorted
    .map((r) => r.pair_id)
    .find((id): id is string => Boolean(id && id.trim()));
  const pairId = fromRow || process.env.FX_PAIR_ID?.trim() || "AUDUSD";

  const warnings: string[] = [];
  if (n < 60) {
    warnings.push(
      `Only ${n} rows — regime split and Sharpe estimates may be noisy; aim for 250+ trading days.`
    );
  }
  if (n > 0 && wowCount / n < 0.5) {
    warnings.push(
      "Many rows lack trends_wow — WoW-based presets may sit FLAT; fill from Trends pipeline or use SMA mode presets."
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceCsv,
    pairId,
    priceColumnUsed,
    rowCount: n,
    firstDate: first,
    lastDate: last,
    spanCalendarDays: span,
    pctRowsWithTrendsWow: n ? (wowCount / n) * 100 : 0,
    ok: warnings.length === 0,
    warnings,
  };
}
