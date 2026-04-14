import type { BacktestResult } from "../types.js";

function fmtPF(pf: number): string {
  if (!Number.isFinite(pf)) return "inf";
  return pf.toFixed(3);
}

export function printBacktestSummary(
  label: string,
  result: BacktestResult
): void {
  const s = result.summary;
  console.log(`\n--- ${label} ---`);
  console.log(`Total trades:        ${s.totalTrades}`);
  console.log(`Winning trades:      ${s.wins}`);
  console.log(`Losing trades:       ${s.losses}`);
  console.log(
    `Total P&L (rate):    ${s.totalPnl.toFixed(5)}  (AUD/USD per unit notional)`
  );
  console.log(
    `Total P&L (pips):    ${(s.totalPnl / 0.0001).toFixed(1)}  (1 pip = 0.0001)`
  );
  console.log(`Avg P&L per trade:   ${s.avgPnlPerTrade.toFixed(5)}`);
  console.log(`Expectancy:          ${s.expectancy.toFixed(5)}`);
  console.log(`Profit factor:       ${fmtPF(s.profitFactor)}`);
  console.log(`Max drawdown:        ${s.maxDrawdown.toFixed(5)}`);
  console.log(
    `Max DD duration:     ${s.maxDrawdownDurationDays} trading days`
  );
  console.log(
    `Sharpe (annualized): ${Number.isNaN(s.sharpeAnnualized) ? "n/a" : s.sharpeAnnualized.toFixed(3)}`
  );
  console.log(
    `Buy & hold P&L:      ${s.buyHoldPnl.toFixed(5)}  (same window, long spot)`
  );

  const op = result.openPosition;
  if (op) {
    console.log(
      `Open position:       ${op.side} from ${op.entryDate} @ ${op.entryPrice.toFixed(5)}`
    );
  }
}
