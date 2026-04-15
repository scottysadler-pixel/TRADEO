/**
 * Analyst bundle: structured JSON + markdown for **external AI review** and
 * non-typical diagnostics (not standard TA package fare).
 */
import { simpleMovingAverage } from "../indicators/movingAverage.js";
import type { DailyRow } from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";
import { computeDreamScenarios, type DreamScenarios } from "./dreamScenarios.js";
import { mean, pearson, std } from "./stats.js";
import type { VariantComparisonResult } from "./variantComparison.js";

export const ANALYST_BUNDLE_VERSION = 2;

export interface VariantTableRow {
  id: string;
  label: string;
  totalPnl: number;
  trades: number;
  sharpeAnnualized: number | null;
  maxDrawdown: number;
  profitFactor: number;
  winRate: number;
  buyHoldPnl: number;
}

export interface ExploratoryCorrelations {
  sentiment_vs_fwdReturn1d: number | null;
  sentiment_vs_fwdReturn5d: number | null;
  sentiment_vs_fwdReturn10d: number | null;
  trends_wow_vs_fwdReturn5d: number | null;
}

export interface PeriodSlice {
  periodLabel: "pre" | "post";
  rowCount: number;
  firstDate: string;
  lastDate: string;
  buyHoldPnl: number;
  variantTable: VariantTableRow[];
  exploratoryCorrelations: ExploratoryCorrelations;
}

export interface PresetStabilityRow {
  presetId: string;
  sharpePre: number | null;
  sharpePost: number | null;
  /** Both finite and strictly same sign (incl. zero), else null. */
  sharpeSameSign: boolean | null;
  totalPnlPre: number;
  totalPnlPost: number;
}

