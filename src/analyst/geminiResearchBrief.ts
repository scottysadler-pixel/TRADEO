/**
 * Markdown brief meant to be pasted into Google Gemini (or similar) when you want
 * **creative / naming / API / research** help the local agent did not resolve.
 */
import type { AnalystBundle } from "./bundle.js";

export interface GeminiResearchBriefOptions {
  /** Path or hint to the CSV used for this trial */
  sourceCsvHint: string;
  /** Repo or project label for context */
  projectLabel?: string;
}

const STATIC_OPEN_QUESTIONS = `## Technical / API questions (please propose concrete names + links + tiers)

1. **Daily AUD/USD (or FX) spot / OHLC** — free or cheap APIs with ≥3y history, permissive for personal research, and a stable Node or Python client pattern.
2. **Macro / surprise series for Australia** — data sources for employment, CPI, RBA decisions, or **surprise vs consensus** if available on a free tier.
3. **News or text sentiment for AUD** — alternatives or complements to NewsAPI + VADER / GDELT-style pipelines; how to reduce same-bar lookahead.
4. **Google Trends alternatives or scaling** — pytrends limits, official API if any, or other “attention” proxies (search, Wikipedia, Reddit) with **daily-ish** resolution caveats.
5. **Economic calendar APIs** — event dates + forecast + actual for AU/US to label rows (even if we only merge **binary “event day”** columns later).

## Creative / research questions (non-obvious angles)

1. What **one falsifiable experiment** would you run next on this bundle’s \`dreamScenarios\` + \`regimeSplit.stability\` output?
2. Which presets are most likely **p-hacked** if we keep adding rules, and how would you **pre-register** a single change?
3. Name **two alt-data streams** almost nobody combines with AUD/USD retail flows, and how you would **normalize** them against liquidity regimes.
4. How would you test **Filippou–Taylor–Wang-style media reversal** *without* duplicating their data (i.e. using our crude daily sentiment only)?

## Answer format (requested)

Numbered answers. For each API or product: **name**, **URL**, **free tier limits**, **auth type**, **one integration sentence** (Node or Python). If unsure, say so explicitly.`;

export function formatGeminiResearchBrief(
  bundle: AnalystBundle,
  options: GeminiResearchBriefOptions
): string {
  const project = options.projectLabel ?? "Trade1 / audusd-daily-backtest";
  const rs = bundle.regimeSplit;
  const splitNote = rs
    ? `Split: **${rs.splitDateIso}** (${rs.chosenBy}). Pre rows=${rs.pre.rowCount}, post=${rs.post.rowCount}${rs.lowSampleWarning ? " — **LOW_SAMPLE_WARNING** (collect longer history if possible)." : "."}`
    : "No regime split in this run (e.g. `--no-split` or single-row data).";

  const dream = bundle.dreamScenarios;
  const dreamOneLiner = [
    `ghostAttention=${dream.ghostAttention.count}`,
    `strengthWhileSearchCools=${dream.strengthWhileSearchCools.count}`,
    `weaknessWhileSearchHeats=${dream.weaknessWhileSearchHeats.count}`,
  ].join(", ");

  return [
    "# Handoff for Google Gemini (or similar)",
    "",
    "_Paste this whole file into Gemini. Optionally attach **`output/analyst_bundle.json`** from the same trial so the model sees numbers, not just this text. When your Cursor agent is unsure about **API names, tiers, or open-ended research design**, it should direct you here instead of guessing._",
    "",
    "## Why you are pasting this",
    "",
    "Your coding agent (or you) wants **creative ideas, API product names, vendor comparison, or research design** that is easier to brainstorm in a broad web-connected model. This file is regenerated whenever you run **`npm run trial`**.",
    "",
    "## Project context",
    "",
    `- **Project:** ${project}`,
    `- **Source CSV hint:** \`${options.sourceCsvHint}\``,
    `- **Bundle version:** ${bundle.bundleVersion}`,
    `- **Rows:** ${bundle.dataFingerprint.rowCount} (${bundle.dataFingerprint.firstDate} … ${bundle.dataFingerprint.lastDate})`,
    `- **${splitNote}**`,
    `- **Dream scenario counts (headline):** ${dreamOneLiner}`,
    "",
    "## What is already built (do not re-invent unless improving)",
    "",
    "- Daily pipeline: price + Trends + sentiment → merged CSV → many **strategy presets** + backtest metrics.",
    "- **`npm run trial`** writes: variant table/chart, **`analyst_bundle.json`** (dream stats, optional pre/post split, tail panel), **`analyst_for_llm.md`**, **`gemini_research_brief.md`** (this style of prompt for external models).",
    "- Weird presets include: attention burst, quiet uptrend, contrarian mood, sentiment lags, media-reversal-lite (no Trends), **fadeSearchMania** (fade WoW spikes in trend).",
    "",
    STATIC_OPEN_QUESTIONS,
    "",
    "---",
    "",
    "*End of brief — attach `analyst_bundle.json` from the same run for numeric critique.*",
    "",
  ].join("\n");
}
