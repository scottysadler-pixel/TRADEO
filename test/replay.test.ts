import { describe, expect, it } from "vitest";
import { buildReplayCatalog } from "../src/analyst/replay.js";
import type { DailyRow } from "../src/types.js";

function isoDay(offset: number): string {
  const t = Date.UTC(2024, 0, 1) + offset * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function row(i: number, close: number): DailyRow {
  return {
    date: isoDay(i),
    audusd_close: close,
    trends_index: 50 + i,
    trends_wow: 0,
    sentiment_score: 0.05,
  };
}

describe("buildReplayCatalog", () => {
  it("as-of lean and preset ignore prices strictly after the as-of date", () => {
    const n = 70;
    const base: DailyRow[] = [];
    for (let i = 0; i < n; i++) base.push(row(i, 0.65 + i * 1e-4));

    const catalogA = buildReplayCatalog(base, "mem://a.csv", "audusd_close");
    expect(catalogA.days.length).toBeGreaterThan(5);

    const pick = catalogA.days[Math.floor(catalogA.days.length / 3)]!;
    const mutated = base.map((r) => ({ ...r }));
    const last = mutated[n - 1]!;
    mutated[n - 1] = { ...last, audusd_close: last.audusd_close + 2 };

    const catalogB = buildReplayCatalog(mutated, "mem://b.csv", "audusd_close");
    const again = catalogB.days.find((d) => d.asOfDate === pick.asOfDate);
    expect(again).toBeDefined();
    expect(again!.leanHeadline).toBe(pick.leanHeadline);
    expect(again!.latestSignal).toBe(pick.latestSignal);
    expect(again!.leadingPresetId).toBe(pick.leadingPresetId);
    expect(again!.whyBullets).toEqual(pick.whyBullets);
  });

  it("marks clearly synthetic slices as fallback provenance", () => {
    const synthetic: DailyRow[] = [];
    for (let i = 0; i < 70; i++) {
      synthetic.push({
        date: isoDay(i),
        audusd_close: 0.65 + i * 1e-4,
        trends_index: 50,
        trends_wow: 0,
        sentiment_score: 0,
      });
    }

    const catalog = buildReplayCatalog(
      synthetic,
      "mem://synthetic.csv",
      "audusd_close"
    );
    expect(catalog.days.length).toBeGreaterThan(0);
    const first = catalog.days[0]!;
    expect(first.provenance.overallQuality).toBe("fallback");
    expect(first.provenance.trendsQuality).toBe("fallback");
    expect(first.provenance.sentimentQuality).toBe("fallback");
  });
});
