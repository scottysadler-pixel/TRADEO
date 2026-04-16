#!/usr/bin/env python3
"""
Test simple, proven FX strategies to find what actually works.
Compare multiple approaches side-by-side.
"""

from pathlib import Path
import pandas as pd
import numpy as np

# Load the merged data
repo = Path(__file__).resolve().parent.parent
df = pd.read_csv(repo / "data" / "audusd_merged.csv", parse_dates=["date"])
df = df.sort_values("date").reset_index(drop=True)

# Rename for easier coding
df["close"] = df["audusd_close"]

# Calculate returns
df["returns"] = df["close"].pct_change()

print("=" * 80)
print("TESTING SIMPLE FX STRATEGIES - WHICH ONE ACTUALLY MAKES MONEY?")
print("=" * 80)
print(f"\nData: {len(df)} days from {df['date'].iloc[0]} to {df['date'].iloc[-1]}")
print(f"AUD/USD moved from {df['close'].iloc[0]:.4f} to {df['close'].iloc[-1]:.4f}")
print(f"Buy-and-hold return: {(df['close'].iloc[-1] / df['close'].iloc[0] - 1) * 100:.2f}%\n")

# Strategy 1: Pure Momentum (20-day trend)
print("\n" + "=" * 80)
print("STRATEGY 1: PURE MOMENTUM (ride the 20-day trend)")
print("=" * 80)
df["ma_20"] = df["close"].rolling(20).mean()
df["signal_momentum"] = 0
df.loc[df["close"] > df["ma_20"], "signal_momentum"] = 1  # LONG
df.loc[df["close"] < df["ma_20"], "signal_momentum"] = -1  # SHORT

df["strategy_momentum"] = df["signal_momentum"].shift(1) * df["returns"]
momentum_cumulative = (1 + df["strategy_momentum"].fillna(0)).cumprod()
momentum_return = (momentum_cumulative.iloc[-1] - 1) * 100
momentum_sharpe = df["strategy_momentum"].mean() / df["strategy_momentum"].std() * np.sqrt(252)
momentum_trades = (df["signal_momentum"].diff() != 0).sum()

print(f"Total return: {momentum_return:.2f}%")
print(f"Sharpe ratio: {momentum_sharpe:.2f}")
print(f"Trades: {momentum_trades}")
print(f"Latest signal: {'LONG' if df['signal_momentum'].iloc[-1] == 1 else 'SHORT' if df['signal_momentum'].iloc[-1] == -1 else 'FLAT'}")

# Strategy 2: Pure Carry (interest rate differential)
print("\n" + "=" * 80)
print("STRATEGY 2: PURE CARRY (follow the rate differential)")
print("=" * 80)
# Need to calculate rate differential
# Assuming we have rate data in the merged CSV or can approximate it
df["signal_carry"] = 0
if "rate_diff" in df.columns:
    df.loc[df["rate_diff"] > 0, "signal_carry"] = 1
    df.loc[df["rate_diff"] < 0, "signal_carry"] = -1
else:
    print("Rate differential data not available - skipping carry strategy")
    df["signal_carry"] = 0

df["strategy_carry"] = df["signal_carry"].shift(1) * df["returns"]
carry_cumulative = (1 + df["strategy_carry"].fillna(0)).cumprod()
carry_return = (carry_cumulative.iloc[-1] - 1) * 100
carry_sharpe = df["strategy_carry"].mean() / df["strategy_carry"].std() * np.sqrt(252) if df["strategy_carry"].std() > 0 else 0
carry_trades = (df["signal_carry"].diff() != 0).sum()

print(f"Total return: {carry_return:.2f}%")
print(f"Sharpe ratio: {carry_sharpe:.2f}")
print(f"Trades: {carry_trades}")
print(f"Latest signal: {'LONG' if df['signal_carry'].iloc[-1] == 1 else 'SHORT' if df['signal_carry'].iloc[-1] == -1 else 'FLAT'}")

# Strategy 3: Momentum + Carry (only trade when both agree)
print("\n" + "=" * 80)
print("STRATEGY 3: MOMENTUM + CARRY (only when both agree)")
print("=" * 80)
df["signal_combined"] = 0
df.loc[(df["signal_momentum"] == 1) & (df["signal_carry"] == 1), "signal_combined"] = 1
df.loc[(df["signal_momentum"] == -1) & (df["signal_carry"] == -1), "signal_combined"] = -1

df["strategy_combined"] = df["signal_combined"].shift(1) * df["returns"]
combined_cumulative = (1 + df["strategy_combined"].fillna(0)).cumprod()
combined_return = (combined_cumulative.iloc[-1] - 1) * 100
combined_sharpe = df["strategy_combined"].mean() / df["strategy_combined"].std() * np.sqrt(252) if df["strategy_combined"].std() > 0 else 0
combined_trades = (df["signal_combined"].diff() != 0).sum()

