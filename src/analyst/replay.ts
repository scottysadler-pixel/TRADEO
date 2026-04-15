/**
 * Precomputed historical replay: as-of-date lean (no future leakage) + forward paper outcomes.
 */
import { enrichRows } from "../pipeline.js";
import { STRATEGY_PRESETS, getPresetById } from "../strategy/presets.js";
import type { DailyRow, PriceColumnUsed, Signal } from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";
import { buildAnalystBundle } from "./bundle.js";
import { buildDataHealthReport } from "./dataHealth.js";
import {
  buildLeanHeadlineForSignal,
  buildOperatorWhyBullets,
  pickLeadingPresetIdFromBundle,
  pnlPerUnit,
  parsePair,
} from "./operatorGuidance.js";
import type { PipelineContext } from "./runStatus.js";
import { runVariantComparison } from "./variantComparison.js";

export const REPLAY_SCHEMA_VERSION = 1 as const;

export const ILLUSTRATIVE_NOTIONALS = [500, 2000, 5000] as const;

export type ReplayForwardVerdict = "helped" | "hurt" | "flat" | "n/a";
export type ReplayInputQuality = "real" | "partial" | "fallback" | "unknown";

export interface ReplayForwardLeg {
  horizonDays: 1 | 5 | 10;
  exitDate: string | null;
  exitRate: number | null;
  pnlPerUnit: number | null;
  verdict: ReplayForwardVerdict;
}

export interface ReplayIllustrativeRow {
  notionalUnits: number;
  pnl1d: number | null;
  pnl5d: number | null;
  pnl10d: number | null;
}

export interface ReplayInputProvenance {
  overallQuality: ReplayInputQuality;
  overallLabel: string;
  overallSummary: string;
  trendsQuality: ReplayInputQuality;
  trendsSummary: string;
  sentimentQuality: ReplayInputQuality;
  sentimentSummary: string;
}

export interface ReplayDayEntry {
  asOfDate: string;
  rowIndex: number;
  leadingPresetId: string;
  latestSignal: Signal;
  leanHeadline: string;
  whyBullets: string[];
  fragile: boolean;
  entryRate: number;
  forwards: ReplayForwardLeg[];
  illustrativePnls: ReplayIllustrativeRow[];
  pctRowsWithTrendsWow: number;
  sentimentScore: number;
  sentimentZ: number | null;
  provenance: ReplayInputProvenance;
}

export interface ReplayHeadlineSlots {
  australiaVsNewZealand: string;
  rbaVsRbnz: string;
  riskOffUsdDominance: string;
}

export interface ReplayCatalog {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  pairId: string;
  priceColumnUsed: PriceColumnUsed;
  baseCurrency: string;
  quoteCurrency: string;
  firstReplayDate: string;
  lastReplayDate: string;
  trustDisclaimer: string;
  historicalPaperDisclaimer: string;
  headlineSlots: ReplayHeadlineSlots;
  days: ReplayDayEntry[];
}

const FORWARD_HORIZONS = [1, 5, 10] as const;
const EPS = 1e-8;

function maxPresetPriceSmaPeriod(): number {
  let maxSma = 50;
  for (const p of STRATEGY_PRESETS) {
    const s = p.enrich.priceSmaPeriod;
    if (typeof s === "number" && s > maxSma) maxSma = s;
  }
  return maxSma;
}

/** First index i to replay: enough rows for longest preset SMA when possible, else best-effort; cap so +10d forward exists. */
function replayStartIndex(n: number): number {
  const lastI = n - 1 - 10;
  const ideal = maxPresetPriceSmaPeriod() - 1;
  return Math.min(Math.max(ideal, 49), lastI);
}

function forwardVerdict(signal: Signal, pnl: number | null): ReplayForwardVerdict {
  if (pnl === null) return "n/a";
  if (signal === "FLAT") return "n/a";
  if (pnl > EPS) return "helped";
  if (pnl < -EPS) return "hurt";
  return "flat";
}

function buildForwards(
  sorted: DailyRow[],
  i: number,
  signal: Signal
): ReplayForwardLeg[] {
  const entry = sorted[i]!.audusd_close;
  return FORWARD_HORIZONS.map((h) => {
    const j = i + h;
    if (j >= sorted.length) {
      return {
        horizonDays: h,
        exitDate: null,
        exitRate: null,
        pnlPerUnit: null,
        verdict: "n/a" as const,
      };
    }
    const exitRate = sorted[j]!.audusd_close;
    const p = pnlPerUnit(signal, entry, exitRate);
    return {
      horizonDays: h,
      exitDate: sorted[j]!.date,
      exitRate,
      pnlPerUnit: p,
      verdict: forwardVerdict(signal, p),
    };
  });
}

