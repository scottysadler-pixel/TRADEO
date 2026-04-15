/**
 * One-shot trial: optional verify → variant comparison → chart → analyst bundle for other AIs.
 *
 * Usage:
 *   npm run trial
 *   npm run trial -- --file data/audusd_merged.csv
 *   npm run trial -- --verify
 *   npm run trial -- --split-date 2023-01-01
 *   npm run trial -- --no-split
 *   npm run trial -- --no-gemini-brief
 *   npm run trial -- --no-gemini-fetch   (skip API even if GEMINI_API_KEY is set)
 *
 * Default CSV: data/audusd_merged.csv if it exists, else data/audusd_example.csv
 * Default split: midpoint row date (omit with --no-split).
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stringify } from "csv-stringify/sync";
import {
  buildAnalystBundle,
  formatAnalystMarkdown,
  type BuildAnalystBundleOptions,
} from "../src/analyst/bundle.ts";
import { buildDataHealthReport } from "../src/analyst/dataHealth.ts";
import {
  fetchGeminiResearchReply,
  formatGeminiResponseMarkdown,
  getGeminiModel,
} from "../src/analyst/geminiApi.ts";
import { formatGeminiResearchBrief } from "../src/analyst/geminiResearchBrief.ts";
import { buildPlainEnglishSummary } from "../src/analyst/plainEnglishSummary.ts";
import {
  buildOperatorGuidance,
  buildOperatorGuidanceHtml,
} from "../src/analyst/operatorGuidance.ts";
import {
  buildRunStatus,
  PIPELINE_CONTEXT_FILENAME,
  RUN_STATUS_FILENAME,
  type PipelineContext,
} from "../src/analyst/runStatus.ts";
import { buildReplayCatalog } from "../src/analyst/replay.ts";
import {
  parsePyStrategySummary,
} from "../src/analyst/pyStrategySummary.ts";
import { publishStandaloneSite } from "../src/analyst/standaloneSite.ts";
import { buildTrialDashboardHtml } from "../src/analyst/trialDashboard.ts";
import { writeVariantEquityChartHtml } from "../src/analyst/variantChartHtml.ts";
import { runVariantComparison } from "../src/analyst/variantComparison.ts";
import { loadDataFromCsvWithMeta } from "../src/data/csvLoader.ts";
import { splitByDate } from "../src/pipeline.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

function hasFlag(name: string, argv: string[]): boolean {
  return argv.includes(name);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();

  if (hasFlag("--verify", argv)) {
    const r = spawnSync("npm", ["run", "verify"], {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) {
      process.exit(r.status ?? 1);
    }
  }

  const explicit = arg("--file", argv, null);
  const merged = resolve(cwd, "data/audusd_merged.csv");
  const example = resolve(cwd, "data/audusd_example.csv");
  const csvPath = explicit
    ? resolve(cwd, explicit)
    : existsSync(merged)
      ? merged
      : example;

  if (!existsSync(csvPath)) {
    console.error(`No CSV found at ${csvPath}`);
    process.exit(1);
  }

  console.log(`Using: ${csvPath}`);
  const { rows: daily, priceColumnUsed } = await loadDataFromCsvWithMeta(
    csvPath
  );
  daily.sort((a, b) => compareIsoDates(a.date, b.date));

  const variantResult = runVariantComparison(daily);
  const outDir = resolve(cwd, "output");
  mkdirSync(outDir, { recursive: true });

  const rows = variantResult.series.map((s) => ({
    id: s.id,
    label: s.label,
    total_pnl: s.summary.totalPnl.toFixed(6),
    trades: s.summary.totalTrades,
    sharpe: Number.isFinite(s.summary.sharpeAnnualized)
      ? s.summary.sharpeAnnualized.toFixed(4)
      : "",
    max_dd: s.summary.maxDrawdown.toFixed(6),
    profit_factor: Number.isFinite(s.summary.profitFactor)
      ? s.summary.profitFactor.toFixed(4)
      : s.summary.profitFactor === Infinity
        ? "inf"
        : "0",
    buy_hold: variantResult.buyHoldPnl.toFixed(6),
  }));
  writeFileSync(
    resolve(outDir, "variant_comparison.csv"),
    stringify(rows, { header: true }),
    "utf8"
  );

  writeVariantEquityChartHtml(
    resolve(outDir, "variant_equity_chart.html"),
    variantResult.labels,
    variantResult.buyHoldPnl,
    variantResult.series
  );

  let bundleOpts: BuildAnalystBundleOptions = {};
  if (!hasFlag("--no-split", argv) && daily.length >= 2) {
    const explicitSplit = arg("--split-date", argv, null);
    const sorted = daily;
    const splitDateIso =
      explicitSplit ??
      sorted[Math.floor(sorted.length / 2)]!.date;
    const { inSample, outOfSample } = splitByDate(sorted, splitDateIso);
    const preVariant = runVariantComparison(inSample);
    const postVariant = runVariantComparison(outOfSample);
    bundleOpts = {
      regimeSplit: {
        splitDateIso,
        chosenBy: explicitSplit ? "cli" : "auto_mid_row",
        preDaily: inSample,
        postDaily: outOfSample,
        preVariant,
        postVariant,
      },
    };
    console.log(
      `\nRegime split: ${splitDateIso} (${explicitSplit ? "from --split-date" : "auto midpoint row"}) → pre ${inSample.length} rows, post ${outOfSample.length} rows`
    );
  } else if (hasFlag("--no-split", argv)) {
    console.log("\nRegime split: disabled (--no-split)");
  }

  const bundle = buildAnalystBundle(
    daily,
    variantResult,
    csvPath.replace(/\\/g, "/"),
    bundleOpts
  );
  writeFileSync(
    resolve(outDir, "analyst_bundle.json"),
    JSON.stringify(bundle, null, 2),
    "utf8"
  );
  writeFileSync(
    resolve(outDir, "analyst_for_llm.md"),
    formatAnalystMarkdown(bundle),
    "utf8"
  );

  const health = buildDataHealthReport(
    daily,
    csvPath.replace(/\\/g, "/"),
    priceColumnUsed
  );
  writeFileSync(
    resolve(outDir, "data_health.json"),
    JSON.stringify(health, null, 2),
    "utf8"
  );

  let geminiBriefPath: string | null = null;
  let geminiBriefText = "";
  if (!hasFlag("--no-gemini-brief", argv)) {
    geminiBriefText = formatGeminiResearchBrief(bundle, {
      sourceCsvHint: csvPath.replace(/\\/g, "/"),
    });
    geminiBriefPath = resolve(outDir, "gemini_research_brief.md");
    writeFileSync(geminiBriefPath, geminiBriefText, "utf8");
  }

  let geminiResponsePath: string | null = null;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (
    apiKey &&
    !hasFlag("--no-gemini-fetch", argv) &&
    geminiBriefText.length > 0
  ) {
    const model = getGeminiModel();
    console.log(`\nGemini API: calling model ${model}…`);
    const result = await fetchGeminiResearchReply(apiKey, geminiBriefText);
    geminiResponsePath = resolve(outDir, "gemini_response.md");
    writeFileSync(
      geminiResponsePath,
      formatGeminiResponseMarkdown(result, model),
      "utf8"
    );
    console.log(
      result.ok
        ? `Wrote ${geminiResponsePath}`
        : `Gemini API returned an error (see gemini_response.md); trial finished OK.`
    );
  } else if (!apiKey) {
    console.log(
      "\nGemini: brief is for manual paste (set GEMINI_API_KEY to auto-fetch; see docs/OPERATOR_GUIDE.md)."
    );
  } else if (hasFlag("--no-gemini-fetch", argv)) {
    console.log("\nGemini API: skipped (--no-gemini-fetch).");
  }

  const pipelinePath = resolve(outDir, PIPELINE_CONTEXT_FILENAME);
  let pipeline: PipelineContext | null = null;
  if (existsSync(pipelinePath)) {
    try {
      pipeline = JSON.parse(
        readFileSync(pipelinePath, "utf8")
      ) as PipelineContext;
    } catch {
      pipeline = null;
    }
  }

  const replayCatalog = buildReplayCatalog(
    daily,
    csvPath.replace(/\\/g, "/"),
    priceColumnUsed,
    pipeline
  );
  writeFileSync(
    resolve(outDir, "replay_data.json"),
    JSON.stringify(replayCatalog, null, 2),
    "utf8"
  );

  const runStatus = buildRunStatus(
    pipeline,
    bundle,
    health,
    csvPath.replace(/\\/g, "/")
  );
  writeFileSync(
    resolve(outDir, RUN_STATUS_FILENAME),
    JSON.stringify(runStatus, null, 2),
    "utf8"
  );

  const dailyLogPath = resolve(cwd, "data/daily_log.csv");
  const dailyLogCsv = existsSync(dailyLogPath)
    ? readFileSync(dailyLogPath, "utf8")
    : null;

  const operatorGuidance = buildOperatorGuidance({
    daily,
    bundle,
    health,
    pipeline,
    runStatus,
    dailyLogCsv,
  });
  const operatorHeroHtml = buildOperatorGuidanceHtml(operatorGuidance);
  const operatorHelpHtml = operatorGuidance.helpHtml;

  const plainEnglish = buildPlainEnglishSummary(
    pipeline,
    bundle,
    health,
    operatorGuidance
  );
  writeFileSync(
    resolve(outDir, "plain_english_summary.txt"),
    plainEnglish,
    "utf8"
  );

  if (existsSync(pipelinePath)) {
    try {
      unlinkSync(pipelinePath);
    } catch {
      /* keep */
    }
  }

  const dashPath = resolve(outDir, "trial_dashboard.html");
  const generatedAt = new Date().toISOString();
  const pySummaryPath = resolve(outDir, "py_strategy_summary.json");
  let pyStrategy = null;
  if (existsSync(pySummaryPath)) {
    try {
      pyStrategy = parsePyStrategySummary(
        JSON.parse(readFileSync(pySummaryPath, "utf8"))
      );
    } catch {
      pyStrategy = null;
    }
  }
  const dashboardHtml = buildTrialDashboardHtml({
    generatedAt,
    sourceCsv: csvPath.replace(/\\/g, "/"),
    outputDir: outDir.replace(/\\/g, "/"),
    health,
    bundle,
    geminiBriefPath: geminiBriefPath
      ? "gemini_research_brief.md"
      : null,
    geminiResponsePath: geminiResponsePath ? "gemini_response.md" : null,
    pipeline,
    plainEnglish,
    runStatus,
    operatorHeroHtml,
    operatorHelpHtml,
    replayCatalog,
    pyStrategy,
  });
  writeFileSync(dashPath, dashboardHtml, "utf8");

  const standaloneDir = publishStandaloneSite({
    projectRoot: cwd,
    outputDir: outDir,
    dashboardHtml,
    pairId: health.pairId,
    generatedAt,
    artifactFiles: [
      "variant_comparison.csv",
      "variant_equity_chart.html",
      "run_status.json",
      "plain_english_summary.txt",
      "data_health.json",
      "replay_data.json",
      ...(existsSync(resolve(outDir, "py_strategy_summary.json"))
        ? [
            "py_strategy_summary.json",
            "py_strategy_trades.csv",
            "py_strategy_equity_curve.csv",
            "py_strategy_summary.txt",
          ]
        : []),
      "analyst_bundle.json",
      "analyst_for_llm.md",
      ...(geminiBriefPath ? ["gemini_research_brief.md"] : []),
      ...(geminiResponsePath ? ["gemini_response.md"] : []),
    ],
  });

  console.log("\nWrote:");
  console.log(`  ${resolve(outDir, "variant_comparison.csv")}`);
  console.log(`  ${resolve(outDir, "variant_equity_chart.html")}`);
  console.log(`  ${resolve(outDir, "trial_dashboard.html")}  ← open in browser`);
  console.log(`  ${resolve(outDir, RUN_STATUS_FILENAME)}`);
  console.log(`  ${resolve(outDir, "plain_english_summary.txt")}`);
  console.log(`  ${resolve(outDir, "data_health.json")}`);
  console.log(`  ${resolve(outDir, "replay_data.json")}`);
  console.log(`  ${resolve(outDir, "analyst_bundle.json")}  ← v${bundle.bundleVersion}: dream scenarios + regime split (unless --no-split)`);
  console.log(`  ${resolve(outDir, "analyst_for_llm.md")}`);
  console.log(`  ${standaloneDir}  ← standalone app bundle`);
  if (geminiBriefPath) {
    console.log(
      `  ${geminiBriefPath}  ← paste into Gemini web or use GEMINI_API_KEY`
    );
  }
  if (geminiResponsePath) {
    console.log(`  ${geminiResponsePath}`);
  }
  console.log("\nNext: npm run open:chart   | npm run open:dashboard");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
