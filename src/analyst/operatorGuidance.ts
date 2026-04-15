/**
 * Beginner-friendly operator view: current lean, why, paper what-ifs, trust/caution.
 */
import type { AnalystBundle } from "./bundle.js";
import type { DataHealthReport } from "./dataHealth.js";
import { enrichRows } from "../pipeline.js";
import { getPresetById } from "../strategy/presets.js";
import type { DailyRow, Signal } from "../types.js";
import type { PipelineContext, RunStatus } from "./runStatus.js";

export interface DailyLogRow {
  date: string;
  rate: number;
  signal: Signal;
  trendsMode: string;
  note: string;
}

export interface OperatorGuidance {
  pairLabel: string;
  baseCurrency: string;
  quoteCurrency: string;
  leadingPresetId: string;
  leadingPresetLabel: string;
  currentLeanHeadline: string;
  latestSignal: Signal;
  whyBullets: string[];
  cautionBullets: string[];
  trustSummary: string;
  recentOneDayPaper: string | null;
  dailyLogYesterday: string | null;
  dailyLogHistory: string | null;
  dailyLogExamples: string | null;
  helpHtml: string;
  overridePlaceholderHtml: string;
}

const EXAMPLE_NOTIONALS = [500, 2000, 5000] as const;

export function parsePair(pairId: string): { base: string; quote: string } {
  const id = pairId.trim().toUpperCase();
  const known: Record<string, { base: string; quote: string }> = {
    AUDUSD: { base: "AUD", quote: "USD" },
    NZDUSD: { base: "NZD", quote: "USD" },
    EURUSD: { base: "EUR", quote: "USD" },
    GBPUSD: { base: "GBP", quote: "USD" },
  };
  return known[id] ?? { base: "base", quote: "quote" };
}

export function pnlPerUnit(
  signal: Signal,
  entryRate: number,
  exitRate: number
): number {
  if (signal === "LONG") return exitRate - entryRate;
  if (signal === "SHORT") return entryRate - exitRate;
  return 0;
}

export function parseDailyLog(csv: string): DailyLogRow[] | null {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0]!.toLowerCase();
  if (!header.includes("date") || !header.includes("signal")) return null;
  const out: DailyLogRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(",");
    if (parts.length < 4) continue;
    const date = parts[0]!.trim();
    const rate = Number(parts[1]!.trim());
    const sig = parts[2]!.trim().toUpperCase();
    if (sig !== "LONG" && sig !== "SHORT" && sig !== "FLAT") continue;
    if (!Number.isFinite(rate)) continue;
    out.push({
      date,
      rate,
      signal: sig as Signal,
      trendsMode: parts[3]!.trim(),
      note: parts.slice(4).join(",").trim(),
    });
  }
  return out.length > 0 ? out : null;
}

export function pickLeadingPresetIdFromBundle(bundle: AnalystBundle): string {
  const rolling = [...bundle.rollingSnapshots].sort(
    (a, b) => a.windowDays - b.windowDays
  );
  for (const r of rolling) {
    if (r.bestSharpePresetId) return r.bestSharpePresetId;
  }
  const top = [...bundle.variantTable]
    .filter((r) => typeof r.sharpeAnnualized === "number" && Number.isFinite(r.sharpeAnnualized))
    .sort((a, b) => (b.sharpeAnnualized ?? -999) - (a.sharpeAnnualized ?? -999))[0];
  if (top) return top.id;
  return "mainstreamTriple";
}

function pickLeadingPresetId(
  bundle: AnalystBundle,
  runStatus: RunStatus
): string {
  const fromBundle = pickLeadingPresetIdFromBundle(bundle);
  if (fromBundle) return fromBundle;
  const top = runStatus.top3BySharpe[0];
  if (top) return top.id;
  return "mainstreamTriple";
}

export function buildLeanHeadlineForSignal(
  pairId: string,
  signal: Signal
): string {
  const { base, quote } = parsePair(pairId);
  return leanHeadline(pairId, base, quote, signal);
}

function leanHeadline(
  pairLabel: string,
  base: string,
  quote: string,
  signal: Signal
): string {
  if (signal === "FLAT") {
    return `Current lean: no strong edge right now (latest signal is FLAT on ${pairLabel}).`;
  }
  if (signal === "LONG") {
    return `Current lean: prefer ${base} over ${quote} (paper view: long ${pairLabel} — rate ${base} per ${quote}).`;
  }
  return `Current lean: prefer ${quote} over ${base} (paper view: short ${pairLabel} — expect weaker ${base} vs ${quote}).`;
}

