import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataFromCsvWithMeta } from "../src/data/csvLoader.js";
import { loadPricesCsv } from "../src/data/joinDaily.js";

describe("loadDataFromCsvWithMeta", () => {
  it("accepts fx_close instead of audusd_close", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trade1-csv-"));
    try {
      const path = join(dir, "m.csv");
      writeFileSync(
        path,
        [
          "date,fx_close,trends_index,sentiment_score,trends_wow,pair_id",
          "2024-01-01,1.10,50,0.1,1,EURUSD",
          "2024-01-02,1.11,51,0.2,1,EURUSD",
        ].join("\n"),
        "utf8"
      );
      const { rows, priceColumnUsed } = await loadDataFromCsvWithMeta(path);
      expect(priceColumnUsed).toBe("fx_close");
      expect(rows[0]!.audusd_close).toBe(1.1);
      expect(rows[0]!.pair_id).toBe("EURUSD");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects both price columns on same row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trade1-csv-"));
    try {
      const path = join(dir, "bad.csv");
      writeFileSync(
        path,
        "date,audusd_close,fx_close,trends_index,sentiment_score\n2024-01-01,1,1,50,0\n",
        "utf8"
      );
      await expect(loadDataFromCsvWithMeta(path)).rejects.toThrow(
        /only one of audusd_close or fx_close/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("loadPricesCsv", () => {
  it("reads fx_close in prices file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trade1-pr-"));
    try {
      const path = join(dir, "p.csv");
      writeFileSync(
        path,
        "date,fx_close\n2024-01-01,0.66\n2024-01-02,0.67\n",
        "utf8"
      );
      const { rows, priceColumnUsed } = await loadPricesCsv(path);
      expect(priceColumnUsed).toBe("fx_close");
      expect(rows[1]!.audusd_close).toBe(0.67);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