function buildIllustrative(
  signal: Signal,
  forwards: ReplayForwardLeg[]
): ReplayIllustrativeRow[] {
  if (signal === "FLAT") {
    return ILLUSTRATIVE_NOTIONALS.map((n) => ({
      notionalUnits: n,
      pnl1d: null,
      pnl5d: null,
      pnl10d: null,
    }));
  }
  const p1 = forwards.find((f) => f.horizonDays === 1)?.pnlPerUnit ?? null;
  const p5 = forwards.find((f) => f.horizonDays === 5)?.pnlPerUnit ?? null;
  const p10 = forwards.find((f) => f.horizonDays === 10)?.pnlPerUnit ?? null;
  return ILLUSTRATIVE_NOTIONALS.map((n) => ({
    notionalUnits: n,
    pnl1d: p1 === null ? null : p1 * n,
    pnl5d: p5 === null ? null : p5 * n,
    pnl10d: p10 === null ? null : p10 * n,
  }));
}

function isApproxZero(x: number | null | undefined): boolean {
  return x === null || x === undefined || Math.abs(x) <= EPS;
}

function buildTrendsProvenance(
  slice: DailyRow[],
  pctRowsWithTrendsWow: number,
  pipeline: PipelineContext | null
): { quality: ReplayInputQuality; summary: string } {
  const wowCoverage = pctRowsWithTrendsWow / 100;
  const allIndex50 = slice.every((r) => isApproxZero(r.trends_index - 50));
  const allWowZeroOrMissing = slice.every((r) => isApproxZero(r.trends_wow));

  if (pipeline?.trendsSource === "google_trends_pytrends") {
    if (wowCoverage >= 0.8) {
      return {
        quality: "real",
        summary: `Real pytrends pipeline on this run; ${pctRowsWithTrendsWow.toFixed(0)}% of rows in the as-of slice had trends_wow.`,
      };
    }
    return {
      quality: "partial",
      summary: `Pipeline said pytrends, but only ${pctRowsWithTrendsWow.toFixed(0)}% of rows in the as-of slice had trends_wow, so treat attention signals cautiously.`,
    };
  }

  if (pipeline) {
    return {
      quality: "fallback",
      summary: "This run used synthetic flat Trends, so historical replay is fallback-backed for attention inputs.",
    };
  }

  if (allIndex50 && allWowZeroOrMissing) {
    return {
      quality: "fallback",
      summary: "Slice looks like synthetic flat Trends (index pinned near 50 and wow near 0).",
    };
  }

  if (wowCoverage >= 0.8) {
    return {
      quality: "real",
      summary: `Slice looks usable for Trends (${pctRowsWithTrendsWow.toFixed(0)}% of rows had trends_wow), but exact row-level source metadata was not stored.`,
    };
  }

  if (wowCoverage >= 0.4) {
    return {
      quality: "partial",
      summary: `Slice has partial Trends coverage (${pctRowsWithTrendsWow.toFixed(0)}% with trends_wow), so attention inputs are mixed.`,
    };
  }

  return {
    quality: "unknown",
    summary: `Trends provenance is unclear for this slice (${pctRowsWithTrendsWow.toFixed(0)}% with trends_wow).`,
  };
}

function buildSentimentProvenance(
  slice: DailyRow[],
  pipeline: PipelineContext | null
): { quality: ReplayInputQuality; summary: string } {
  const allZero = slice.every((r) => isApproxZero(r.sentiment_score));

  if (pipeline?.sentimentSource === "python_fetchSentiment") {
    if (allZero) {
      return {
        quality: "partial",
        summary: "Sentiment came from the Python script on this run, but this slice is all 0.0, so treat it as quiet/thin rather than strongly informative.",
      };
    }
    return {
      quality: "real",
      summary: "Sentiment came from the Python fetch script on this run and the slice has non-zero values.",
    };
  }

  if (pipeline) {
    return {
      quality: "fallback",
      summary: "This run used neutral fallback sentiment, so replay sentiment is fallback-backed for this date too.",
    };
  }

  if (allZero) {
    return {
      quality: "fallback",
      summary: "Slice looks like neutral fallback sentiment (all values are 0.0).",
    };
  }

  return {
    quality: "real",
    summary: "Slice has non-zero sentiment values, but exact row-level source metadata was not stored.",
  };
}

function combineProvenance(
  trends: { quality: ReplayInputQuality; summary: string },
  sentiment: { quality: ReplayInputQuality; summary: string }
): ReplayInputProvenance {
  let overallQuality: ReplayInputQuality = "unknown";
  let overallLabel = "Unknown provenance";
  let overallSummary =
    "Exact row-level source metadata was not stored for this slice.";

  if (trends.quality === "real" && sentiment.quality === "real") {
    overallQuality = "real";
    overallLabel = "Mostly real inputs";
    overallSummary =
      "Both Trends and sentiment look usable for this as-of date.";
  } else if (
    trends.quality === "fallback" &&
    sentiment.quality === "fallback"
  ) {
    overallQuality = "fallback";
    overallLabel = "Fallback inputs";
    overallSummary =
      "Both Trends and sentiment look fallback-backed for this as-of date.";
  } else if (
    trends.quality === "partial" ||
    sentiment.quality === "partial" ||
    trends.quality === "fallback" ||
    sentiment.quality === "fallback"
  ) {
    overallQuality = "partial";
    overallLabel = "Mixed / partial inputs";
    overallSummary =
      "One or both side inputs were thin, fallback, or only partly usable on this date.";
  }

  return {
    overallQuality,
    overallLabel,
    overallSummary,
    trendsQuality: trends.quality,
    trendsSummary: trends.summary,
    sentimentQuality: sentiment.quality,
    sentimentSummary: sentiment.summary,
  };
}

