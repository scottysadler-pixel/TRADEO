/**
 * `output/py_strategy_summary.json` produced by `python aud_strategy/run.py`.
 */
export const PY_STRATEGY_SCHEMA_VERSION = 1 as const;

export interface PyStrategyMetrics {
  totalPnl: number;
  maxDrawdown: number;
  sharpeAnnualized: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgTradePnl: number;
}

export interface PyStrategyLatest {
  date: string;
  signal: string;
  sig_rate: number;
  sig_commodity: number | null;
  sig_sentiment: number;
  rate_diff: number;
  sentiment_score: number;
  commodity_momentum: number | null;
}

export interface PyStrategyDailyPreviewRow {
  date: string;
  audusd_close: number;
  rate_diff: number;
  commodity_momentum: number | null;
  sentiment_score: number;
  sig_rate: number;
  sig_commodity: number | null;
  sig_sentiment: number;
  signal: string;
}

export interface PyStrategyTrade {
  entryDate: string;
  exitDate: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  walkforwardWindow?: number;
}

export interface PyStrategySummary {
  schemaVersion: number;
  generatedAt: string;
  strategyId: string;
  mode: string;
  parameters: Record<string, number>;
  metrics: PyStrategyMetrics;
  walkforwardWindows: unknown[] | null;
  walkforwardNote: string | null;
  rowCount: number;
  latest: PyStrategyLatest;
  dailyPreview: PyStrategyDailyPreviewRow[];
  trades: PyStrategyTrade[];
  tradeCountTotal: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Parse summary JSON; returns null if invalid or wrong schema. */
export function parsePyStrategySummary(raw: unknown): PyStrategySummary | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== PY_STRATEGY_SCHEMA_VERSION) return null;
  if (typeof raw.generatedAt !== "string") return null;
  if (!isRecord(raw.metrics)) return null;
  if (!isRecord(raw.latest)) return null;
  if (!Array.isArray(raw.dailyPreview)) return null;
  if (!Array.isArray(raw.trades)) return null;
  return raw as unknown as PyStrategySummary;
}
