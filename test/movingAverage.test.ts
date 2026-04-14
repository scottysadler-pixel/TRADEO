import { describe, expect, it } from "vitest";
import { simpleMovingAverage } from "../src/indicators/movingAverage.js";

describe("simpleMovingAverage", () => {
  it("returns null until period is filled, then SMA", () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([
      null,
      null,
      2,
      3,
      4,
    ]);
  });

  it("throws on period < 1", () => {
    expect(() => simpleMovingAverage([1], 0)).toThrow();
  });
});
