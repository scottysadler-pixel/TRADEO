import { describe, expect, it } from "vitest";
import { generateSignal } from "../src/strategy/signalEngine.js";

describe("generateSignal", () => {
  it("LONG when price > SMA, trends > SMA, sentiment > 0.25", () => {
    expect(
      generateSignal({
        price: 1.1,
        priceSma50: 1.0,
        trendsIndex: 60,
        trendsSma20: 50,
        trendsWow: null,
        sentimentScore: 0.26,
      })
    ).toBe("LONG");
  });

  it("SHORT when price < SMA, trends < SMA, sentiment < -0.25", () => {
    expect(
      generateSignal({
        price: 0.9,
        priceSma50: 1.0,
        trendsIndex: 40,
        trendsSma20: 50,
        trendsWow: null,
        sentimentScore: -0.26,
      })
    ).toBe("SHORT");
  });

  it("FLAT when price equals SMA (strict inequalities)", () => {
    expect(
      generateSignal({
        price: 1.0,
        priceSma50: 1.0,
        trendsIndex: 60,
        trendsSma20: 50,
        trendsWow: null,
        sentimentScore: 0.5,
      })
    ).toBe("FLAT");
  });

  it("FLAT on mixed conditions", () => {
    expect(
      generateSignal({
        price: 1.1,
        priceSma50: 1.0,
        trendsIndex: 40,
        trendsSma20: 50,
        trendsWow: null,
        sentimentScore: 0.5,
      })
    ).toBe("FLAT");
  });

  it("LONG in wow mode when trends_wow > 0 and other gates pass", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: 5,
          sentimentScore: 0.3,
        },
        { trendsMode: "wow" }
      )
    ).toBe("LONG");
  });

  it("FLAT in wow mode when trends_wow is null", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: null,
          sentimentScore: 0.5,
        },
        { trendsMode: "wow" }
      )
    ).toBe("FLAT");
  });

  it("respects custom sentiment threshold", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: null,
          sentimentScore: 0.2,
        },
        { sentimentThreshold: 0.15 }
      )
    ).toBe("LONG");
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: null,
          sentimentScore: 0.2,
        },
        { sentimentThreshold: 0.25 }
      )
    ).toBe("FLAT");
  });

  it("attentionSpike requires large |wow|", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: 2,
          sentimentScore: 0.3,
        },
        { trendsMode: "wow", flavor: "attentionSpike", minAbsWow: 5 }
      )
    ).toBe("FLAT");
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: 6,
          sentimentScore: 0.3,
        },
        { trendsMode: "wow", flavor: "attentionSpike", minAbsWow: 5 }
      )
    ).toBe("LONG");
  });

  it("contrarianFear longs on fear (negative sentiment)", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: null,
          sentimentScore: -0.3,
        },
        { flavor: "contrarianFear", sentimentThreshold: 0.25 }
      )
    ).toBe("LONG");
  });

  it("uptrendQuietAttention longs when wow negative in uptrend", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: -1,
          sentimentScore: 0.3,
        },
        { trendsMode: "wow", flavor: "uptrendQuietAttention" }
      )
    ).toBe("LONG");
  });

  it("priceSentimentReversal: long on fear in uptrend", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 40,
          trendsSma20: 50,
          trendsWow: null,
          sentimentScore: -0.3,
        },
        { flavor: "priceSentimentReversal", sentimentThreshold: 0.25 }
      )
    ).toBe("LONG");
  });

  it("fadeSearchMania: SHORT uptrend when WoW spikes", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: 5,
          sentimentScore: 0.9,
        },
        {
          trendsMode: "wow",
          flavor: "fadeSearchMania",
          minAbsWow: 4,
        }
      )
    ).toBe("SHORT");
  });

  it("fadeSearchMania: LONG downtrend when WoW crashes", () => {
    expect(
      generateSignal(
        {
          price: 0.9,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: -5,
          sentimentScore: -0.9,
        },
        {
          trendsMode: "wow",
          flavor: "fadeSearchMania",
          minAbsWow: 4,
        }
      )
    ).toBe("LONG");
  });

  it("fadeSearchMania: FLAT when wow below bar", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 50,
          trendsSma20: null,
          trendsWow: 2,
          sentimentScore: 0.5,
        },
        {
          trendsMode: "wow",
          flavor: "fadeSearchMania",
          minAbsWow: 4,
        }
      )
    ).toBe("FLAT");
  });

  it("fadeSearchMania: FLAT in sma mode", () => {
    expect(
      generateSignal(
        {
          price: 1.1,
          priceSma50: 1.0,
          trendsIndex: 60,
          trendsSma20: 50,
          trendsWow: 10,
          sentimentScore: 0.5,
        },
        {
          trendsMode: "sma",
          flavor: "fadeSearchMania",
          minAbsWow: 4,
        }
      )
    ).toBe("FLAT");
  });

  it("FLAT when any SMA is null", () => {
    expect(
      generateSignal({
        price: 1.1,
        priceSma50: null,
        trendsIndex: 60,
        trendsSma20: 50,
        trendsWow: null,
        sentimentScore: 0.5,
      })
    ).toBe("FLAT");
    expect(
      generateSignal({
        price: 1.1,
        priceSma50: 1.0,
        trendsIndex: 60,
        trendsSma20: null,
        trendsWow: null,
        sentimentScore: 0.5,
      })
    ).toBe("FLAT");
  });
});
