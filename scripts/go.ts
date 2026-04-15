/**
 * One-command pipeline: fetch prices → trends → sentiment → join → trial → open dashboard.
 *
 * Usage: npm run go
 *
 * Reads optional `config/pairs.json` for multi-pair scan (Frankfurter + synthetic alt-data on non-primary).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { writeFile } from "node:fs/promises";
import { runVariantComparison } from "../src/analyst/variantComparison.ts";
import type {
  PairRankingEntry,
  PipelineContext,
  TrendsSource,
  SentimentSource,
} from "../src/analyst/runStatus.ts";
import { PIPELINE_CONTEXT_FILENAME } from "../src/analyst/runStatus.ts";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";
import { fetchFrankfurterToCsv } from "../src/data/frankfurterFetch.ts";
import { joinDailyFromFiles } from "../src/data/joinDaily.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";
const STEPS = 6;

interface PairConfig {
  id: string;
  from: string;
  to: string;
  trendsKeyword: string;
}

function log(step: number, title: string, detail?: string): void {
  console.log(`\n[${step}/${STEPS}] ${title}`);
  if (detail) console.log(`      ${detail}`);
}

function addYears(iso: string, deltaY: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCFullYear(dt.getUTCFullYear() + deltaY);
  return dt.toISOString().slice(0, 10);
}

function loadPairs(cwd: string): PairConfig[] {
  const path = resolve(cwd, "config", "pairs.json");
  if (!existsSync(path)) {
    return [
      { id: "AUDUSD", from: "AUD", to: "USD", trendsKeyword: "AUD USD" },
    ];
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as PairConfig[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return [
        { id: "AUDUSD", from: "AUD", to: "USD", trendsKeyword: "AUD USD" },
      ];
    }
    return raw;
  } catch {
    return [
      { id: "AUDUSD", from: "AUD", to: "USD", trendsKeyword: "AUD USD" },
    ];
  }
}

type PyLauncher = { exe: string; prefix: string[] };

function detectPython(): PyLauncher | null {
  const cwd = process.cwd();
  const tries: PyLauncher[] = [
    { exe: "py", prefix: ["-3"] },
    { exe: "python", prefix: [] },
    { exe: "python3", prefix: [] },
  ];
  for (const t of tries) {
    const r = spawnSync(t.exe, [...t.prefix, "-c", "print(1)"], {
      cwd,
      shell: true,
      encoding: "utf8",
    });
    if (r.status === 0) return t;
  }
  return null;
}

function runPythonScript(
  launcher: PyLauncher,
  scriptFile: string,
  scriptArgs: string[]
): boolean {
  const cwd = process.cwd();
  const script = resolve(cwd, "scripts", scriptFile);
  const args = [...launcher.prefix, script, ...scriptArgs];
  const r = spawnSync(launcher.exe, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  return r.status === 0;
}

function readPriceDates(pricesPath: string): string[] {
  const text = readFileSync(pricesPath, "utf8");
  const recs = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return recs.map((r) => r.date?.trim()).filter(Boolean);
}

function writeSyntheticTrends(pricesPath: string, outPath: string): number {
  const dates = readPriceDates(pricesPath);
  const rows = dates.map((date) => ({
    date,
    trends_index: 50,
    trends_wow: 0,
  }));
  writeFileSync(outPath, stringify(rows, { header: true }), "utf8");
  return rows.length;
}

function writeSyntheticSentiment(pricesPath: string, outPath: string): number {
  const dates = readPriceDates(pricesPath);
  const rows = dates.map((date) => ({
    date,
    sentiment_score: 0,
  }));
  writeFileSync(outPath, stringify(rows, { header: true }), "utf8");
  return rows.length;
}

function csvHasDataRows(path: string): boolean {
  try {
    const text = readFileSync(path, "utf8");
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    return lines.length >= 2;
  } catch {
    return false;
  }
}

function openDashboard(): void {
  const cwd = process.cwd();
  const html = resolve(cwd, "output", "trial_dashboard.html");
  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "start", "", html], {
      cwd,
      stdio: "ignore",
      shell: false,
    });
  } else if (process.platform === "darwin") {
    spawnSync("open", [html], { stdio: "ignore" });
  } else {
    spawnSync("xdg-open", [html], { stdio: "ignore" });
  }
}

async function rankMerged(
  mergedPath: string,
  pairId: string,
  note: string
): Promise<PairRankingEntry> {
  const daily = await loadDataFromCsv(mergedPath);
  daily.sort((a, b) => compareIsoDates(a.date, b.date));
  const vr = runVariantComparison(daily);
  let bestPresetId = "";
  let bestSharpe: number | null = null;
  let bestTotalPnl = 0;
  let bestNum = -Infinity;
  for (const s of vr.series) {
    const sh = s.summary.sharpeAnnualized;
    if (typeof sh === "number" && Number.isFinite(sh) && sh > bestNum) {
      bestNum = sh;
      bestPresetId = s.id;
      bestSharpe = sh;
      bestTotalPnl = s.summary.totalPnl;
    }
  }
  if (!bestPresetId && vr.series.length > 0) {
    bestPresetId = vr.series[0]!.id;
    bestTotalPnl = vr.series[0]!.summary.totalPnl;
    bestSharpe = Number.isFinite(vr.series[0]!.summary.sharpeAnnualized)
      ? vr.series[0]!.summary.sharpeAnnualized
      : null;
  }
  return {
    pairId,
    mergedCsv: mergedPath.replace(/\\/g, "/"),
    rowCount: daily.length,
    bestPresetId,
    bestSharpe,
    bestTotalPnl,
    dataQualityNote: note,
  };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  mkdirSync(resolve(cwd, "data"), { recursive: true });
  mkdirSync(resolve(cwd, "output"), { recursive: true });

  const pairs = loadPairs(cwd);
  const primary = pairs[0]!;
  const end = new Date().toISOString().slice(0, 10);
  const start = addYears(end, -2);

  const pricesPath = resolve(cwd, "data", "prices.csv");
  const trendsPath = resolve(cwd, "data", "trends.csv");
  const sentimentPath = resolve(cwd, "data", "sentiment.csv");
  const mergedPath = resolve(cwd, "data", "audusd_merged.csv");
  const outDir = resolve(cwd, "output");

  const warnings: string[] = [];
  if (!process.env.NEWSAPI_KEY?.trim()) {
    warnings.push(
      "NEWSAPI_KEY not set — sentiment is often neutral unless headlines are wired another way."
    );
  }

  log(1, `Fetching ~2y ${primary.from}/${primary.to} prices (Frankfurter)…`);
  const nPrices = await fetchFrankfurterToCsv({
    start,
    end,
    from: primary.from,
    to: primary.to,
    outPath: pricesPath,
  });
  console.log(`      Wrote ${nPrices} rows → data/prices.csv`);

  const py = detectPython();
  let trendsSource: TrendsSource = "synthetic_flat_no_python";
  let sentimentSource: SentimentSource = "synthetic_neutral_no_python";

  log(2, `Google Trends (“${primary.trendsKeyword}”)…`);
  if (py !== null) {
    trendsSource = "synthetic_flat_python_failed";
    const ok = runPythonScript(py, "fetchTrends.py", [
      "--keyword",
      primary.trendsKeyword,
      "--out",
      "data/trends.csv",
    ]);
    if (!ok || !csvHasDataRows(trendsPath)) {
      console.log(
        `      pytrends failed or empty — synthetic flat trends (pip install -r scripts/requirements.txt).`
      );
      writeSyntheticTrends(pricesPath, trendsPath);
    } else {
      trendsSource = "google_trends_pytrends";
      console.log(`      Real Trends → data/trends.csv`);
    }
  } else {
    console.log(`      Python not found — synthetic flat trends.`);
    writeSyntheticTrends(pricesPath, trendsPath);
  }

  log(3, "Sentiment scores…");
  if (py !== null) {
    sentimentSource = "synthetic_neutral_python_failed";
    const ok = runPythonScript(py, "fetchSentiment.py", [
      "--prices",
      "data/prices.csv",
      "--out",
      "data/sentiment.csv",
    ]);
    if (!ok || !csvHasDataRows(sentimentPath)) {
      writeSyntheticSentiment(pricesPath, sentimentPath);
      console.log(`      fetchSentiment failed — neutral 0.0 fill.`);
    } else {
      sentimentSource = "python_fetchSentiment";
      console.log(`      Wrote data/sentiment.csv`);
    }
  } else {
    writeSyntheticSentiment(pricesPath, sentimentPath);
    console.log(`      Python not found — neutral sentiment.`);
  }

  log(4, "Merging primary → data/audusd_merged.csv…");
  let mergedRows = await joinDailyFromFiles(
    pricesPath,
    trendsPath,
    sentimentPath
  );
  let mergedCsv = stringify(
    mergedRows.map((r) => ({
      date: r.date,
      audusd_close: r.audusd_close,
      trends_index: r.trends_index,
      trends_wow: r.trends_wow === null ? "" : r.trends_wow,
      sentiment_score: r.sentiment_score,
    })),
    { header: true }
  );
  await writeFile(mergedPath, mergedCsv, "utf8");
  console.log(`      Wrote ${mergedRows.length} rows.`);

  const pairRanking: PairRankingEntry[] = [];
  const primaryNote =
    trendsSource === "google_trends_pytrends"
      ? "Primary: Frankfurter + real Trends + sentiment script"
      : "Primary: Frankfurter + synthetic Trends + sentiment/neutral as above";
  pairRanking.push(await rankMerged(mergedPath, primary.id, primaryNote));

  if (pairs.length > 1) {
    console.log(
      `\n      Multi-pair: scanning ${pairs.length - 1} more pair(s) (synthetic alt-data; ranking only)…`
    );
    for (let i = 1; i < pairs.length; i++) {
      const p = pairs[i]!;
      const pPrices = resolve(cwd, "data", `prices_${p.id}.csv`);
      const pTrends = resolve(cwd, "data", `trends_${p.id}.csv`);
      const pSent = resolve(cwd, "data", `sentiment_${p.id}.csv`);
      const pMerged = resolve(cwd, "data", `merged_${p.id}.csv`);
      await fetchFrankfurterToCsv({
        start,
        end,
        from: p.from,
        to: p.to,
        outPath: pPrices,
      });
      writeSyntheticTrends(pPrices, pTrends);
      writeSyntheticSentiment(pPrices, pSent);
      const rowsP = await joinDailyFromFiles(pPrices, pTrends, pSent);
      await writeFile(
        pMerged,
        stringify(
          rowsP.map((r) => ({
            date: r.date,
            audusd_close: r.audusd_close,
            trends_index: r.trends_index,
            trends_wow: r.trends_wow === null ? "" : r.trends_wow,
            sentiment_score: r.sentiment_score,
          })),
          { header: true }
        ),
        "utf8"
      );
      pairRanking.push(
        await rankMerged(
          pMerged,
          p.id,
          "Cross-pair rank only: synthetic Trends+sentiment; not full alt-data quality."
        )
      );
    }
  }

  const pipeline: PipelineContext = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    priceSource: "frankfurter",
    trendsSource,
    sentimentSource,
    pythonDetected: py !== null,
    newsApiKeySet: Boolean(process.env.NEWSAPI_KEY?.trim()),
    geminiApiKeySet: Boolean(process.env.GEMINI_API_KEY?.trim()),
    pricesRowCount: nPrices,
    mergedRowCount: mergedRows.length,
    mergedPath: mergedPath.replace(/\\/g, "/"),
    primaryPairId: primary.id,
    warnings,
    pairRanking: pairs.length > 1 ? pairRanking : undefined,
  };

  writeFileSync(
    resolve(outDir, PIPELINE_CONTEXT_FILENAME),
    JSON.stringify(pipeline, null, 2),
    "utf8"
  );

  log(5, "Running trial (all presets, analyst bundle, dashboard)…");
  const trial = spawnSync("npm", ["run", "trial"], {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (trial.status !== 0) {
    console.error("trial failed — see errors above.");
    process.exit(trial.status ?? 1);
  }

  log(6, "Opening dashboard in browser…");
  openDashboard();

  console.log(
    "\nDone. If no browser opened, double-click: output\\trial_dashboard.html"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
