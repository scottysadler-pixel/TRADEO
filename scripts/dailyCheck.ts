/**
 * Paper-trade monitor: today's AUD/USD (Frankfurter latest), trends/sentiment carried * from last row of merged CSV unless overridden.
 *
 * Usage:
 *   npx tsx scripts/dailyCheck.ts [--file data/audusd_merged.csv] [--preset ID] [--trends-mode sma|wow]
 *
 * Appends a line to data/daily_log.csv
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAnalystBundle } from "../src/analyst/bundle.ts";
import { pickLeadingPresetIdFromBundle } from "../src/analyst/operatorGuidance.ts";
import { loadDataFromCsv } from "../src/data/csvLoader.ts";
import { enrichRows } from "../src/pipeline.ts";
import { runVariantComparison } from "../src/analyst/variantComparison.ts";
import { getPresetById } from "../src/strategy/presets.ts";
import type { TrendsMode } from "../src/types.ts";
import { compareIsoDates } from "../src/utils/dateUtils.ts";

function arg(name: string, argv: string[], def: string | null): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return def;
  return argv[i + 1]!;
}

interface LatestFx {
  date: string;
  rate: number;
}

async function fetchLatestAudUsd(): Promise<LatestFx> {
  const url = "https://api.frankfurter.app/latest?from=AUD&to=USD";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Frankfurter latest ${res.status}`);
  const body = (await res.json()) as {
    date: string;
    rates: { USD: number };
  };
  return { date: body.date, rate: body.rates.USD };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = arg("--file", argv, "data/audusd_merged.csv")!;
  const presetId = arg("--preset", argv, null);
  const trendsMode = (arg("--trends-mode", argv, "sma") as TrendsMode) || "sma";

  const path = resolve(process.cwd(), file);
  const history = await loadDataFromCsv(path);
  history.sort((a, b) => compareIsoDates(a.date, b.date));
  if (history.length === 0) {
    throw new Error("No rows in merged file");
  }

  const last = history[history.length - 1]!;
  const latest = await fetchLatestAudUsd();

  const todayRow = {
    date: latest.date,
    audusd_close: latest.rate,
    trends_index: last.trends_index,
    trends_wow: last.trends_wow,
    sentiment_score: last.sentiment_score,
  };

  const combined = [...history, todayRow];
  const resolvedPresetId =
    presetId ??
    (() => {
      const vr = runVariantComparison(history);
      const bundle = buildAnalystBundle(
        history,
        vr,
        path.replace(/\\/g, "/"),
        {}
      );
      return pickLeadingPresetIdFromBundle(bundle);
    })();

  const enrichOpts =
    resolvedPresetId !== null
      ? (() => {
          const p = getPresetById(resolvedPresetId);
          if (!p) throw new Error(`Unknown preset "${resolvedPresetId}"`);
          console.log(
            presetId
              ? `Preset: ${p.id} — ${p.label}`
              : `Preset (auto-picked to match dashboard default): ${p.id} — ${p.label}`
          );
          return { ...p.enrich };
        })()
      : {
          priceSmaPeriod: 50,
          trendsSmaPeriod: 20,
          sentimentLagDays: 0,
          signalConfig: {
            trendsMode,
            sentimentThreshold: 0.25,
            flavor: "standard",
            minAbsWow: 0,
          },
        };

  const enriched = enrichRows(combined, enrichOpts);
  const sig = enriched[enriched.length - 1]!.signal;

  const modeTag = resolvedPresetId ?? trendsMode;
  const note =
    presetId !== null
      ? "carry_forward_alt_data"
      : "carry_forward_alt_data;auto_preset_matches_dashboard";
  const line = `${latest.date},${latest.rate.toFixed(5)},${sig},${modeTag},${note}\n`;
  const logDir = resolve(process.cwd(), "data");
  mkdirSync(logDir, { recursive: true });
  const logPath = resolve(logDir, "daily_log.csv");
  try {
    readFileSync(logPath, "utf8");
  } catch {
    appendFileSync(logPath, "date,audusd_close,signal,trends_mode,note\n", "utf8");
  }
  appendFileSync(logPath, line, "utf8");

  console.log(`\n--- Daily check (${latest.date}) ---`);
  console.log(`AUD/USD (Frankfurter latest): ${latest.rate.toFixed(5)}`);
  console.log(
    `(Trends/sentiment copied from last file row ${last.date} — refresh merged CSV for fresh alt data.)`
  );
  console.log(`Signal: ${sig}`);
  console.log(`Mode tag: ${modeTag}`);
  console.log(`Logged to ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
