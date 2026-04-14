import type { SignalEngineConfig, TrendsMode } from "../types.js";

export interface CliArgs {
  file: string;
  /** When set, ignores trends-mode / SMA flags below and uses the preset bundle. */
  presetId: string | null;
  trendsMode: TrendsMode;
  splitDate: string | null;
  priceSmaPeriod: number;
  trendsSmaPeriod: number;
  sentimentThreshold: number;
}

function printUsage(): void {
  console.error(`Usage:
  node dist/index.js --file <path.csv> [options]

Options:
  --preset ID             Use a named bundle from strategy/presets.ts (see npm run compare:variants)
  --trends-mode sma|wow   Trends attention: SMA vs20d baseline (default sma) or week-over-week delta
  --split-date YYYY-MM-DD Optional: report in-sample (before) and out-of-sample (from date) separately
  --price-sma N Price trend SMA period (default 50)
  --trends-sma N          Trends baseline SMA period when mode=sma (default 20)
  --sentiment-threshold X Bullish if sentiment > X, bearish if < -X (default 0.25)
`);
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const idxFile = args.indexOf("--file");
  if (idxFile === -1 || idxFile === args.length - 1) {
    printUsage();
    process.exit(1);
  }

  const file = args[idxFile + 1]!;

  let presetId: string | null = null;
  const idxPreset = args.indexOf("--preset");
  if (idxPreset !== -1 && idxPreset < args.length - 1) {
    presetId = args[idxPreset + 1]!;
  }

  let trendsMode: TrendsMode = "sma";
  const idxTm = args.indexOf("--trends-mode");
  if (idxTm !== -1 && idxTm < args.length - 1) {
    const v = args[idxTm + 1]!;
    if (v !== "sma" && v !== "wow") {
      console.error(`Invalid --trends-mode: ${v}`);
      printUsage();
      process.exit(1);
    }
    trendsMode = v;
  }

  let splitDate: string | null = null;
  const idxSd = args.indexOf("--split-date");
  if (idxSd !== -1 && idxSd < args.length - 1) {
    splitDate = args[idxSd + 1]!;
  }

  let priceSmaPeriod = 50;
  const idxPs = args.indexOf("--price-sma");
  if (idxPs !== -1 && idxPs < args.length - 1) {
    priceSmaPeriod = Number(args[idxPs + 1]);
    if (!Number.isInteger(priceSmaPeriod) || priceSmaPeriod < 1) {
      console.error("Invalid --price-sma");
      process.exit(1);
    }
  }

  let trendsSmaPeriod = 20;
  const idxTs = args.indexOf("--trends-sma");
  if (idxTs !== -1 && idxTs < args.length - 1) {
    trendsSmaPeriod = Number(args[idxTs + 1]);
    if (!Number.isInteger(trendsSmaPeriod) || trendsSmaPeriod < 1) {
      console.error("Invalid --trends-sma");
      process.exit(1);
    }
  }

  let sentimentThreshold = 0.25;
  const idxSt = args.indexOf("--sentiment-threshold");
  if (idxSt !== -1 && idxSt < args.length - 1) {
    sentimentThreshold = Number(args[idxSt + 1]);
    if (Number.isNaN(sentimentThreshold) || sentimentThreshold <= 0) {
      console.error("Invalid --sentiment-threshold");
      process.exit(1);
    }
  }

  return {
    file,
    presetId,
    trendsMode,
    splitDate,
    priceSmaPeriod,
    trendsSmaPeriod,
    sentimentThreshold,
  };
}

export function argsToSignalConfig(args: CliArgs): Partial<SignalEngineConfig> {
  return {
    trendsMode: args.trendsMode,
    sentimentThreshold: args.sentimentThreshold,
    flavor: "standard",
    minAbsWow: 0,
  };
}
