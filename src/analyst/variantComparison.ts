/**
 * Run every strategy preset on the same daily series (for charts + exports).
 */
import { runFullBacktest } from "../pipeline.js";
import type { BacktestSummary, DailyRow } from "../types.js";
import { STRATEGY_PRESETS } from "../strategy/presets.js";
import { compareIsoDates } from "../utils/dateUtils.js";

export interface VariantSeries {
  id: string;
  label: string;
  nicheNote: string;
  equity: number[];
  summary: BacktestSummary;
}

export interface VariantComparisonResult {
  labels: string[];
  buyHoldPnl: number;
  series: VariantSeries[];
}

export function runVariantComparison(daily: DailyRow[]): VariantComparisonResult {
  const sorted = [...daily].sort((a, b) => compareIsoDates(a.date, b.date));
  const labels = sorted.map((r) => r.date);
  const buyHoldPnl =
    sorted.length > 0
      ? sorted[sorted.length - 1]!.audusd_close - sorted[0]!.audusd_close
      : 0;

  const series: VariantSeries[] = [];
  for (const preset of STRATEGY_PRESETS) {
    const result = runFullBacktest(sorted, preset.enrich);
    series.push({
      id: preset.id,
      label: preset.label,
      nicheNote: preset.nicheNote,
      equity: result.equityCurve.map((p) => p.equity),
      summary: result.summary,
    });
  }

  return { labels, buyHoldPnl, series };
}
