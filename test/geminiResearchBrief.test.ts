import { describe, expect, it } from "vitest";
import { buildAnalystBundle } from "../src/analyst/bundle.js";
import { formatGeminiResearchBrief } from "../src/analyst/geminiResearchBrief.js";
import { runVariantComparison } from "../src/analyst/variantComparison.js";
import type { DailyRow } from "../src/types.js";

function tinyDaily(): DailyRow[] {
  const rows: DailyRow[] = [];
  let p = 0.65;
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2024, 2, 1 + i));
    p += 0.0001;
    rows.push({
      date: d.toISOString().slice(0, 10),
      audusd_close: p,
      trends_index: 50,
      trends_wow: 0.1,
      sentiment_score: 0,
    });
  }
  return rows;
}

describe("formatGeminiResearchBrief", () => {
  it("includes context, static questions, and bundle stats", () => {
    const daily = tinyDaily();
    const v = runVariantComparison(daily);
    const bundle = buildAnalystBundle(daily, v, "data/test.csv", {});
    const md = formatGeminiResearchBrief(bundle, {
      sourceCsvHint: "data/test.csv",
    });

    expect(md).toContain("Google Gemini");
    expect(md).toContain("NewsAPI");
    expect(md).toContain("falsifiable");
    expect(md).toContain("data/test.csv");
    expect(md).toContain("Bundle version");
  });
});
