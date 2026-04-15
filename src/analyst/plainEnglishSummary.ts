/**
 * Short human-readable summary for operators (also written to output file).
 */
import type { AnalystBundle } from "./bundle.js";
import type { DataHealthReport } from "./dataHealth.js";
import { formatOperatorGuidancePlain } from "./operatorGuidance.js";
import type { OperatorGuidance } from "./operatorGuidance.js";
import type { PipelineContext } from "./runStatus.js";

export function buildPlainEnglishSummary(
  pipeline: PipelineContext | null,
  bundle: AnalystBundle,
  health: DataHealthReport,
  guidance?: OperatorGuidance
): string {
  const lines: string[] = [];

  lines.push("What happened in this run");
  lines.push("=========================");
  lines.push("");

  if (guidance) {
    lines.push(formatOperatorGuidancePlain(guidance));
    lines.push("");
  }

  const rs = bundle.rollingStability;
  const rollingOrdered = [...bundle.rollingSnapshots].sort(
    (a, b) => a.windowDays - b.windowDays
  );
  const bestRecentPreset =
    rollingOrdered.length > 0
      ? rollingOrdered[0]!.bestSharpePresetId
      : null;
  const bestRecentSharpe =
    rollingOrdered.length > 0 ? rollingOrdered[0]!.bestSharpe : null;

  lines.push("At a glance");
  lines.push("-----------");
  if (bestRecentPreset) {
    lines.push(
      `- **Best recent preset** (shortest rolling window, ~last ${rollingOrdered[0]!.windowDays} rows): **${bestRecentPreset}**` +
        (bestRecentSharpe !== null && Number.isFinite(bestRecentSharpe)
          ? ` (Sharpe ${bestRecentSharpe.toFixed(3)})`
          : "") +
        "."
    );
  } else {
    lines.push(
      "- **Best recent preset:** not enough history for rolling windows (60+ rows) — use full-sample leader below."
    );
  }
  if (rs?.mostStableSharpePresetId) {
    lines.push(
      `- **Most stable preset** (lowest Sharpe dispersion across rolling windows): **${rs.mostStableSharpePresetId}**` +
        (rs.mostStableSharpeDispersion !== null
          ? ` (cross-window Sharpe std ~${rs.mostStableSharpeDispersion.toFixed(3)})`
          : "") +
        "."
    );
  } else {
    lines.push(
      "- **Most stable preset:** need at least two rolling windows with comparable Sharpes — see analyst_bundle.json when available."
    );
  }
  lines.push(`- **Biggest warning:** ${pickBiggestWarning(pipeline, health)}`);
  lines.push(`- **Weird angle to test:** ${pickWeirdAngle(bundle)}`);
  lines.push("");

  if (pipeline) {
    lines.push(`Data pipeline (${pipeline.writtenAt.slice(0, 19)}Z)`);
    lines.push(`- Prices: ${pipeline.priceSource} (${pipeline.pricesRowCount} rows).`);
    lines.push(`- Trends: ${humanTrends(pipeline.trendsSource)}`);
    lines.push(`- Sentiment: ${humanSentiment(pipeline.sentimentSource)}`);
    lines.push(`- Merged: ${pipeline.mergedRowCount} rows → ${pipeline.mergedPath}`);
    if (pipeline.pairRanking && pipeline.pairRanking.length > 1) {
      lines.push(
        `- Multi-pair scan: ${pipeline.pairRanking.length} pairs (see Pair ranking on dashboard).`
      );
    }
    if (pipeline.warnings.length > 0) {
      lines.push("- Warnings:");
      for (const w of pipeline.warnings) lines.push(`  • ${w}`);
    }
    lines.push("");
  } else {
    lines.push("You ran `npm run trial` only (no `npm run go` pipeline context).");
    lines.push("");
  }

  const finite = bundle.variantTable.filter((r) =>
    Number.isFinite(r.sharpeAnnualized)
  );
  finite.sort(
    (a, b) => (b.sharpeAnnualized ?? -999) - (a.sharpeAnnualized ?? -999)
  );
  const best = finite[0];
  lines.push("Backtest (full sample)");
  if (best) {
    lines.push(
      `- Best Sharpe preset: **${best.id}** (${best.sharpeAnnualized?.toFixed(3)}) — PnL ${best.totalPnl.toFixed(5)}.`
    );
  } else {
    lines.push("- No finite Sharpe in table (too few trades or flat equity).");
  }

  const rolling = bundle.rollingSnapshots;
  if (rolling && rolling.length > 0) {
    lines.push("");
    lines.push("Recent windows (same presets, last N rows only)");
    for (const snap of rolling) {
      const leader = snap.bestSharpePresetId ?? "—";
      const sh = snap.bestSharpe;
      lines.push(
        `- Last ${snap.windowDays} rows (~${snap.rowsUsed} days): leader **${leader}** (Sharpe ${sh !== null && Number.isFinite(sh) ? sh.toFixed(3) : "n/a"}).`
      );
    }
    if (rs) {
      lines.push(`  → ${rs.note}`);
      if (rs.presetsPositivePnlAllWindows.length > 0) {
        lines.push(
          `  → Positive PnL in **all** windows: ${rs.presetsPositivePnlAllWindows.join(", ")}.`
        );
      }
      if (rs.presetsPositiveSharpeAllWindows.length > 0) {
        lines.push(
          `  → Positive Sharpe in **all** windows: ${rs.presetsPositiveSharpeAllWindows.join(", ")}.`
        );
      }
    }
  }

  const shock = bundle.dreamScenarios.priceShockDays;
  if (shock && shock.count > 0) {
    lines.push("");
    lines.push("Unusual: large daily moves (exploratory)");
    lines.push(
      `- ${shock.count} "shock" days (${shock.thresholdNote}). Mean fwd returns (rate units): 1d ${shock.meanFwdRet1d?.toFixed(6) ?? "n/a"}, 5d ${shock.meanFwdRet5d?.toFixed(6) ?? "n/a"}, 10d ${shock.meanFwdRet10d?.toFixed(6) ?? "n/a"}.`
    );
    if (shock.shareWithSentimentExtreme != null) {
      lines.push(
        `- Share of shock days with sentiment already extreme (series tails): ${(shock.shareWithSentimentExtreme * 100).toFixed(0)}%.`
      );
    }
    if (shock.shareWithTrendsWowExtreme != null) {
      lines.push(
        `- Share of shock days with stretched |WoW| (top decile among non-null WoW): ${(shock.shareWithTrendsWowExtreme * 100).toFixed(0)}%.`
      );
    }
  }

  lines.push("");
  lines.push("Data health");
  if (health.ok) {
    lines.push("- No automated health warnings.");
  } else {
    for (const w of health.warnings) lines.push(`- ${w}`);
  }

  lines.push("");
  lines.push("Try next");
  lines.push(
    `- If Trends was synthetic: \`pip install -r scripts/requirements.txt\` then \`npm run go\` again.`
  );
  lines.push(
    `- For news-backed sentiment: set NEWSAPI_KEY and ensure Python deps (see docs/OPERATOR_GUIDE.md).`
  );
  lines.push(`- Sanity check: \`npm run doctor\``);

  return lines.join("\n");
}

