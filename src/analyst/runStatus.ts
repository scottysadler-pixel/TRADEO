/**
 * Pipeline + trial run metadata for dashboard and `npm run doctor`.
 */
import type { AnalystBundle } from "./bundle.js";
import type { DataHealthReport } from "./dataHealth.js";

export const PIPELINE_CONTEXT_FILENAME = "_pipeline_context.json";
export const RUN_STATUS_FILENAME = "run_status.json";

export type TrendsSource =
  | "google_trends_pytrends"
  | "synthetic_flat_python_failed"
  | "synthetic_flat_no_python";

export type SentimentSource =
  | "python_fetchSentiment"
  | "synthetic_neutral_python_failed"
  | "synthetic_neutral_no_python";

export interface PairRankingEntry {
  pairId: string;
  mergedCsv: string;
  rowCount: number;
  bestPresetId: string;
  bestSharpe: number | null;
  bestTotalPnl: number;
  dataQualityNote: string;
}

/** Written by `npm run go` before `trial`; read by trial into final `run_status.json`. */
export interface PipelineContext {
  schemaVersion: 1;
  writtenAt: string;
  priceSource: "frankfurter";
  trendsSource: TrendsSource;
  sentimentSource: SentimentSource;
  pythonDetected: boolean;
  newsApiKeySet: boolean;
  geminiApiKeySet: boolean;
  pricesRowCount: number;
  mergedRowCount: number;
  mergedPath: string;
  primaryPairId: string;
  warnings: string[];
  pairRanking?: PairRankingEntry[];
}

export interface RunStatus {
  schemaVersion: 2;
  trialFinishedAt: string;
  sourceCsv: string;
  bundleVersion: number;
  dataHealthOk: boolean;
  top3BySharpe: {
    id: string;
    label: string;
    sharpe: number | null;
    totalPnl: number;
  }[];
  /** Null when you ran `npm run trial` without `npm run go`. */
  pipeline: PipelineContext | null;
  /**
   * Sub-steps that completed successfully this run.
   * If `npm run trial` exits early, this file is not written.
   */
  steps: {
    variantComparison: "ok";
    analystBundle: "ok";
    dataHealth: "ok";
    runStatusAndDashboard: "ok";
  };
  /** Derived from pipeline when present; null = unknown (trial-only, no `npm run go`). */
  fallbackFlags: {
    trendsSynthetic: boolean | null;
    sentimentNeutralFallback: boolean | null;
  };
  /** Data-health warnings plus pipeline warnings from `npm run go`. */
  warnings: string[];
  rowCounts: {
    sourceCsvRows: number;
    pipelinePricesRows: number | null;
    pipelineMergedRows: number | null;
  };
}

export function buildRunStatus(
  pipeline: PipelineContext | null,
  bundle: AnalystBundle,
  health: DataHealthReport,
  sourceCsv: string
): RunStatus {
  const table = [...bundle.variantTable].filter((r) =>
    Number.isFinite(r.sharpeAnnualized)
  );
  table.sort((a, b) => (b.sharpeAnnualized ?? -999) - (a.sharpeAnnualized ?? -999));
  const top3 = table.slice(0, 3).map((r) => ({
    id: r.id,
    label: r.label,
    sharpe: r.sharpeAnnualized,
    totalPnl: r.totalPnl,
  }));

  const fallbackFlags =
    pipeline === null
      ? { trendsSynthetic: null, sentimentNeutralFallback: null }
      : {
          trendsSynthetic: pipeline.trendsSource !== "google_trends_pytrends",
          sentimentNeutralFallback:
            pipeline.sentimentSource !== "python_fetchSentiment",
        };

  const warnings = [...health.warnings, ...(pipeline?.warnings ?? [])];

  return {
    schemaVersion: 2,
    trialFinishedAt: new Date().toISOString(),
    sourceCsv,
    bundleVersion: bundle.bundleVersion,
    dataHealthOk: health.ok,
    top3BySharpe: top3,
    pipeline,
    steps: {
      variantComparison: "ok",
      analystBundle: "ok",
      dataHealth: "ok",
      runStatusAndDashboard: "ok",
    },
    fallbackFlags,
    warnings,
    rowCounts: {
      sourceCsvRows: health.rowCount,
      pipelinePricesRows: pipeline?.pricesRowCount ?? null,
      pipelineMergedRows: pipeline?.mergedRowCount ?? null,
    },
  };
}