/** Exported for historical replay (as-of health slice). */
export function buildOperatorWhyBullets(
  bundle: AnalystBundle,
  health: DataHealthReport,
  tail: AnalystBundle["tailDailyPanel"][number] | undefined
): string[] {
  const reasons: string[] = [];
  if (tail?.ret1d !== null && tail?.ret1d !== undefined) {
    const r = tail.ret1d;
    if (Math.abs(r) >= 1e-6) {
      reasons.push(
        `Latest daily move in the loaded CSV: ${r >= 0 ? "up" : "down"} (${r.toFixed(5)} ${health.priceColumnUsed === "fx_close" ? "fx_close" : "rate"} units day-over-day).`
      );
    }
  }
  if (tail && tail.priceAboveMa50 !== null) {
    reasons.push(
      tail.priceAboveMa50
        ? "Price is above its ~50-day average in this sample (simple trend filter)."
        : "Price is below its ~50-day average in this sample (simple trend filter)."
    );
  }
  if (tail?.sentimentZ !== null && tail?.sentimentZ !== undefined) {
    const z = tail.sentimentZ;
    if (z >= 0.8) {
      reasons.push("Sentiment is warmer than its recent norm (rolling z-score).");
    } else if (z <= -0.8) {
      reasons.push("Sentiment is cooler than its recent norm (rolling z-score).");
    } else {
      reasons.push("Sentiment is near its recent norm (not an extreme mood read).");
    }
  }
  const st = bundle.rollingStability;
  if (st) {
    if (st.bestSharpeLeaderChangesAcrossWindows) {
      reasons.push(
        "Recent-window leaders disagree — the “best preset” is not stable across 60/120/252 rows."
      );
    } else if (st.windowCount > 0) {
      reasons.push(
        "Recent-window leaders agree on the same best-Sharpe preset (still a small-sample effect)."
      );
    }
  }
  if (reasons.length < 2 && health.pctRowsWithTrendsWow < 50) {
    reasons.push(
      "Many rows lack Trends week-over-week — attention-based rules may stay FLAT often."
    );
  }
  if (reasons.length < 2) {
    reasons.push(
      `Dataset span: ${health.rowCount} rows, ~${health.spanCalendarDays} calendar days.`
    );
  }
  return reasons.slice(0, 4);
}

function buildCautionBullets(
  pipeline: PipelineContext | null,
  runStatus: RunStatus,
  health: DataHealthReport,
  bundle: AnalystBundle
): string[] {
  const c: string[] = [];
  const ff = runStatus.fallbackFlags;
  if (ff.trendsSynthetic === true) {
    c.push("Trends are synthetic or flat fallback — search-attention signals may not reflect real Google Trends.");
  }
  if (ff.sentimentNeutralFallback === true) {
    c.push("Sentiment is neutral or script fallback — headline mood may not be driving the model.");
  }
  if (ff.trendsSynthetic === null || ff.sentimentNeutralFallback === null) {
    c.push(
      "Pipeline snapshot missing — run `npm run go` once so the page can show real-vs-fallback clearly."
    );
  }
  if (bundle.rollingStability?.bestSharpeLeaderChangesAcrossWindows) {
    c.push("Fragile: best-Sharpe preset changes across rolling windows — treat any lean as tentative.");
  }
  if (!health.ok) {
    c.push("Data health warnings are present — review the Data health section.");
  }
  if (health.rowCount < 120) {
    c.push("Short history — paper metrics and recent windows will be noisy.");
  }
  if (pipeline?.warnings?.length) {
    c.push("Pipeline warnings exist — see the trust section above.");
  }
  return c;
}

function summarizeDailyLog(log: DailyLogRow[]): {
  yesterday: string | null;
  history: string | null;
  examples: string | null;
} {
  if (log.length < 2) {
    return {
      yesterday: null,
      history: null,
      examples: null,
    };
  }
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const prev = sorted[sorted.length - 2]!;
  const last = sorted[sorted.length - 1]!;
  const u = pnlPerUnit(prev.signal, prev.rate, last.rate);
  const y =
    prev.signal === "FLAT"
      ? `Paper log: on ${prev.date} the logged signal was FLAT — no directional paper move scored to ${last.date}.`
      : `Paper log: on ${prev.date} the logged signal was **${prev.signal}** at rate ${prev.rate.toFixed(5)}. Next logged close ${last.date} at ${last.rate.toFixed(5)}. Approximate move per 1 unit of base currency: **${u >= 0 ? "+" : ""}${u.toFixed(5)}** (quote terms, before spreads/fees — not a brokerage result).`;

  const lookback = Math.min(30, sorted.length - 1);
  const start = sorted.length - 1 - lookback;
  let helped = 0;
  let hurt = 0;
  let flat = 0;
  let sumU = 0;
  for (let i = start; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const p = pnlPerUnit(a.signal, a.rate, b.rate);
    if (a.signal === "FLAT") {
      flat++;
      continue;
    }
    sumU += p;
    if (p > 1e-8) helped++;
    else if (p < -1e-8) hurt++;
    else flat++;
  }
  const hist = `Paper log summary (last ${lookback} day transitions in data/daily_log.csv): **${helped}** helped, **${hurt}** hurt, **${flat}** FLAT or ~flat after a directional signal. Sum of per-unit moves over those scored transitions: **${sumU >= 0 ? "+" : ""}${sumU.toFixed(5)}** (crude; not compounded; not a brokerage track record).`;

  const exLines = EXAMPLE_NOTIONALS.map(
    (n) =>
      `  • Notional **${n}** units of base: latest logged one-step move ~ **${(u * n).toFixed(2)}** in quote terms (same crude assumption).`
  ).join("\n");
  const examples =
    prev.signal === "FLAT"
      ? null
      : `Example sizes for the latest logged one-day step only (illustrative):\n${exLines}\nThese numbers ignore spreads, fees, leverage, and timing. They are for learning the sign/magnitude only.`;

  return { yesterday: y, history: hist, examples };
}

