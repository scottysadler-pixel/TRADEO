import { describe, expect, it } from "vitest";
import { asOfJoinDaily } from "../src/data/joinDaily.js";

describe("asOfJoinDaily", () => {
  it("uses last trends and sentiment on or before each price date", () => {
    const prices = [
      { date: "2024-01-10", audusd_close: 0.66 },
      { date: "2024-01-12", audusd_close: 0.67 },
    ];
    const trends = [
      { date: "2024-01-09", trends_index: 40, trends_wow: 1 },
      { date: "2024-01-11", trends_index: 50, trends_wow: 2 },
    ];
    const sentiment = [
      { date: "2024-01-08", sentiment_score: 0.1 },
      { date: "2024-01-10", sentiment_score: 0.3 },
    ];
    const rows = asOfJoinDaily(prices, trends, sentiment);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2024-01-10",
      audusd_close: 0.66,
      trends_index: 40,
      trends_wow: 1,
      sentiment_score: 0.3,
    });
    expect(rows[1]).toMatchObject({
      date: "2024-01-12",
      trends_index: 50,
      sentiment_score: 0.3,
    });
  });
});
