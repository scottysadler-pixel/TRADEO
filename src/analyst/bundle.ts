/**
 * Analyst bundle: structured JSON + markdown for **external AI review** and
 * non-typical diagnostics (not standard TA package fare).
 */
import { simpleMovingAverage } from "../indicators/movingAverage.js";
import type { DailyRow } from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";
import type { VariantComparisonResult } from "./variantComparison.js";

const BUNDLE_VERSION = 1;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pearson r; null if undefined. */
function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v =
    xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return Math.sqrt(v);
}

export interface AnalystBundle {
  bundleVersion: number;
  generatedAt: string;
  sourceCsvHint: string;
  dataFingerprint: {
    rowCount: number;
    firstDate: string;
    lastDate: string;
    spanCalendarDays: number;
    audusdCloseMin: number;
    audusdCloseMax: number;
    sentimentMin: number;
    sentimentMax: number;
    sentimentStd: number;
    trendsIndexMin: number;
    trendsIndexMax: number;
    pctRowsWithTrendsWow: number;
  };
  /** Exploratory: sentiment vs *future* simple returns (not a claimed edge). */
  exploratoryCorrelations: {
    sentiment_vs_fwdReturn1d: number | null;
    sentiment_vs_fwdReturn5d: number | null;
    sentiment_vs_fwdReturn10d: number | null;
  };
  /** Non-mainstream composite: z-ish mix of fear + attention drop + recent dip. */
  unconventional: {
    /** Days where sentiment very negative AND trends_wow negative (if present). */
    panicAttentionDays: number;
    /** Share of days classified "calm" vs "wild" by vol of daily returns. */
    regimeWildShare: number;
    /** Mean absolute 1d return when sentiment extreme vs middle tertile (exploratory). */
    meanAbsRet1dWhenSentimentExtreme: number | null;
    meanAbsRet1dWhenSentimentMiddle: number | null;
  };
  variantTable: {
    id: string;
    label: string;
    totalPnl: number;
    trades: number;
    sharpeAnnualized: number | null;
    maxDrawdown: number;
    profitFactor: number;
    winRate: number;
    buyHoldPnl: number;
  }[];
  /** Last N days — feed to another model for pattern mining. */
  tailDailyPanel: {
    date: string;
    audusd_close: number;
    ret1d: number | null;
    sentiment_score: number;
    trends_index: number;
    trends_wow: number | null;
    priceAboveMa50: boolean | null;
    sentimentZ: number | null;
  }[];
  llmBrief: string;
}

function zscoreAtIndex(sorted: DailyRow[], i: number, window: number): number | null {
  const start = Math.max(0, i - window + 1);
  const slice = sorted.slice(start, i + 1).map((r) => r.sentiment_score);
  if (slice.length < 5) return null;
  const m = mean(slice);
  const s = std(slice);
  if (s === 0) return 0;
  return (sorted[i]!.sentiment_score - m) / s;
}

