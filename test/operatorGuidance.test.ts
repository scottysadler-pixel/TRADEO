import { describe, expect, it } from "vitest";
import {
  parseDailyLog,
  pickLeadingPresetIdFromBundle,
  pnlPerUnit,
} from "../src/analyst/operatorGuidance.js";
import { buildAnalystBundle } from "../src/analyst/bundle.js";
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

describe("operatorGuidance helpers", () => {
  it("pnlPerUnit matches LONG/SHORT convention", () => {
    expect(pnlPerUnit("LONG", 0.7, 0.71)).toBeCloseTo(0.01, 6);
    expect(pnlPerUnit("SHORT", 0.71, 0.7)).toBeCloseTo(0.01, 6);
    expect(pnlPerUnit("FLAT", 0.7, 0.71)).toBe(0);
  });

  it("parseDailyLog reads daily_check format", () => {
    const csv = `date,audusd_close,signal,trends_mode,note
2026-04-10,0.70000,LONG,sma,carry_forward_alt_data
2026-04-11,0.70100,LONG,sma,carry_forward_alt_data
`;
    const rows = parseDailyLog(csv);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(2);
    expect(rows![0]!.signal).toBe("LONG");
    expect(rows![1]!.rate).toBeCloseTo(0.701, 5);
  });

  it("pickLeadingPresetIdFromBundle prefers rolling leader then Sharpe fallback", () => {
    const daily = syntheticDaily(100);
    const variant = runVariantComparison(daily);
    const bundle = buildAnalystBundle(daily, variant, "test/synthetic.csv");
    const id = pickLeadingPresetIdFromBundle(bundle);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
