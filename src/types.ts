/**
 * Shared types for the daily AUD/USD backtest pipeline.
 */

export type Signal = "LONG" | "SHORT" | "FLAT";

export type PositionSide = "LONG" | "SHORT" | "FLAT";

/** How Google Trends "attention" is interpreted (see signalEngine). */
export type TrendsMode = "wow" | "sma";

/**
 * Behavioral variants — most are **not** the usual “three agree” retail pattern.
 * Use `standard` for the classic triple-lock baseline.
 */
export type SignalFlavor =
  | "standard"
  /** Only when |WoW| is large — rare bursts of attention, ignore noise. */
  | "attentionSpike"
  /** Uptrend + buzz falling, or downtrend + buzz rising — fades one-sided crowd timing. */
  | "uptrendQuietAttention"
  /** Trend + attention align, but sentiment must be **opposite** (fear for longs, greed for shorts). */
  | "contrarianFear"
  /**
   * **No Trends gate** — only price vs SMA + extreme sentiment, motivated by FX
   * “media sentiment reversal” evidence (e.g. Filippou, Taylor & Wang, 2024, JFQA: buy when
   * media tone toward the currency is very poor, sell when euphoric — simplified to one pair).
   */
  | "priceSentimentReversal";

export interface DailyRow {
  date: string;
  audusd_close: number;
  trends_index: number;
  /**
   * Week-over-week change in Trends interest (e.g. this week minus last week).
   * Required for meaningful signals when `trendsMode` is `"wow"`. Omit column → null.
   */
  trends_wow: number | null;
  sentiment_score: number;
}

export interface SignalInputs {
  price: number;
  priceSma50: number | null;
  trendsIndex: number;
  trendsSma20: number | null;
  /** WoW delta; only used when trendsMode is `"wow"`. */
  trendsWow: number | null;
  sentimentScore: number;
}

/** Config for `generateSignal` (thresholds swept in paramSweep). */
export interface SignalEngineConfig {
  trendsMode: TrendsMode;
  /** Bullish if sentiment > threshold; bearish if sentiment < -threshold (unless flavor overrides). */
  sentimentThreshold: number;
  flavor: SignalFlavor;
  /** For `attentionSpike` + wow: require |trends_wow| >= this (scale depends on your WoW series). */
  minAbsWow: number;
}

export const DEFAULT_SIGNAL_CONFIG: SignalEngineConfig = {
  trendsMode: "sma",
  sentimentThreshold: 0.25,
  flavor: "standard",
  minAbsWow: 0,
};

export interface EnrichedRow extends DailyRow {
  priceSma50: number | null;
  trendsSma20: number | null;
  signal: Signal;
}

export interface Trade {
  entryDate: string;
  exitDate: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  /** P&L in raw AUD/USD rate change per one unit of notional (see backtester comments). */
  pnl: number;
}

export interface BacktestSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  avgPnlPerTrade: number;
  maxDrawdown: number;
  /** Gross winning P&L / gross losing P&L (absolute). Infinity if no losses. */
  profitFactor: number;
  /** Per-trade expectancy in rate units. */
  expectancy: number;
  /** Trading days from first equity dip below prior peak until new peak (longest spell). */
  maxDrawdownDurationDays: number;
  /** Annualized Sharpe on daily equity changes (252-day scale). NaN if stdev 0. */
  sharpeAnnualized: number;
  /** Buy-and-hold P&L over same price path (last - first close). */
  buyHoldPnl: number;
}

/**
 * If non-null, a position is still open after the last CSV row.
 * Common when the first entry happens on the final day (no later close in-sample),
 * or when the spec skips same-bar forced exit so P&L stays realized-only.
 */
export type OpenPosition =
  | { side: "LONG" | "SHORT"; entryDate: string; entryPrice: number }
  | null;

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { date: string; equity: number }[];
  summary: BacktestSummary;
  openPosition: OpenPosition;
}
