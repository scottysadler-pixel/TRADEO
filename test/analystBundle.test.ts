import { describe, expect, it } from "vitest";
import { buildAnalystBundle, formatAnalystMarkdown } from "../src/analyst/bundle.js";
import { runVariantComparison } from "../src/analyst/variantComparison.js";
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
  it("produces fingerprint, correlations, variant table, and markdown", () => {
    const daily = syntheticDaily();
    const variant = runVariantComparison(daily);
    const bundle = buildAnalystBundle(daily, variant, "test/synthetic.csv");

    expect(bundle.bundleVersion).toBe(1);
    expect(bundle.dataFingerprint.rowCount).toBe(daily.length);
    expect(bundle.variantTable.length).toBe(variant.series.length);
    expect(bundle.tailDailyPanel.length).toBeGreaterThan(0);
    expect(bundle.llmBrief.length).toBeGreaterThan(50);

    const md = formatAnalystMarkdown(bundle);
    expect(md).toContain("Analyst export");
    expect(md).toContain("Variant table");
  });
});
