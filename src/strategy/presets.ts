/**
 * Named strategy bundles for **comparing** behaviors on the same CSV.
 * Rationale: crowded “triple agreement” patterns get arbitraged; these skew
 * toward sparse, interpretable, *weird* rules you can watch on paper first.
 */
import type { EnrichOptions } from "../pipeline.js";
import type { SignalEngineConfig } from "../types.js";

export interface StrategyPreset {
  id: string;
  /** Short label for charts */
  label: string;
  /** Plain-English why this is off the beaten path */
  nicheNote: string;
  enrich: Partial<EnrichOptions>;
}

function sc(partial: Partial<SignalEngineConfig>): Partial<SignalEngineConfig> {
  return partial;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: "mainstreamTriple",
    label: "Mainstream triple-lock",
    nicheNote:
      "Baseline: trend + attention + sentiment all agree. Reference only — what many systematic blogs describe.",
    enrich: {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      signalConfig: sc({
        trendsMode: "sma",
        sentimentThreshold: 0.25,
        flavor: "standard",
        minAbsWow: 0,
      }),
    },
  },
  {
    id: "slowConviction",
    label: "Slow conviction",
    nicheNote:
      "90d trend filter + stricter news bar — fewer trades, ignores fast chop. Boring on purpose.",
    enrich: {
      priceSmaPeriod: 90,
      trendsSmaPeriod: 30,
      signalConfig: sc({
        trendsMode: "sma",
        sentimentThreshold: 0.35,
        flavor: "standard",
        minAbsWow: 0,
      }),
    },
  },
  {
    id: "attentionBurst",
    label: "Attention burst only",
    nicheNote:
      "Only trades when Trends move sharply (|WoW| or vs-SMA gap). Skips low-signal churn.",
    enrich: {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      signalConfig: sc({
        trendsMode: "wow",
        sentimentThreshold: 0.22,
        flavor: "attentionSpike",
        minAbsWow: 3,
      }),
    },
  },
  {
    id: "quietUptrend",
    label: "Quiet uptrend / loud downtrend",
    nicheNote:
      "Long when price is strong but **search interest is cooling**; short when price is weak but buzz is heating. Fades one-sided hype cycles.",
    enrich: {
      priceSmaPeriod: 55,
      trendsSmaPeriod: 25,
      signalConfig: sc({
        trendsMode: "wow",
        sentimentThreshold: 0.25,
        flavor: "uptrendQuietAttention",
        minAbsWow: 0,
      }),
    },
  },
  {
    id: "contrarianMood",
    label: "Contrarian mood",
    nicheNote:
      "Needs bearish headlines to go long (and bullish headlines to go short) while trend + attention still align. Uncomfortable by design.",
    enrich: {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      signalConfig: sc({
        trendsMode: "sma",
        sentimentThreshold: 0.2,
        flavor: "contrarianFear",
        minAbsWow: 0,
      }),
    },
  },
  {
    id: "yesterdayHeadlines",
    label: "Yesterday’s headlines",
    nicheNote:
      "Sentiment lagged 1 day — crude guard against reacting to the same headlines everyone just saw.",
    enrich: {
      priceSmaPeriod: 50,
      trendsSmaPeriod: 20,
      sentimentLagDays: 1,
      signalConfig: sc({
        trendsMode: "sma",
        sentimentThreshold: 0.25,
        flavor: "standard",
        minAbsWow: 0,
      }),
    },
  },
];

export function getPresetById(id: string): StrategyPreset | undefined {
  return STRATEGY_PRESETS.find((p) => p.id === id);
}