export function buildOperatorGuidance(input: {
  daily: DailyRow[];
  bundle: AnalystBundle;
  health: DataHealthReport;
  pipeline: PipelineContext | null;
  runStatus: RunStatus;
  dailyLogCsv: string | null;
}): OperatorGuidance {
  const { base: baseCurrency, quote: quoteCurrency } = parsePair(
    input.health.pairId
  );
  const pairLabel = input.health.pairId;

  const leadingPresetId = pickLeadingPresetId(input.bundle, input.runStatus);
  const preset = getPresetById(leadingPresetId);
  const leadingPresetLabel = preset?.label ?? leadingPresetId;

  const enriched = preset
    ? enrichRows(input.daily, preset.enrich)
    : enrichRows(input.daily, {});
  const last = enriched[enriched.length - 1]!;
  const latestSignal = last.signal;

  const currentLeanHeadline = buildLeanHeadlineForSignal(
    pairLabel,
    latestSignal
  );

  const tail =
    input.bundle.tailDailyPanel.length > 0
      ? input.bundle.tailDailyPanel[input.bundle.tailDailyPanel.length - 1]
      : undefined;

  const whyBullets = buildOperatorWhyBullets(input.bundle, input.health, tail);

  const cautionBullets = buildCautionBullets(
    input.pipeline,
    input.runStatus,
    input.health,
    input.bundle
  );

  let trustSummary = "";
  if (input.pipeline) {
    trustSummary = `Trends: ${input.pipeline.trendsSource}; sentiment: ${input.pipeline.sentimentSource}.`;
  } else {
    trustSummary =
      "Trust detail incomplete until you run `npm run go` (pipeline snapshot).";
  }

  let recentOneDayPaper: string | null = null;
  if (enriched.length >= 2) {
    const prev = enriched[enriched.length - 2]!;
    const lst = enriched[enriched.length - 1]!;
    const u = pnlPerUnit(prev.signal, prev.audusd_close, lst.audusd_close);
    recentOneDayPaper =
      prev.signal === "FLAT"
        ? `Merged CSV paper check: on ${prev.date} signal was FLAT — no one-day directional score to ${lst.date}.`
        : `Merged CSV paper check (preset **${leadingPresetId}**): on ${prev.date} signal **${prev.signal}**; from close ${prev.audusd_close.toFixed(5)} to ${lst.date} close ${lst.audusd_close.toFixed(5)} → per 1 unit base ~ **${u >= 0 ? "+" : ""}${u.toFixed(5)}** quote terms (no spreads/fees).`;
  }

  let dailyLogYesterday: string | null = null;
  let dailyLogHistory: string | null = null;
  let dailyLogExamples: string | null = null;
  if (input.dailyLogCsv) {
    const parsed = parseDailyLog(input.dailyLogCsv);
    if (parsed) {
      const s = summarizeDailyLog(parsed);
      dailyLogYesterday = s.yesterday;
      dailyLogHistory = s.history;
      dailyLogExamples = s.examples;
    }
  }

  const helpHtml = `
  <h2>How to read this (beginner)</h2>
  <ul class="trust-list">
    <li><strong>LONG ${escapeHtml(pairLabel)}</strong> here means a <em>paper</em> bias that ${escapeHtml(baseCurrency)} is relatively stronger vs ${escapeHtml(quoteCurrency)} using this repo’s rules — not a buy instruction from a broker.</li>
    <li><strong>SHORT ${escapeHtml(pairLabel)}</strong> means the opposite paper bias: relatively weaker ${escapeHtml(baseCurrency)} vs ${escapeHtml(quoteCurrency)}.</li>
    <li><strong>FLAT</strong> means the rules did not see a clean directional setup — that can be healthy.</li>
    <li>Signals use <strong>price</strong>, <strong>Google Trends-style attention</strong> when available, and <strong>sentiment scores</strong> (sometimes news-backed when configured). It is <strong>not</strong> “headlines only.”</li>
    <li>All dollar examples are <strong>illustrative</strong> math on exchange-rate moves. They are not tax, legal, or personal financial advice.</li>
  </ul>`;

  const overridePlaceholderHtml = `
  <div class="override-slot">
    <strong>Macro / “big world” override:</strong> not wired to live macro feeds in this version.
    If major global stress dominates (for example broad USD demand), treat any small local signal as low priority until you add a dedicated regime check later.
  </div>`;

  return {
    pairLabel,
    baseCurrency,
    quoteCurrency,
    leadingPresetId,
    leadingPresetLabel,
    currentLeanHeadline,
    latestSignal: latestSignal,
    whyBullets,
    cautionBullets,
    trustSummary,
    recentOneDayPaper,
    dailyLogYesterday,
    dailyLogHistory,
    dailyLogExamples,
    helpHtml,
    overridePlaceholderHtml,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal `**bold**` to `<strong>` after escaping each segment. */
function mdBoldToHtml(s: string): string {
  const parts = s.split(/\*\*/);
  return parts
    .map((p, i) => (i % 2 === 1 ? `<strong>${escapeHtml(p)}</strong>` : escapeHtml(p)))
    .join("");
}

export function formatOperatorGuidancePlain(g: OperatorGuidance): string {
  const lines: string[] = [];
  lines.push("Operator view (beginner)");
  lines.push("-------------------------");
  lines.push("");
  lines.push(g.currentLeanHeadline);
  lines.push(`Preset used for latest signal: ${g.leadingPresetId} — ${g.leadingPresetLabel}.`);
  lines.push("");
  lines.push("Why (short):");
  for (const b of g.whyBullets) lines.push(`- ${b}`);
  lines.push("");
  lines.push("Trust:");
  lines.push(`- ${g.trustSummary}`);
  lines.push("");
  if (g.recentOneDayPaper) {
    lines.push("Recent paper check (merged CSV):");
    lines.push(`- ${g.recentOneDayPaper}`);
    lines.push("");
  }
  if (g.dailyLogYesterday) {
    lines.push("Daily log (data/daily_log.csv):");
    lines.push(`- ${g.dailyLogYesterday.replace(/\*\*/g, "")}`);
    lines.push("");
  }
  if (g.dailyLogHistory) {
    lines.push(g.dailyLogHistory.replace(/\*\*/g, ""));
    lines.push("");
  }
  if (g.dailyLogExamples) {
    lines.push(g.dailyLogExamples.replace(/\*\*/g, ""));
    lines.push("");
  }
  if (g.cautionBullets.length > 0) {
    lines.push("Caution:");
    for (const c of g.cautionBullets) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

export function buildOperatorGuidanceHtml(g: OperatorGuidance): string {
  const why = g.whyBullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  const caution =
    g.cautionBullets.length === 0
      ? `<p class="ok">No extra caution flags beyond normal market noise.</p>`
      : `<ul class="warn">${g.cautionBullets.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;

  const paperParts: string[] = [];
  if (g.recentOneDayPaper) {
    paperParts.push(
      `<p><strong>Merged CSV (trial file):</strong> ${mdBoldToHtml(g.recentOneDayPaper)}</p>`
    );
  }
  if (g.dailyLogYesterday) {
    paperParts.push(
      `<p><strong>Daily log:</strong> ${mdBoldToHtml(g.dailyLogYesterday)}</p>`
    );
  }
  if (g.dailyLogHistory) {
    paperParts.push(`<p>${mdBoldToHtml(g.dailyLogHistory)}</p>`);
  }
  if (g.dailyLogExamples) {
    paperParts.push(
      `<pre class="plain">${escapeHtml(g.dailyLogExamples)}</pre>`
    );
  }
  const paperBlock =
    paperParts.length > 0
      ? paperParts.join("")
      : `<p class="meta">No <code>data/daily_log.csv</code> yet — run <code>npx tsx scripts/dailyCheck.ts</code> on days you want a paper trail; then re-run <code>npm run trial</code> to refresh this section.</p>`;

  return `
  <div class="operator-hero">
    <h2>Start here</h2>
    <p class="lean">${escapeHtml(g.currentLeanHeadline)}</p>
    <p class="meta">Latest signal uses preset <code>${escapeHtml(g.leadingPresetId)}</code> (${escapeHtml(g.leadingPresetLabel)}) — chosen from recent rolling windows when available, else top Sharpe in this run.</p>
    <h3>Why it thinks that</h3>
    <ul class="why-list">${why}</ul>
    <h3>Paper “what would have happened”</h3>
    ${paperBlock}
    <h3>Trust and caution</h3>
    <p class="meta">${escapeHtml(g.trustSummary)}</p>
    ${caution}
    ${g.overridePlaceholderHtml}
  </div>`;
}
