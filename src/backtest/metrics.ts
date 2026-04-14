/**
 * Turn closed trades + equity curve into summary statistics.
 *
 * - **Profit factor:** gross wins / gross losses (losses as positive sum).
 * - **Expectancy:** average P&L per trade (equivalent to win_rate * avg_win - loss_rate * avg_loss).
 * - **Sharpe:** on daily **changes** in equity (252-day annualization). NaN if no variance.
 * - **Max drawdown duration:** longest streak of days below a prior equity high until a new high.
 */
import type { BacktestSummary, Trade } from "../types.js";

function maxDrawdownDurationDays(
  equityCurve: { date: string; equity: number }[]
): number {
  if (equityCurve.length === 0) return 0;
  let high = equityCurve[0]!.equity;
  let ddStart: number | null = null;
  let maxDur = 0;
  for (let i = 0; i < equityCurve.length; i++) {
    const e = equityCurve[i]!.equity;
    if (e >= high) {
      if (ddStart !== null) {
        maxDur = Math.max(maxDur, i - ddStart);
        ddStart = null;
      }
      high = e;
    } else if (ddStart === null) {
      ddStart = i;
    }
  }
  if (ddStart !== null) {
    maxDur = Math.max(maxDur, equityCurve.length - 1 - ddStart);
  }
  return maxDur;
}

function sharpeAnnualized(equityCurve: { date: string; equity: number }[]): number {
  if (equityCurve.length < 2) return NaN;
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push(equityCurve[i]!.equity - equityCurve[i - 1]!.equity);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0 || Number.isNaN(stdev)) return NaN;
  return (mean / stdev) * Math.sqrt(252);
}

export function computeTradeStats(
  trades: Trade[],
  maxDrawdown: number,
  equityCurve: { date: string; equity: number }[],
  buyHoldPnl: number
): BacktestSummary {
  const totalTrades = trades.length;
  let wins = 0;
  let losses = 0;
  let totalPnl = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let sumWinPnl = 0;
  let sumLossPnl = 0;

  for (const t of trades) {
    totalPnl += t.pnl;
    if (t.pnl > 0) {
      wins += 1;
      grossWins += t.pnl;
      sumWinPnl += t.pnl;
    } else {
      losses += 1;
      grossLosses += Math.abs(t.pnl);
      sumLossPnl += Math.abs(t.pnl);
    }
  }

  const avgPnlPerTrade = totalTrades === 0 ? 0 : totalPnl / totalTrades;
  const winRate = totalTrades === 0 ? 0 : wins / totalTrades;
  const lossRate = totalTrades === 0 ? 0 : losses / totalTrades;
  const avgWin = wins === 0 ? 0 : sumWinPnl / wins;
  const avgLoss = losses === 0 ? 0 : sumLossPnl / losses;
  const expectancy = winRate * avgWin - lossRate * avgLoss;

  let profitFactor = 0;
  if (grossLosses === 0) {
    profitFactor = grossWins > 0 ? Infinity : 0;
  } else {
    profitFactor = grossWins / grossLosses;
  }

  return {
    totalTrades,
    wins,
    losses,
    totalPnl,
    avgPnlPerTrade,
    maxDrawdown,
    profitFactor,
    expectancy,
    maxDrawdownDurationDays: maxDrawdownDurationDays(equityCurve),
    sharpeAnnualized: sharpeAnnualized(equityCurve),
    buyHoldPnl,
  };
}