export interface RegimeSplitBlock {
  splitDateIso: string;
  chosenBy: "auto_mid_row" | "cli";
  pre: PeriodSlice;
  post: PeriodSlice;
  stability: PresetStabilityRow[];
  lowSampleWarning: boolean;
  minRowsRecommended: number;
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
  exploratoryCorrelations: ExploratoryCorrelations;
  unconventional: {
    panicAttentionDays: number;
    regimeWildShare: number;
    meanAbsRet1dWhenSentimentExtreme: number | null;
    meanAbsRet1dWhenSentimentMiddle: number | null;
  };
  variantTable: VariantTableRow[];
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
  dreamScenarios: DreamScenarios;
  /** Omitted when `--no-split` or insufficient rows. */
  regimeSplit?: RegimeSplitBlock;
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

function buildExploratoryCorrelations(sorted: DailyRow[]): ExploratoryCorrelations {
  const n = sorted.length;
  const closes = sorted.map((r) => r.audusd_close);
  const sentiments = sorted.map((r) => r.sentiment_score);
  const wows = sorted.map((r) => r.trends_wow);

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

  const w5: number[] = [];
  const wf5: number[] = [];
  for (let i = 0; i < n - 5; i++) {
    const w = wows[i];
    if (w === null) continue;
    w5.push(w);
    wf5.push(closes[i + 5]! - closes[i]!);
  }

  return {
    sentiment_vs_fwdReturn1d: pearson(s1, f1),
    sentiment_vs_fwdReturn5d: pearson(s5, f5),
    sentiment_vs_fwdReturn10d: pearson(s10, f10),
    trends_wow_vs_fwdReturn5d: pearson(w5, wf5),
  };
}

function variantTableFromResult(
  variantResult: VariantComparisonResult
): VariantTableRow[] {
  const buyHold = variantResult.buyHoldPnl;
  return variantResult.series.map((s) => ({
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
}

function buildPeriodSlice(
  daily: DailyRow[],
  variantResult: VariantComparisonResult,
  label: "pre" | "post"
): PeriodSlice {
  const sorted = [...daily].sort((a, b) => compareIsoDates(a.date, b.date));
  const n = sorted.length;
  const first = n ? sorted[0]!.date : "";
  const last = n ? sorted[n - 1]!.date : "";
  const buyHold =
    n > 0 ? sorted[n - 1]!.audusd_close - sorted[0]!.audusd_close : 0;
  return {
    periodLabel: label,
    rowCount: n,
    firstDate: first,
    lastDate: last,
    buyHoldPnl: buyHold,
    variantTable: variantTableFromResult(variantResult),
    exploratoryCorrelations: buildExploratoryCorrelations(sorted),
  };
}

function buildStability(
  pre: VariantComparisonResult,
  post: VariantComparisonResult
): PresetStabilityRow[] {
  const rows: PresetStabilityRow[] = [];
  for (const ps of pre.series) {
    const po = post.series.find((s) => s.id === ps.id);
    if (!po) continue;
    const sharpePre = Number.isFinite(ps.summary.sharpeAnnualized)
      ? ps.summary.sharpeAnnualized
      : null;
    const sharpePost = Number.isFinite(po.summary.sharpeAnnualized)
      ? po.summary.sharpeAnnualized
      : null;
    let sharpeSameSign: boolean | null = null;
    if (sharpePre !== null && sharpePost !== null) {
      sharpeSameSign =
        (sharpePre >= 0 && sharpePost >= 0) ||
        (sharpePre < 0 && sharpePost < 0);
    }
    rows.push({
      presetId: ps.id,
      sharpePre,
      sharpePost,
      sharpeSameSign,
      totalPnlPre: ps.summary.totalPnl,
      totalPnlPost: po.summary.totalPnl,
    });
  }
  return rows;
}

const MIN_ROWS_SPLIT = 30;

export interface BuildAnalystBundleOptions {
  regimeSplit?: {
    splitDateIso: string;
    chosenBy: "auto_mid_row" | "cli";
    preDaily: DailyRow[];
    postDaily: DailyRow[];
    preVariant: VariantComparisonResult;
    postVariant: VariantComparisonResult;
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

function countSameSignStability(stability: PresetStabilityRow[]): string {
  const ok = stability.filter((r) => r.sharpeSameSign === true).length;
  const bad = stability.filter((r) => r.sharpeSameSign === false).length;
  const unk = stability.filter((r) => r.sharpeSameSign === null).length;
  return `sameSignSharpe ${ok}/${stability.length} (flip=${bad}, unknown=${unk})`;
}

export function buildAnalystBundle(
  sortedInput: DailyRow[],
  variantResult: VariantComparisonResult,
  sourceCsvHint: string,
  options: BuildAnalystBundleOptions = {}
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
  const variantTable = variantTableFromResult(variantResult);
  const exploratoryCorrelations = buildExploratoryCorrelations(sorted);
  const dreamScenarios = computeDreamScenarios(sorted);

  let regimeSplit: RegimeSplitBlock | undefined;
  if (options.regimeSplit) {
    const rs = options.regimeSplit;
    const preN = rs.preDaily.length;
    const postN = rs.postDaily.length;
    const lowSampleWarning = preN < MIN_ROWS_SPLIT || postN < MIN_ROWS_SPLIT;
    const stability = buildStability(rs.preVariant, rs.postVariant);
    regimeSplit = {
      splitDateIso: rs.splitDateIso,
      chosenBy: rs.chosenBy,
      pre: buildPeriodSlice(rs.preDaily, rs.preVariant, "pre"),
      post: buildPeriodSlice(rs.postDaily, rs.postVariant, "post"),
      stability,
      lowSampleWarning,
      minRowsRecommended: MIN_ROWS_SPLIT,
    };
  }

  const llmBrief = [
    `AUD/USD alt-data analyst bundle v${ANALYST_BUNDLE_VERSION}.`,
    `Rows=${n}, dates ${first}..${last}, span~${spanDays}d.`,
    `Buy-hold PnL (rate)=${buyHold.toFixed(5)}.`,
    `Sentiment std=${std(sentiments).toFixed(4)}; ${((wowCount / n) * 100).toFixed(0)}% rows have trends_wow.`,
    `Exploratory Pearson: sentiment vs fwd1d=${exploratoryCorrelations.sentiment_vs_fwdReturn1d?.toFixed(3) ?? "n/a"}, fwd5d=${exploratoryCorrelations.sentiment_vs_fwdReturn5d?.toFixed(3) ?? "n/a"}, fwd10d=${exploratoryCorrelations.sentiment_vs_fwdReturn10d?.toFixed(3) ?? "n/a"}; wow vs fwd5d=${exploratoryCorrelations.trends_wow_vs_fwdReturn5d?.toFixed(3) ?? "n/a"} (NOT causal).`,
    `Unconventional: panicAttentionDays=${panicAttentionDays}, regimeWildShare=${(regimeWildShare * 100).toFixed(1)}%.`,
    `Dream scenarios: ghostAttention days=${dreamScenarios.ghostAttention.count}; strength+coolSearch count=${dreamScenarios.strengthWhileSearchCools.count}.`,
    regimeSplit
      ? `Regime split @ ${regimeSplit.splitDateIso} (${regimeSplit.chosenBy}): ${countSameSignStability(regimeSplit.stability)}${regimeSplit.lowSampleWarning ? " [LOW_SAMPLE]" : ""}.`
      : "No regime split in this export (use default trial or drop --no-split).",
    `Best Sharpe (full sample, finite): ${pickBestSharpeLabel(variantResult)}.`,
    "Ask the receiving model: multiple-testing risk, whether pre/post stability matters for your favorite preset, and one falsifiable next experiment.",
  ].join("\n");

  return {
    bundleVersion: ANALYST_BUNDLE_VERSION,
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
    exploratoryCorrelations,
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
    dreamScenarios,
    regimeSplit,
  };
}

export function formatAnalystMarkdown(bundle: AnalystBundle): string {
  const lines: string[] = [
    "# Analyst export (for a second AI)",
    "",
    "Paste **this file** plus **`output/analyst_bundle.json`** into another model. Ask it to critique overfitting, pre/post stability, and dream-scenario multiple testing.",
    "",
    "## Brief",
    "",
    "```",
    bundle.llmBrief,
    "```",
    "",
    "## Variant table (full sample)",
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
  lines.push("```", "", "## Dream scenarios (hypothesis prompts only)", "", "```json");
  lines.push(JSON.stringify(bundle.dreamScenarios, null, 2));
  lines.push("```");

  if (bundle.regimeSplit) {
    lines.push(
      "",
      "## Regime split (pre vs post)",
      "",
      `Split date: **${bundle.regimeSplit.splitDateIso}** (${bundle.regimeSplit.chosenBy})` +
        (bundle.regimeSplit.lowSampleWarning
          ? ` — warning: each half should ideally have ≥ ${bundle.regimeSplit.minRowsRecommended} rows.`
          : ""),
      "",
      "### Pre-split variant table",
      "",
      "```json",
      JSON.stringify(bundle.regimeSplit.pre.variantTable, null, 2),
      "```",
      "",
      "### Post-split variant table",
      "",
      "```json",
      JSON.stringify(bundle.regimeSplit.post.variantTable, null, 2),
      "```",
      "",
      "### Sharpe stability (same preset, two eras)",
      "",
      "```json",
      JSON.stringify(bundle.regimeSplit.stability, null, 2),
      "```"
    );
  }

  lines.push("", "## Tail daily panel (last rows)", "");
  lines.push("See `analyst_bundle.json` → `tailDailyPanel` for structured rows.");
  return lines.join("\n");
}