function pickBiggestWarning(
  pipeline: PipelineContext | null,
  health: DataHealthReport
): string {
  const hw = health.warnings;
  const pw = pipeline?.warnings ?? [];
  if (hw.length === 0 && pw.length === 0) {
    return "none flagged by automated health + pipeline checks.";
  }
  const pick = (xs: string[]) =>
    [...xs].sort((a, b) => b.length - a.length)[0] ?? "";
  if (hw.length > 0 && (!health.ok || pw.length === 0)) {
    return pick(hw);
  }
  if (pw.length > 0) return pick(pw);
  return pick(hw);
}

function pickWeirdAngle(bundle: AnalystBundle): string {
  const d = bundle.dreamScenarios;
  const shock = d.priceShockDays;
  if (shock.count >= 3) {
    const parts: string[] = [];
    parts.push(`${shock.count} large |1d| move days`);
    if (
      shock.shareWithSentimentExtreme != null &&
      shock.shareWithSentimentExtreme >= 0.25
    ) {
      parts.push("often coincide with sentiment extremes");
    }
    if (
      shock.shareWithTrendsWowExtreme != null &&
      shock.shareWithTrendsWowExtreme >= 0.25
    ) {
      parts.push("often coincide with stretched search WoW");
    }
    return (
      parts.join("; ") +
      " — forward returns after shocks are a cheap event-study target (see analyst_bundle.json → priceShockDays)."
    );
  }
  if (d.ghostAttention.count >= 5) {
    return (
      `${d.ghostAttention.count} "ghost attention" days (big WoW, tiny price move) — check whether fwd 5d drift differs from random (dreamScenarios.ghostAttention).`
    );
  }
  if (d.strengthWhileSearchCools.count >= 3) {
    return (
      "Price strength while search cools — see dreamScenarios.strengthWhileSearchCools for a continuation vs mean-reversion read."
    );
  }
  const wowR = bundle.exploratoryCorrelations.trends_wow_vs_fwdReturn5d;
  if (wowR !== null && Math.abs(wowR) >= 0.08) {
    return (
      `Exploratory correlation trends_wow vs 5d fwd return is ${wowR.toFixed(3)} — worth a keyword / lag robustness pass (not causal).`
    );
  }
  return (
    "Pick one dreamScenarios block in analyst_bundle.json and ask a second model to design a falsifiable next test (multiple-testing aware)."
  );
}

function humanTrends(s: PipelineContext["trendsSource"]): string {
  switch (s) {
    case "google_trends_pytrends":
      return "Google Trends via pytrends (real).";
    case "synthetic_flat_python_failed":
      return "Synthetic flat (50, WoW=0) — Python Trends fetch failed or empty.";
    case "synthetic_flat_no_python":
      return "Synthetic flat (50, WoW=0) — Python not installed.";
    default:
      return String(s);
  }
}

function humanSentiment(s: PipelineContext["sentimentSource"]): string {
  switch (s) {
    case "python_fetchSentiment":
      return "Python fetchSentiment.py (may be all zeros without NEWSAPI_KEY).";
    case "synthetic_neutral_python_failed":
      return "Neutral 0.0 — sentiment script failed; filled in TypeScript.";
    case "synthetic_neutral_no_python":
      return "Neutral 0.0 — Python missing; filled in TypeScript.";
    default:
      return String(s);
  }
}
