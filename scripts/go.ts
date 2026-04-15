/**
 * One-command pipeline: fetch prices → trends → sentiment → join → trial → open dashboard.
 *
 * Usage: npm run go
 *
 * Works with Node only (synthetic trends/sentiment if Python or pytrends fails).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { writeFile } from "node:fs/promises";
import { joinDailyFromFiles } from "../src/data/joinDaily.ts";

const STEPS = 6;

function log(step: number, title: string, detail?: string): void {
  console.log(`\n[${step}/${STEPS}] ${title}`);
  if (detail) console.log(`      ${detail}`);
}

function runNpxTsx(scriptRelative: string): boolean {
  const r = spawnSync("npx", ["tsx", scriptRelative], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  });
  return r.status === 0;
}

type PyLauncher = { exe: string; prefix: string[] };

/** Try Windows `py -3`, then `python`, then `python3`. */
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

async function main(): Promise<void> {
  const cwd = process.cwd();
  mkdirSync(resolve(cwd, "data"), { recursive: true });
  mkdirSync(resolve(cwd, "output"), { recursive: true });

  const pricesPath = resolve(cwd, "data", "prices.csv");
  const trendsPath = resolve(cwd, "data", "trends.csv");
  const sentimentPath = resolve(cwd, "data", "sentiment.csv");
  const mergedPath = resolve(cwd, "data", "audusd_merged.csv");

  log(1, "Fetching ~2 years of AUD/USD prices (Frankfurter, no API key)…");
  if (!runNpxTsx("scripts/fetchPrice.ts")) {
    console.error("fetchPrice failed — check network.");
    process.exit(1);
  }
  console.log(`      Wrote ${readPriceDates(pricesPath).length} dates → data/prices.csv`);

  log(2, 'Fetching Google Trends for "AUD USD"…');
  const py = detectPython();
  if (py !== null) {
    const ok = runPythonScript(py, "fetchTrends.py", [
      "--keyword",
      "AUD USD",
      "--out",
      "data/trends.csv",
    ]);
    if (!ok || !csvHasDataRows(trendsPath)) {
      console.log(
        `      Python/pytrends failed or empty — flat synthetic trends (pip install -r scripts/requirements.txt for real data).`
      );
      const n = writeSyntheticTrends(pricesPath, trendsPath);
      console.log(`      Wrote ${n} rows → data/trends.csv`);
    } else {
      console.log(`      Wrote real Trends → data/trends.csv`);
    }
  } else {
    console.log(
      `      Python not found — flat synthetic trends (50, WoW=0). Install Python + pytrends for real data.`
    );
    const n = writeSyntheticTrends(pricesPath, trendsPath);
    console.log(`      Wrote ${n} rows → data/trends.csv`);
  }

  log(3, "Fetching sentiment scores…");
  if (py !== null) {
    const ok = runPythonScript(py, "fetchSentiment.py", [
      "--prices",
      "data/prices.csv",
      "--out",
      "data/sentiment.csv",
    ]);
    if (!ok || !csvHasDataRows(sentimentPath)) {
      const n = writeSyntheticSentiment(pricesPath, sentimentPath);
      console.log(
        `      fetchSentiment.py failed — using neutral0.0 scores (${n} rows).`
      );
    } else {
      console.log(
        `      Wrote data/sentiment.csv (use NEWSAPI_KEY + pip install for real headlines).`
      );
    }
  } else {
    const n = writeSyntheticSentiment(pricesPath, sentimentPath);
    console.log(
      `      Python not found — neutral sentiment 0.0 (${n} rows) → data/sentiment.csv`
    );
  }

  log(4, "Merging into data/audusd_merged.csv…");
  const mergedRows = await joinDailyFromFiles(
    pricesPath,
    trendsPath,
    sentimentPath
  );
  const mergedCsv = stringify(
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
