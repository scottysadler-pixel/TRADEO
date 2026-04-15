/**
 * Exploratory "dream" scenarios — **not** claimed edges; event-style counts and
 * forward summaries for a second model to critique (survivorship, multiple testing, etc.).
 */
import type { DailyRow } from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";
import { mean, pearson, std } from "./stats.js";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[idx]!;
}

function sortedCopy(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

export interface DreamScenarios {
  /** Same-day search spike but price barely moved — narrative "empty calories" attention. */
  ghostAttention: {
    count: number;
    meanFwdRet1d: number | null;
    meanFwdRet5d: number | null;
    note: string;
  };
  /** 5d price gain while WoW negative — "strength while search cools". */
  strengthWhileSearchCools: {
    count: number;
    meanFwdRet10d: number | null;
    note: string;
  };
  /** 5d price drop while WoW positive — "weakness into rising curiosity". */
  weaknessWhileSearchHeats: {
    count: number;
    meanFwdRet10d: number | null;
    note: string;
  };
  /** Days with very cold sentiment — crude fear event study. */
  afterSentimentVeryCold: {
    threshold: number;
    events: number;
    meanFwdRet1d: number | null;
    meanFwdRet5d: number | null;
    note: string;
  };
  /** Very hot sentiment — euphoria bar study. */
  afterSentimentVeryHot: {
    threshold: number;
    events: number;
    meanFwdRet1d: number | null;
    meanFwdRet5d: number | null;
    note: string;
  };
  /** Simple calendar curiosity (UTC weekday of `date`). */
  weekdayMeanRet1d: Record<string, number | null>;
  /** When 20d rolling sentiment volatility is in its upper tail — "headline chaos" regime. */
  sentimentVolRegime: {
    highChaosDays: number;
    meanAbsRet1dOnHighChaos: number | null;
    meanAbsRet1dOnCalm: number | null;
    note: string;
  };
  /** Rank correlation style: attention level vs next-day absolute move. */
  trendsIndexLevelVsNextAbsMove: number | null;
}

function fwdRet(
  closes: number[],
  i: number,
  h: number
): number | null {
  if (i + h >= closes.length) return null;
  return closes[i + h]! - closes[i]!;
}

export function computeDreamScenarios(sortedInput: DailyRow[]): DreamScenarios {
  const sorted = [...sortedInput].sort((a, b) =>
    compareIsoDates(a.date, b.date)
  );
  const n = sorted.length;
  const closes = sorted.map((r) => r.audusd_close);
  const sentiments = sorted.map((r) => r.sentiment_score);
  const wows = sorted.map((r) => r.trends_wow);
  const trendsIdx = sorted.map((r) => r.trends_index);

  const ret1: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) ret1.push(0);
    else ret1.push(closes[i]! - closes[i - 1]!);
  }

  const absWows = wows
    .filter((w): w is number => w !== null)
    .map((w) => Math.abs(w));
  const absR = ret1.slice(1).map((r) => Math.abs(r));
  const wowP75 = absWows.length ? percentile(sortedCopy(absWows), 0.75) : 0;
  const absRetP25 = absR.length ? percentile(sortedCopy(absR), 0.25) : 0;

  const ghostIdx: number[] = [];
  for (let i = 1; i < n; i++) {
    const w = wows[i];
    if (w === null) continue;
    if (Math.abs(w) >= wowP75 && Math.abs(ret1[i]!) <= absRetP25) {
      ghostIdx.push(i);
    }
  }
  const ghostFwd1 = ghostIdx
    .map((i) => fwdRet(closes, i, 1))
    .filter((x): x is number => x !== null);
  const ghostFwd5 = ghostIdx
    .map((i) => fwdRet(closes, i, 5))
    .filter((x): x is number => x !== null);

  const coolIdx: number[] = [];
  for (let i = 5; i < n - 10; i++) {
    const w = wows[i];
    if (w === null) continue;
    if (closes[i]! > closes[i - 5]! && w < 0) coolIdx.push(i);
  }
  const coolFwd = coolIdx
    .map((i) => fwdRet(closes, i, 10))
    .filter((x): x is number => x !== null);

  const heatIdx: number[] = [];
  for (let i = 5; i < n - 10; i++) {
    const w = wows[i];
    if (w === null) continue;
    if (closes[i]! < closes[i - 5]! && w > 0) heatIdx.push(i);
  }
  const heatFwd = heatIdx
    .map((i) => fwdRet(closes, i, 10))
    .filter((x): x is number => x !== null);

  const coldTh = -0.28;
  const hotTh = 0.28;
  const coldIdx: number[] = [];
  const hotIdx: number[] = [];
  for (let i = 0; i < n - 5; i++) {
    if (sentiments[i]! < coldTh) coldIdx.push(i);
    if (sentiments[i]! > hotTh) hotIdx.push(i);
  }
  const cold1 = coldIdx
    .map((i) => fwdRet(closes, i, 1))
    .filter((x): x is number => x !== null);
  const cold5 = coldIdx
    .map((i) => fwdRet(closes, i, 5))
    .filter((x): x is number => x !== null);
  const hot1 = hotIdx
    .map((i) => fwdRet(closes, i, 1))
    .filter((x): x is number => x !== null);
  const hot5 = hotIdx
    .map((i) => fwdRet(closes, i, 5))
    .filter((x): x is number => x !== null);

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byWd: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < n; i++) {
    const d = new Date(sorted[i]!.date + "T12:00:00Z").getUTCDay();
    byWd[d]!.push(ret1[i]!);
  }
  const weekdayMeanRet1d: Record<string, number | null> = {};
  for (let d = 0; d < 7; d++) {
    const xs = byWd[d]!;
    weekdayMeanRet1d[weekdayNames[d]!] =
      xs.length > 0 ? mean(xs) : null;
  }

  const rollSentStd: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - 19);
    const slice = sentiments.slice(start, i + 1);
    rollSentStd.push(slice.length >= 5 ? std(slice) : 0);
  }
  const validStd = rollSentStd.filter((s) => s > 0);
  const chaosCut = validStd.length
    ? percentile(sortedCopy(validStd), 0.8)
    : 0;
  const chaosAbs: number[] = [];
  const calmAbs: number[] = [];
  for (let i = 1; i < n; i++) {
    if (rollSentStd[i]! >= chaosCut && chaosCut > 0) {
      chaosAbs.push(Math.abs(ret1[i]!));
    } else if (rollSentStd[i]! > 0 && rollSentStd[i]! < chaosCut * 0.5) {
      calmAbs.push(Math.abs(ret1[i]!));
    }
  }

  const xsTrend: number[] = [];
  const ysNextAbs: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    xsTrend.push(trendsIdx[i]!);
    ysNextAbs.push(Math.abs(ret1[i + 1]!));
  }
  const trendVsNextAbs = pearson(xsTrend, ysNextAbs);

  return {
    ghostAttention: {
      count: ghostIdx.length,
      meanFwdRet1d: ghostFwd1.length ? mean(ghostFwd1) : null,
      meanFwdRet5d: ghostFwd5.length ? mean(ghostFwd5) : null,
      note: "Adaptive: |WoW| in top quartile AND |1d return| in bottom quartile vs series.",
    },
    strengthWhileSearchCools: {
      count: coolIdx.length,
      meanFwdRet10d: coolFwd.length ? mean(coolFwd) : null,
      note: "5d price up, same-day WoW < 0; fwd = 10d close-to-close.",
    },
    weaknessWhileSearchHeats: {
      count: heatIdx.length,
      meanFwdRet10d: heatFwd.length ? mean(heatFwd) : null,
      note: "5d price down, same-day WoW > 0.",
    },
    afterSentimentVeryCold: {
      threshold: coldTh,
      events: coldIdx.length,
      meanFwdRet1d: cold1.length ? mean(cold1) : null,
      meanFwdRet5d: cold5.length ? mean(cold5) : null,
      note: "Event-time average after sentiment < threshold (overlapping windows possible).",
    },
    afterSentimentVeryHot: {
      threshold: hotTh,
      events: hotIdx.length,
      meanFwdRet1d: hot1.length ? mean(hot1) : null,
      meanFwdRet5d: hot5.length ? mean(hot5) : null,
      note: "Symmetrical hot-headline bar.",
    },
    weekdayMeanRet1d,
    sentimentVolRegime: {
      highChaosDays: chaosAbs.length,
      meanAbsRet1dOnHighChaos: chaosAbs.length ? mean(chaosAbs) : null,
      meanAbsRet1dOnCalm: calmAbs.length ? mean(calmAbs) : null,
      note: "20d rolling std(sentiment): high = >=80th pct of rolling stds; calm = <50% of cut.",
    },
    trendsIndexLevelVsNextAbsMove: trendVsNextAbs,
  };
}