print(f"Total return: {combined_return:.2f}%")
print(f"Sharpe ratio: {combined_sharpe:.2f}")
print(f"Trades: {combined_trades}")
print(f"Latest signal: {'LONG' if df['signal_combined'].iloc[-1] == 1 else 'SHORT' if df['signal_combined'].iloc[-1] == -1 else 'FLAT'}")

# Strategy 4: Strong Momentum Only (only trade very strong trends)
print("\n" + "=" * 80)
print("STRATEGY 4: STRONG MOMENTUM ONLY (big trends only)")
print("=" * 80)
df["momentum_strength"] = (df["close"] - df["ma_20"]) / df["ma_20"] * 100
threshold = 1.5  # 1.5% above/below MA
df["signal_strong"] = 0
df.loc[df["momentum_strength"] > threshold, "signal_strong"] = 1
df.loc[df["momentum_strength"] < -threshold, "signal_strong"] = -1

df["strategy_strong"] = df["signal_strong"].shift(1) * df["returns"]
strong_cumulative = (1 + df["strategy_strong"].fillna(0)).cumprod()
strong_return = (strong_cumulative.iloc[-1] - 1) * 100
strong_sharpe = df["strategy_strong"].mean() / df["strategy_strong"].std() * np.sqrt(252) if df["strategy_strong"].std() > 0 else 0
strong_trades = (df["signal_strong"].diff() != 0).sum()

print(f"Total return: {strong_return:.2f}%")
print(f"Sharpe ratio: {strong_sharpe:.2f}")
print(f"Trades: {strong_trades}")
print(f"Latest signal: {'LONG' if df['signal_strong'].iloc[-1] == 1 else 'SHORT' if df['signal_strong'].iloc[-1] == -1 else 'FLAT'}")

# Summary
print("\n" + "=" * 80)
print("SUMMARY - WHICH STRATEGY WINS?")
print("=" * 80)
results = [
    ("Buy and Hold", (df['close'].iloc[-1] / df['close'].iloc[0] - 1) * 100, 0, 1),
    ("Pure Momentum", momentum_return, momentum_sharpe, momentum_trades),
    ("Pure Carry", carry_return, carry_sharpe, carry_trades),
    ("Momentum + Carry", combined_return, combined_sharpe, combined_trades),
    ("Strong Momentum", strong_return, strong_sharpe, strong_trades),
]

print(f"\n{'Strategy':<20} {'Return':<12} {'Sharpe':<10} {'Trades':<10}")
print("-" * 52)
for name, ret, sharpe, trades in results:
    print(f"{name:<20} {ret:>10.2f}%  {sharpe:>8.2f}   {trades:>8}")

best_strategy = max(results[1:], key=lambda x: x[1])  # Exclude buy-and-hold
print(f"\nWINNER: {best_strategy[0]} with {best_strategy[1]:.2f}% return")

# Today's recommendation
print("\n" + "=" * 80)
print("TODAY'S RECOMMENDATION")
print("=" * 80)
latest_date = df['date'].iloc[-1].strftime('%Y-%m-%d')
latest_price = df['close'].iloc[-1]
print(f"Date: {latest_date}")
print(f"AUD/USD: {latest_price:.4f}")
print(f"\nMomentum: {'LONG' if df['signal_momentum'].iloc[-1] == 1 else 'SHORT' if df['signal_momentum'].iloc[-1] == -1 else 'FLAT'}")
print(f"Carry: {'LONG' if df['signal_carry'].iloc[-1] == 1 else 'SHORT' if df['signal_carry'].iloc[-1] == -1 else 'FLAT'}")
print(f"Combined: {'LONG' if df['signal_combined'].iloc[-1] == 1 else 'SHORT' if df['signal_combined'].iloc[-1] == -1 else 'FLAT'}")
print(f"Strong Momentum: {'LONG' if df['signal_strong'].iloc[-1] == 1 else 'SHORT' if df['signal_strong'].iloc[-1] == -1 else 'FLAT'}")

if best_strategy[0] == "Pure Momentum":
    signal = df['signal_momentum'].iloc[-1]
elif best_strategy[0] == "Pure Carry":
    signal = df['signal_carry'].iloc[-1]
elif best_strategy[0] == "Momentum + Carry":
    signal = df['signal_combined'].iloc[-1]
else:
    signal = df['signal_strong'].iloc[-1]

print(f"\n{'=' * 80}")
print(f"RECOMMENDED ACTION (based on best historical strategy):")
if signal == 1:
    print("[BUY] BUY AUD (sell USD) - Expect AUD to strengthen")
elif signal == -1:
    print("[SELL] SELL AUD (buy USD) - Expect AUD to weaken")
else:
    print("[FLAT] STAY FLAT - No clear signal, wait for better opportunity")
print(f"{'=' * 80}")
