import { describe, expect, it } from "vitest";
import {
  ANALYST_BUNDLE_VERSION,
  buildAnalystBundle,
  formatAnalystMarkdown,
} from "../src/analyst/bundle.js";
import { runVariantComparison } from "../src/analyst/variantComparison.js";
import { splitByDate } from "../src/pipeline.js";
import type { DailyRow } from "../src/types.js";

function syntheticDaily(n = 80): DailyRow[] {
  const rows: DailyRow[] = [];
  let price = 0.66;
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2024, 0, 1 + i));
    const date = d.toISOString().slice(0, 10);
    price += Math.sin(i / 5) * 0.0008;
    rows.push({
      date,
      audusd_close: price,
      trends_index: 50 + Math.sin(i / 3) * 10,
      trends_wow: i % 7 === 0 ? -2 : 0.5,
      sentiment_score: Math.sin(i / 4) * 0.45,
    });
  }
  return rows;
}

describe("buildAnalystBundle", () => {
  it("produces current bundle version, dream scenarios, rolling windows, correlations incl wow vs fwd5d", () => {
    const daily = syntheticDaily();
    const variant = runVariantComparison(daily);
    const bundle = buildAnalystBundle(daily, variant, "test/synthetic.csv");

    expect(bundle.bundleVersion).toBe(ANALYST_BUNDLE_VERSION);
    expect(bundle.dataFingerprint.rowCount).toBe(daily.length);
    expect(bundle.variantTable.length).toBe(variant.series.length);
    expect(bundle.tailDailyPanel.length).toBeGreaterThan(0);
    expect(bundle.llmBrief.length).toBeGreaterThan(50);
    expect(bundle.dreamScenarios.ghostAttention).toBeDefined();
    expect(bundle.dreamScenarios.priceShockDays).toBeDefined();
    expect(bundle.rollingSnapshots.length).toBeGreaterThan(0);
    expect(bundle.rollingStability).not.toBeNull();
    expect(bundle.rollingStability!.windowCount).toBe(
      bundle.rollingSnapshots.length
    );
    expect(bundle.dreamScenarios.priceShockDays).toHaveProperty(
      "shareWithTrendsWowExtreme"
    );
    expect(bundle.exploratoryCorrelations).toHaveProperty(
      "trends_wow_vs_fwdReturn5d"
    );

    const md = formatAnalystMarkdown(bundle);
    expect(md).toContain("Analyst export");
    expect(md).toContain("Dream scenarios");
    expect(md).toContain("Rolling windows (recent rows only)");
    expect(md).toContain("Rolling stability (cross-window)");
  });

  it("includes regime split + stability when options.regimeSplit set", () => {
    const daily = syntheticDaily(100);
    const variant = runVariantComparison(daily);
    const splitDate = daily[50]!.date;
    const { inSample, outOfSample } = splitByDate(daily, splitDate);
    const bundle = buildAnalystBundle(daily, variant, "test/synthetic.csv", {
      regimeSplit: {
        splitDateIso: splitDate,
        chosenBy: "cli",
        preDaily: inSample,
        postDaily: outOfSample,
        preVariant: runVariantComparison(inSample),
        postVariant: runVariantComparison(outOfSample),
      },
    });

    expect(bundle.regimeSplit).toBeDefined();
    expect(bundle.regimeSplit!.pre.rowCount).toBe(inSample.length);
    expect(bundle.regimeSplit!.post.rowCount).toBe(outOfSample.length);
    expect(bundle.regimeSplit!.stability.length).toBeGreaterThan(0);

    const md = formatAnalystMarkdown(bundle);
    expect(md).toContain("Regime split");
    expect(md).toContain("Sharpe stability");
  });
});
