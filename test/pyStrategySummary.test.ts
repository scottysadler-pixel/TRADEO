import { describe, expect, it } from "vitest";
import {
  PY_STRATEGY_SCHEMA_VERSION,
  parsePyStrategySummary,
} from "../src/analyst/pyStrategySummary.ts";

describe("parsePyStrategySummary", () => {
  it("accepts v1 summary shape", () => {
    const raw = {
      schemaVersion: PY_STRATEGY_SCHEMA_VERSION,
      generatedAt: "2026-01-01T00:00:00Z",
      strategyId: "py_three_green_lights",
      mode: "simple",
      parameters: {},
      metrics: {
        totalPnl: 0.1,
        maxDrawdown: 0.05,
        sharpeAnnualized: 0.5,
        totalTrades: 3,
        winRate: 0.4,
        profitFactor: 1.2,
        avgTradePnl: 0.03,
      },
      walkforwardWindows: null,
      walkforwardNote: null,
      rowCount: 100,
      latest: {
        date: "2026-01-01",
        signal: "FLAT",
        sig_rate: 1,
        sig_commodity: 0,
        sig_sentiment: -1,
        rate_diff: 0.1,
        sentiment_score: 0.0,
        commodity_momentum: 0.01,
      },
      dailyPreview: [],
      trades: [],
      tradeCountTotal: 0,
    };
    const p = parsePyStrategySummary(raw);
    expect(p).not.toBeNull();
    expect(p!.latest.signal).toBe("FLAT");
  });

  it("rejects wrong schema version", () => {
    expect(parsePyStrategySummary({ schemaVersion: 0 })).toBeNull();
  });
});
