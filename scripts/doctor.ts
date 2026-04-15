/**
 * One-shot environment + data sanity check.
 * Usage: npm run doctor
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

function tryImportPytrends(launcher: PyLauncher): boolean {
  const cwd = process.cwd();
  const r = spawnSync(
    launcher.exe,
    [...launcher.prefix, "-c", "import pytrends; print('ok')"],
    { cwd, shell: true, encoding: "utf8" }
  );
  return r.status === 0;
}

function ageHours(path: string): number | null {
  try {
    const st = statSync(path);
    return (Date.now() - st.mtimeMs) / (1000 * 60 * 60);
  } catch {
    return null;
  }
}

function line(label: string, ok: boolean, detail: string): void {
  const mark = ok ? "OK " : "WARN";
  console.log(`[${mark}] ${label}: ${detail}`);
}

function main(): void {
  const cwd = process.cwd();
  console.log("Trade1 doctor — quick health check\n");

  let exitCode = 0;

  const py = detectPython();
  line("Python", py !== null, py ? `${py.exe} ${py.prefix.join(" ")}`.trim() : "not found (npm run go will use synthetic Trends/sentiment)");

  if (py) {
    const hasPt = tryImportPytrends(py);
    line("pytrends import", hasPt, hasPt ? "available" : "missing — pip install -r scripts/requirements.txt");
    if (!hasPt) exitCode = 1;
  } else {
    line("pytrends import", false, "skipped (no Python)");
  }

  const news = Boolean(process.env.NEWSAPI_KEY?.trim());
  line("NEWSAPI_KEY", news, news ? "set" : "not set — sentiment often neutral");

  const gem = Boolean(process.env.GEMINI_API_KEY?.trim());
  line("GEMINI_API_KEY", true, gem ? "set (trial may call API)" : "not set — Gemini reply file only if you add key");

  const merged = resolve(cwd, "data/audusd_merged.csv");
  const example = resolve(cwd, "data/audusd_example.csv");
  const hasMerged = existsSync(merged);
  const hasExample = existsSync(example);
  line(
    "Merged / example CSV",
    hasMerged || hasExample,
    hasMerged
      ? `audusd_merged.csv exists`
      : hasExample
        ? `only audusd_example.csv (run npm run go to build merged)`
        : "no audusd_merged.csv or audusd_example.csv"
  );
  if (!hasMerged && !hasExample) exitCode = 1;

  const pairsPath = resolve(cwd, "config/pairs.json");
  line("config/pairs.json", existsSync(pairsPath), existsSync(pairsPath) ? "present (multi-pair)" : "optional — default single pair if missing");

  const dash = resolve(cwd, "output/trial_dashboard.html");
  const status = resolve(cwd, "output/run_status.json");
  const dashH = existsSync(dash) ? ageHours(dash) : null;
  const stH = existsSync(status) ? ageHours(status) : null;
  let recentOk = false;
  let recentDetail = "";
  if (dashH === null && stH === null) {
    recentDetail = "no trial_dashboard.html or run_status.json in output/";
  } else {
    const youngest = Math.min(
      dashH ?? Number.POSITIVE_INFINITY,
      stH ?? Number.POSITIVE_INFINITY
    );
    recentDetail = `youngest artifact ${youngest.toFixed(1)}h ago`;
    if (youngest < 72) recentOk = true;
    else recentDetail += " — consider npm run go";
  }
  line("Recent output (<72h)", recentOk, recentDetail);

  console.log("\nDone. Fix WARN items, then: npm run verify |  npm run go");
  process.exit(exitCode);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