export function buildAnalystBundle(
  sortedInput: DailyRow[],
  variantResult: VariantComparisonResult,
  sourceCsvHint: string
): AnalystBundle {
  const sorted = [...sortedInput].sort((a, b) =>
    compareIsoDates(a.date, b.date)
  );
  const n = sorted.length;
  const closes = sorted.map((r) => r.audusd_close);
  const ma50 = simpleMovingAverage(closes, 50);
  const sentiments = sorted.map((r) => r.sentiment_score);
  const wows = sorted.map((r) => r.trends_wow);

  const ret1: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) ret1.push(0);
    else ret1.push(closes[i]! - closes[i - 1]!);
  }
  const rollStd20: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    const win = ret1.slice(start, i + 1);
    rollStd20.push(std(win));
  }
  let wild = 0;
  for (let i = 1; i < n; i++) {
    const s = rollStd20[i] ?? 0;
    if (s > 0 && Math.abs(ret1[i]!) > 1.2 * s) wild++;
  }
  const regimeWildShare = n > 1 ? wild / (n - 1) : 0;

  let panicAttentionDays = 0;
  for (const r of sorted) {
    if (r.sentiment_score < -0.25 && r.trends_wow !== null && r.trends_wow < 0) {
      panicAttentionDays++;
    }
  }

  const s1: number[] = [];
  const f1: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    s1.push(sentiments[i]!);
    f1.push(closes[i + 1]! - closes[i]!);
  }
  const s5: number[] = [];
  const f5: number[] = [];
  for (let i = 0; i < n - 5; i++) {
    s5.push(sentiments[i]!);
    f5.push(closes[i + 5]! - closes[i]!);
  }
  const s10: number[] = [];
  const f10: number[] = [];
  for (let i = 0; i < n - 10; i++) {
    s10.push(sentiments[i]!);
    f10.push(closes[i + 10]! - closes[i]!);
  }

  const tert = [...sentiments].sort((a, b) => a - b);
  const lo = tert[Math.floor(tert.length / 3)] ?? 0;
  const hi = tert[Math.floor((2 * tert.length) / 3)] ?? 0;
  const absR = ret1.map((r) => Math.abs(r));
  const extAbs: number[] = [];
  const midAbs: number[] = [];
  for (let i = 1; i < n; i++) {
    const s = sentiments[i]!;
    if (s <= lo || s >= hi) extAbs.push(absR[i]!);
    else if (s > lo && s < hi) midAbs.push(absR[i]!);
  }

  const first = sorted[0]!.date;
  const last = sorted[n - 1]!.date;
  const d0 = new Date(first + "T12:00:00Z").getTime();
  const d1 = new Date(last + "T12:00:00Z").getTime();
  const spanDays = Math.max(0, Math.round((d1 - d0) / 86400000));

  const wowCount = wows.filter((w) => w !== null).length;

  const tailN = Math.min(200, n);
  const tailStart = n - tailN;
  const tailDailyPanel: AnalystBundle["tailDailyPanel"] = [];
  for (let i = tailStart; i < n; i++) {
    const ma = ma50[i];
    tailDailyPanel.push({
      date: sorted[i]!.date,
      audusd_close: sorted[i]!.audusd_close,
      ret1d: i > 0 ? closes[i]! - closes[i - 1]! : null,
      sentiment_score: sorted[i]!.sentiment_score,
      trends_index: sorted[i]!.trends_index,
      trends_wow: sorted[i]!.trends_wow,
      priceAboveMa50: ma === null ? null : sorted[i]!.audusd_close > ma,
      sentimentZ: zscoreAtIndex(sorted, i, 60),
    });
  }

  const buyHold = variantResult.buyHoldPnl;
  const variantTable = variantResult.series.map((s) => ({
    id: s.id,
    label: s.label,
    totalPnl: s.summary.totalPnl,
    trades: s.summary.totalTrades,
    sharpeAnnualized: Number.isFinite(s.summary.sharpeAnnualized)
      ? s.summary.sharpeAnnualized
      : null,
    maxDrawdown: s.summary.maxDrawdown,
    profitFactor: s.summary.profitFactor,
    winRate:
      s.summary.totalTrades === 0
        ? 0
        : s.summary.wins / s.summary.totalTrades,
    buyHoldPnl: buyHold,
  }));

  const llmBrief = [
    `AUD/USD alt-data analyst bundle v${BUNDLE_VERSION}.`,
    `Rows=${n}, dates ${first}..${last}, span~${spanDays}d.`,
    `Buy-hold PnL (rate)=${buyHold.toFixed(5)}.`,
    `Sentiment std=${std(sentiments).toFixed(4)}; ${((wowCount / n) * 100).toFixed(0)}% rows have trends_wow.`,
    `Exploratory Pearson: sentiment vs fwd1d=${pearson(s1, f1)?.toFixed(3) ?? "n/a"}, fwd5d=${pearson(s5, f5)?.toFixed(3) ?? "n/a"}, fwd10d=${pearson(s10, f10)?.toFixed(3) ?? "n/a"} (NOT causal; for hypothesis generation).`,
    `Unconventional: panicAttentionDays=${panicAttentionDays}, regimeWildShare=${(regimeWildShare * 100).toFixed(1)}%.`,
    `Best Sharpe among presets (finite only): ${pickBestSharpeLabel(variantResult)}.`,
    "Ask the receiving model: overfitting risk, data snooping, whether any preset is stable across time splits, and what non-obvious experiment to run next.",
  ].join("\n");

  return {
    bundleVersion: BUNDLE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceCsvHint,
    dataFingerprint: {
      rowCount: n,
      firstDate: first,
      lastDate: last,
      spanCalendarDays: spanDays,
      audusdCloseMin: Math.min(...closes),
      audusdCloseMax: Math.max(...closes),
      sentimentMin: Math.min(...sentiments),
      sentimentMax: Math.max(...sentiments),
      sentimentStd: std(sentiments),
      trendsIndexMin: Math.min(...sorted.map((r) => r.trends_index)),
      trendsIndexMax: Math.max(...sorted.map((r) => r.trends_index)),
      pctRowsWithTrendsWow: n ? (wowCount / n) * 100 : 0,
    },
    exploratoryCorrelations: {
      sentiment_vs_fwdReturn1d: pearson(s1, f1),
      sentiment_vs_fwdReturn5d: pearson(s5, f5),
      sentiment_vs_fwdReturn10d: pearson(s10, f10),
    },
    unconventional: {
      panicAttentionDays,
      regimeWildShare,
      meanAbsRet1dWhenSentimentExtreme:
        extAbs.length > 0 ? mean(extAbs) : null,
      meanAbsRet1dWhenSentimentMiddle:
        midAbs.length > 0 ? mean(midAbs) : null,
    },
    variantTable,
    tailDailyPanel,
    llmBrief,
  };
}

