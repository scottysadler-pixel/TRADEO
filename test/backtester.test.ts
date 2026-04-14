import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/backtest/backtester.js";
import type { EnrichedRow } from "../src/types.js";

function row(
  date: string,
  price: number,
  signal: EnrichedRow["signal"]
): EnrichedRow {
  return {
    date,
    audusd_close: price,
    trends_index: 0,
    trends_wow:0,
    sentiment_score: 0,
    priceSma50: 0,
    trendsSma20: 0,
    signal,
  };
}

describe("runBacktest", () => {
  it("matches expected trades and final equity (ends FLAT, no forced exit)", () => {
    const rows: EnrichedRow[] = [
      row("2024-01-01", 1.0, "FLAT"),
      row("2024-01-02", 1.01, "LONG"),
      row("2024-01-03", 1.02, "LONG"),
      row("2024-01-04", 1.03, "FLAT"),
      row("2024-01-05", 1.02, "SHORT"),
      row("2024-01-06", 1.0, "SHORT"),
      row("2024-01-07", 1.01, "LONG"),
      row("2024-01-08", 1.0, "FLAT"),
      row("2024-01-09", 0.99, "FLAT"),
      row("2024-01-10", 1.0, "FLAT"),
    ];

    const { trades, equityCurve, summary } = runBacktest(rows);

    expect(trades).toHaveLength(3);

    expect(trades[0]!.side).toBe("LONG");
    expect(trades[0]!.entryDate).toBe("2024-01-02");
    expect(trades[0]!.exitDate).toBe("2024-01-04");
    expect(trades[0]!.entryPrice).toBe(1.01);
    expect(trades[0]!.exitPrice).toBe(1.03);
    expect(trades[0]!.pnl).toBeCloseTo(0.02, 10);

    expect(trades[1]!.side).toBe("SHORT");
    expect(trades[1]!.entryDate).toBe("2024-01-05");
    expect(trades[1]!.exitDate).toBe("2024-01-07");
    expect(trades[1]!.entryPrice).toBe(1.02);
    expect(trades[1]!.exitPrice).toBe(1.01);
    expect(trades[1]!.pnl).toBeCloseTo(0.01, 10);

    expect(trades[2]!.side).toBe("LONG");
    expect(trades[2]!.entryDate).toBe("2024-01-07");
    expect(trades[2]!.exitDate).toBe("2024-01-08");
    expect(trades[2]!.entryPrice).toBe(1.01);
    expect(trades[2]!.exitPrice).toBe(1.0);
    expect(trades[2]!.pnl).toBeCloseTo(-0.01, 10);

    const manual = 0.02 + 0.01 - 0.01;
    expect(summary.totalPnl).toBeCloseTo(manual, 10);
    expect(equityCurve).toHaveLength(rows.length);
    expect(equityCurve[equityCurve.length - 1]!.equity).toBeCloseTo(
      manual,
      10
    );
  });

  it("does not add a duplicate zero-PnL trade when reversing on the last bar", () => {
    const rows: EnrichedRow[] = [
      row("2024-01-01", 1.0, "SHORT"),
      row("2024-01-02", 1.0, "LONG"),
    ];
    const { trades, openPosition } = runBacktest(rows);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.side).toBe("SHORT");
    expect(openPosition).toEqual({
      side: "LONG",
      entryDate: "2024-01-02",
      entryPrice: 1.0,
    });
  });

  it("marks to market at last close when the position opened before the last day", () => {
    const rows: EnrichedRow[] = [
      row("2024-01-01", 1.0, "LONG"),
      row("2024-01-02", 1.05, "LONG"),
    ];
    const { trades, openPosition, summary } = runBacktest(rows);
    expect(openPosition).toBeNull();
    expect(trades).toHaveLength(1);
    expect(trades[0]!.pnl).toBeCloseTo(0.05, 10);
    expect(summary.totalPnl).toBeCloseTo(0.05, 10);
  });
});
