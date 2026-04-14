/**
 * Single-position backtest: at most one of LONG, SHORT, or FLAT.
 *
 * P&L convention (v1): **raw exchange-rate change per one unit of notional**
 * (one unit of base currency AUD priced in USD, for AUD/USD).
 *
 * - LONG: profit when price rises → PnL = exitPrice - entryPrice
 * - SHORT: profit when price falls → PnL = entryPrice - exitPrice
 *
 * To convert to **pips** (typical retail definition for AUD/USD: 1 pip = 0.0001):
 *   pips = pnl / 0.0001
 *
 * No leverage, no spread/slippage/commissions in v1.
 */

import type {
  BacktestResult,
  EnrichedRow,
  OpenPosition,
  PositionSide,
  Trade,
} from "../types.js";
import { compareIsoDates } from "../utils/dateUtils.js";
import { computeTradeStats } from "./metrics.js";

function pushEquityAndDrawdown(
  equityCurve: { date: string; equity: number }[],
  date: string,
  equity: number,
  state: { maxEquity: number; maxDrawdown: number }
): void {
  equityCurve.push({ date, equity });
  if (equity > state.maxEquity) {
    state.maxEquity = equity;
  }
  const drawdown = state.maxEquity - equity;
  if (drawdown > state.maxDrawdown) {
    state.maxDrawdown = drawdown;
  }
}

/**
 * Run backtest over pre-enriched rows (chronological order).
 *
 * **End of sample (open position):**
 * - If we are still in a trade and the position was opened **before** the last row's
 *   date, we **close at the last row's close** and book one final trade. That keeps
 *   total return intuitive (everything is realized inside the CSV window).
 * - If the position was opened **on** the last row (e.g. FLAT→LONG at that close,
 *   or SHORT→LONG reversal at that close), there is no later daily close in this
 *   file to exit. Adding a second "exit at the same close" would duplicate logic and
 *   create a spurious zero-PnL trade. In that case we **leave the position open** in
 *   the result (`openPosition`); summary P&L is still **realized only**.
 */
export function runBacktest(rows: EnrichedRow[]): BacktestResult {
  const trades: Trade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];

  let currentPositionSide: PositionSide = "FLAT";
  let entryPrice: number | null = null;
  let entryDate: string | null = null;
  let equity = 0;
  let openPosition: OpenPosition = null;

  const ddState = { maxEquity: 0, maxDrawdown: 0 };

  for (const row of rows) {
    const { date, audusd_close: price, signal } = row;

    if (currentPositionSide === "FLAT") {
      if (signal === "LONG" || signal === "SHORT") {
        currentPositionSide = signal;
        entryPrice = price;
        entryDate = date;
      }
    } else if (currentPositionSide === "LONG") {
      if (signal === "LONG") {
        // Still bullish: hold through today's close.
      } else {
        // Exit long at today's close.
        const ep = entryPrice!;
        const ed = entryDate!;
        const pnl = price - ep;
        trades.push({
          entryDate: ed,
          exitDate: date,
          side: "LONG",
          entryPrice: ep,
          exitPrice: price,
          pnl,
        });
        equity += pnl;

        if (signal === "SHORT") {
          currentPositionSide = "SHORT";
          entryPrice = price;
          entryDate = date;
        } else {
          currentPositionSide = "FLAT";
          entryPrice = null;
          entryDate = null;
        }
      }
    } else {
      // SHORT
      if (signal === "SHORT") {
        // Still bearish: hold.
      } else {
        const ep = entryPrice!;
        const ed = entryDate!;
        const pnl = ep - price;
        trades.push({
          entryDate: ed,
          exitDate: date,
          side: "SHORT",
          entryPrice: ep,
          exitPrice: price,
          pnl,
        });
        equity += pnl;

        if (signal === "LONG") {
          currentPositionSide = "LONG";
          entryPrice = price;
          entryDate = date;
        } else {
          currentPositionSide = "FLAT";
          entryPrice = null;
          entryDate = null;
        }
      }
    }

    pushEquityAndDrawdown(equityCurve, date, equity, ddState);
  }

  // Mark-to-market at last close only when there is a *later* close than entry.
  if (
    rows.length > 0 &&
    currentPositionSide !== "FLAT" &&
    entryPrice !== null &&
    entryDate !== null
  ) {
    const last = rows[rows.length - 1]!;
    const lastPrice = last.audusd_close;
    const lastDate = last.date;

    if (compareIsoDates(entryDate, lastDate) < 0) {
      if (currentPositionSide === "LONG") {
        const pnl = lastPrice - entryPrice;
        trades.push({
          entryDate,
          exitDate: lastDate,
          side: "LONG",
          entryPrice,
          exitPrice: lastPrice,
          pnl,
        });
        equity += pnl;
      } else {
        const pnl = entryPrice - lastPrice;
        trades.push({
          entryDate,
          exitDate: lastDate,
          side: "SHORT",
          entryPrice,
          exitPrice: lastPrice,
          pnl,
        });
        equity += pnl;
      }

      currentPositionSide = "FLAT";
      entryPrice = null;
      entryDate = null;

      if (equityCurve.length > 0) {
        equityCurve[equityCurve.length - 1] = {
          date: lastDate,
          equity,
        };
        if (equity > ddState.maxEquity) {
          ddState.maxEquity = equity;
        }
        const drawdown = ddState.maxEquity - equity;
        if (drawdown > ddState.maxDrawdown) {
          ddState.maxDrawdown = drawdown;
        }
      }
    } else {
      openPosition = {
        side: currentPositionSide === "LONG" ? "LONG" : "SHORT",
        entryDate,
        entryPrice,
      };
    }
  }

  const buyHoldPnl =
    rows.length > 0
      ? rows[rows.length - 1]!.audusd_close - rows[0]!.audusd_close
      : 0;

  const summary = computeTradeStats(
    trades,
    ddState.maxDrawdown,
    equityCurve,
    buyHoldPnl
  );

  return { trades, equityCurve, summary, openPosition };
}