function pickBestSharpeLabel(v: VariantComparisonResult): string {
  let best = "";
  let bestS = -Infinity;
  for (const s of v.series) {
    const sh = s.summary.sharpeAnnualized;
    if (typeof sh === "number" && Number.isFinite(sh) && sh > bestS) {
      bestS = sh;
      best = s.id;
    }
  }
  return best ? `${best} (${bestS.toFixed(3)})` : "none finite";
}

export function formatAnalystMarkdown(bundle: AnalystBundle): string {
  const lines: string[] = [
    "# Analyst export (for a second AI)",
    "",
    "Paste **this file** plus **`output/analyst_bundle.json`** into another model. Ask it to critique overfitting, suggest one next experiment, and flag data weaknesses.",
    "",
    "## Brief",
    "",
    "```",
    bundle.llmBrief,
    "```",
    "",
    "## Variant table",
    "",
    "| id | label | totalPnl | trades | sharpe | maxDD | winRate |",
    "|---|------|---------:|-------:|-------:|------:|--------:|",
  ];
  for (const r of bundle.variantTable) {
    lines.push(
      `| ${r.id} | ${r.label} | ${r.totalPnl.toFixed(5)} | ${r.trades} | ${r.sharpeAnnualized?.toFixed(3) ?? "—"} | ${r.maxDrawdown.toFixed(5)} | ${(r.winRate * 100).toFixed(0)}% |`
    );
  }
  lines.push("", "## Data fingerprint", "", "```json");
  lines.push(JSON.stringify(bundle.dataFingerprint, null, 2));
  lines.push("```", "", "## Exploratory correlations (not advice)", "", "```json");
  lines.push(JSON.stringify(bundle.exploratoryCorrelations, null, 2));
  lines.push("```", "", "## Unconventional diagnostics", "", "```json");
  lines.push(JSON.stringify(bundle.unconventional, null, 2));
  lines.push("```", "", "## Tail daily panel (last rows)", "");
  lines.push("See `analyst_bundle.json` → `tailDailyPanel` for structured rows.");
  return lines.join("\n");
}
