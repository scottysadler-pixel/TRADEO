/**
 * Shared enrichment + backtest pipeline for CLI and scripts (keywordSweep, paramSweep).
 */
import { runBacktest } from "./backtest/backtester.js";
import { simpleMovingAverage } from "./indicators/movingAverage.js";
import { generateSignal } from "./strategy/signalEngine.js";
import type {
  BacktestResult,
  DailyRow,
  EnrichedRow,
  SignalEngineConfig,
} from "./types.js";
import { compareIsoDates } from "./utils/dateUtils.js";

export interface EnrichOptions {
  priceSmaPeriod: number;
  trendsSmaPeriod: number;
  signalConfig: Partial<SignalEngineConfig>;
  /** Use sentiment from this many days ago (0 = same day). Reduces same-bar news reflex. */
  sentimentLagDays: number;
}

const DEFAULT_ENRICH: EnrichOptions = {
  priceSmaPeriod: 50,
  trendsSmaPeriod: 20,
  signalConfig: {},
  sentimentLagDays: 0,
};

export function enrichRows(
  daily: DailyRow[],
  options: Partial<EnrichOptions> = {}
): EnrichedRow[] {
  const {
    priceSmaPeriod,
    trendsSmaPeriod,
    signalConfig,
    sentimentLagDays,
  } = { ...DEFAULT_ENRICH, ...options };

  const sorted = [...daily].sort((a, b) => compareIsoDates(a.date, b.date));
  const closes = sorted.map((r) => r.audusd_close);
  const trends = sorted.map((r) => r.trends_index);
  const priceSma = simpleMovingAverage(closes, priceSmaPeriod);
  const trendsSma = simpleMovingAverage(trends, trendsSmaPeriod);

  return sorted.map((row, i) => {
    const lag = sentimentLagDays;
    const sentimentScore =
      lag === 0
        ? row.sentiment_score
        : i < lag
          ? 0
          : sorted[i - lag]!.sentiment_score;

    const signal = generateSignal(
      {
        price: row.audusd_close,
        priceSma50: priceSma[i] ?? null,
        trendsIndex: row.trends_index,
        trendsSma20: trendsSma[i] ?? null,
        trendsWow: row.trends_wow,
        sentimentScore,
      },
      signalConfig
    );
    return {
      ...row,
      priceSma50: priceSma[i] ?? null,
      trendsSma20: trendsSma[i] ?? null,
      signal,
    };
  });
}

export function runFullBacktest(
  daily: DailyRow[],
  options: Partial<EnrichOptions> = {}
): BacktestResult {
  const enriched = enrichRows(daily, options);
  return runBacktest(enriched);
}

/** Split rows by date (inclusive end of in-sample: date < splitDate). */
export function splitByDate(
  rows: DailyRow[],
  splitDate: string
): { inSample: DailyRow[]; outOfSample: DailyRow[] } {
  const sorted = [...rows].sort((a, b) => compareIsoDates(a.date, b.date));
  const inSample: DailyRow[] = [];
  const outOfSample: DailyRow[] = [];
  for (const r of sorted) {
    if (compareIsoDates(r.date, splitDate) < 0) {
      inSample.push(r);
    } else {
      outOfSample.push(r);
    }
  }
  return { inSample, outOfSample };
}
