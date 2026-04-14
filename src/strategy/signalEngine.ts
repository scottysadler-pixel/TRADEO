/**
 * Signal generation: configurable **flavors** — most presets deliberately avoid
 * the textbook “everything points the same way” pattern crowded strategies use.
 *
 * See `strategy/presets.ts` for named bundles to paper-trade side by side.
 */

import {
  DEFAULT_SIGNAL_CONFIG,
  type Signal,
  type SignalEngineConfig,
  type SignalInputs,
} from "../types.js";

function resolveConfig(
  partial?: Partial<SignalEngineConfig>
): SignalEngineConfig {
  return {
    trendsMode: partial?.trendsMode ?? DEFAULT_SIGNAL_CONFIG.trendsMode,
    sentimentThreshold:
      partial?.sentimentThreshold ?? DEFAULT_SIGNAL_CONFIG.sentimentThreshold,
    flavor: partial?.flavor ?? DEFAULT_SIGNAL_CONFIG.flavor,
    minAbsWow: partial?.minAbsWow ?? DEFAULT_SIGNAL_CONFIG.minAbsWow,
  };
}

export function generateSignal(
  inputs: SignalInputs,
  config?: Partial<SignalEngineConfig>
): Signal {
  const { trendsMode, sentimentThreshold, flavor, minAbsWow } =
    resolveConfig(config);
  const {
    price,
    priceSma50,
    trendsIndex,
    trendsSma20,
    trendsWow,
    sentimentScore,
  } = inputs;

  if (priceSma50 === null) {
    return "FLAT";
  }

  const bullishTrend = price > priceSma50;
  const bearishTrend = price < priceSma50;

  let bullishAttention: boolean;
  let bearishAttention: boolean;

  if (trendsMode === "wow") {
    if (trendsWow === null) {
      return "FLAT";
    }
    if (flavor === "attentionSpike" && minAbsWow > 0) {
      bullishAttention = trendsWow >= minAbsWow;
      bearishAttention = trendsWow <= -minAbsWow;
    } else if (flavor === "uptrendQuietAttention") {
      bullishAttention = trendsWow < 0;
      bearishAttention = trendsWow > 0;
    } else {
      bullishAttention = trendsWow > 0;
      bearishAttention = trendsWow < 0;
    }
  } else {
    if (trendsSma20 === null) {
      return "FLAT";
    }
    if (flavor === "attentionSpike" && minAbsWow > 0) {
      const d = trendsIndex - trendsSma20;
      bullishAttention = d >= minAbsWow;
      bearishAttention = d <= -minAbsWow;
    } else if (flavor === "uptrendQuietAttention") {
      bullishAttention = trendsIndex < trendsSma20;
      bearishAttention = trendsIndex > trendsSma20;
    } else {
      bullishAttention = trendsIndex > trendsSma20;
      bearishAttention = trendsIndex < trendsSma20;
    }
  }

  let bullishSentiment: boolean;
  let bearishSentiment: boolean;
  if (flavor === "contrarianFear") {
    bullishSentiment = sentimentScore < -sentimentThreshold;
    bearishSentiment = sentimentScore > sentimentThreshold;
  } else {
    bullishSentiment = sentimentScore > sentimentThreshold;
    bearishSentiment = sentimentScore < -sentimentThreshold;
  }

  if (bullishTrend && bullishAttention && bullishSentiment) return "LONG";
  if (bearishTrend && bearishAttention && bearishSentiment) return "SHORT";
  return "FLAT";
}