/**
 * Build one replay row per trading day once rolling SMA warmup is satisfied.
 * Signal and preset use only `sorted[0..i]`; forwards read `sorted[i+1..]` only for outcomes.
 */
export function buildReplayCatalog(
  sortedInput: DailyRow[],
  sourceCsvHint: string,
  priceColumnUsed: PriceColumnUsed,
  pipeline: PipelineContext | null = null
): ReplayCatalog {
  const sorted = [...sortedInput].sort((a, b) =>
    compareIsoDates(a.date, b.date)
  );
  const n = sorted.length;
  const healthFull = buildDataHealthReport(sorted, sourceCsvHint, priceColumnUsed);
  const { base: baseCurrency, quote: quoteCurrency } = parsePair(healthFull.pairId);

  const days: ReplayDayEntry[] = [];
  const MIN_ROWS = 30;
  if (n >= MIN_ROWS) {
    const startI = replayStartIndex(n);
    if (startI >= 0 && startI < n) {
      for (let i = startI; i < n; i++) {
        const slice = sorted.slice(0, i + 1);
        const variant = runVariantComparison(slice);
        const bundle = buildAnalystBundle(slice, variant, sourceCsvHint, {});
        const leadingPresetId = pickLeadingPresetIdFromBundle(bundle);
        const preset = getPresetById(leadingPresetId);
        const enriched = enrichRows(slice, preset?.enrich ?? {});
        const lastRow = enriched[enriched.length - 1]!;
        const latestSignal = lastRow.signal;
        const healthSlice = buildDataHealthReport(
          slice,
          sourceCsvHint,
          priceColumnUsed
        );
        const tail =
          bundle.tailDailyPanel.length > 0
            ? bundle.tailDailyPanel[bundle.tailDailyPanel.length - 1]
            : undefined;
        const whyBullets = buildOperatorWhyBullets(bundle, healthSlice, tail);
        const leanHeadline = buildLeanHeadlineForSignal(
          healthFull.pairId,
          latestSignal
        );
        const fragile = Boolean(
          bundle.rollingStability?.bestSharpeLeaderChangesAcrossWindows
        );
        const forwards = buildForwards(sorted, i, latestSignal);
        const trendsProvenance = buildTrendsProvenance(
          slice,
          healthSlice.pctRowsWithTrendsWow,
          pipeline
        );
        const sentimentProvenance = buildSentimentProvenance(slice, pipeline);

        days.push({
          asOfDate: sorted[i]!.date,
          rowIndex: i,
          leadingPresetId,
          latestSignal,
          leanHeadline,
          whyBullets,
          fragile,
          entryRate: sorted[i]!.audusd_close,
          forwards,
          illustrativePnls: buildIllustrative(latestSignal, forwards),
          pctRowsWithTrendsWow: healthSlice.pctRowsWithTrendsWow,
          sentimentScore: lastRow.sentiment_score,
          sentimentZ: tail?.sentimentZ ?? null,
          provenance: combineProvenance(trendsProvenance, sentimentProvenance),
        });
      }
    }
  }

  const firstReplayDate = days.length > 0 ? days[0]!.asOfDate : "";
  const lastReplayDate = days.length > 0 ? days[days.length - 1]!.asOfDate : "";

  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    pairId: healthFull.pairId,
    priceColumnUsed,
    baseCurrency,
    quoteCurrency,
    firstReplayDate,
    lastReplayDate,
    trustDisclaimer:
      "As-of replay uses only rows through the selected date for the lean and preset choice. Replay trust labels are estimated from the as-of slice plus pipeline context when available; exact row-level source metadata is not stored yet.",
    historicalPaperDisclaimer:
      "Forward moves are historical paper math on merged CSV closes (next1 / 5 / 10 trading rows). Not a brokerage record; ignores spreads, fees, slippage, and leverage.",
    headlineSlots: {
      australiaVsNewZealand:
        "Placeholder - store AU vs NZ headline buckets later for side-by-side replay.",
      rbaVsRbnz:
        "Placeholder - RBA vs RBNZ theme comparison not wired in this build.",
      riskOffUsdDominance:
        "Placeholder - risk-off / USD-dominance warning slot for future macro overlays.",
    },
    days,
  };
}
