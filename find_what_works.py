#!/usr/bin/env python3
"""
HONEST TEST: What FX strategy actually makes money?
Test with ALL available data: prices, rates, commodities, sentiment
"""

import pandas as pd
import numpy as np
from pathlib import Path

# Load ALL data
prices = pd.read_csv('data/prices.csv', parse_dates=['date'])
rates = pd.read_csv('data/rates.csv', parse_dates=['date'])
commodities = pd.read_csv('data/commodities.csv', parse_dates=['date'])
sentiment = pd.read_csv('data/sentiment.csv', parse_dates=['date'])

# Merge everything
df = prices.merge(rates, on='date', how='inner')
df = df.merge(commodities, on='date', how='left')
df = df.merge(sentiment, on='date', how='left')

# Calculate features
df['rate_diff'] = df['rba_rate'] - df['fed_rate']
df['returns'] = df['audusd_close'].pct_change()
df['ma_20'] = df['audusd_close'].rolling(20).mean()
df['gold_momentum'] = df['gold_close'].pct_change(20) * 100  # 20-day % change

df = df.dropna().reset_index(drop=True)

print("="*80)
print("FINDING WHAT ACTUALLY WORKS FOR AUD/USD")
print("="*80)
print(f"\nPeriod: {df['date'].iloc[0].date()} to {df['date'].iloc[-1].date()} ({len(df)} days)")
print(f"AUD/USD: {df['audusd_close'].iloc[0]:.4f} -> {df['audusd_close'].iloc[-1]:.4f}")
print(f"Buy & Hold: {((df['audusd_close'].iloc[-1] / df['audusd_close'].iloc[0]) - 1) * 100:.2f}%\n")

# Current state
print("="*80)
print("CURRENT MARKET STATE (latest data)")
print("="*80)
latest = df.iloc[-1]
print(f"Date: {latest['date'].date()}")
print(f"AUD/USD: {latest['audusd_close']:.4f}")
print(f"RBA rate: {latest['rba_rate']:.2f}%")
print(f"Fed rate: {latest['fed_rate']:.2f}%")
print(f"Rate differential: {latest['rate_diff']:.2f}% {'(AUD pays more)' if latest['rate_diff'] > 0 else '(USD pays more)'}")
print(f"Gold 20-day momentum: {latest['gold_momentum']:.2f}%")
print(f"News sentiment: {latest['sentiment_score']:.3f}")

def backtest_strategy(signals, name):
    """Run backtest and return results"""
    strategy_returns = signals.shift(1) * df['returns']
    cumulative = (1 + strategy_returns.fillna(0)).cumprod()
    total_return = (cumulative.iloc[-1] - 1) * 100
    sharpe = strategy_returns.mean() / strategy_returns.std() * np.sqrt(252) if strategy_returns.std() > 0 else 0
    trades = (signals.diff() != 0).sum()
    win_rate = (strategy_returns > 0).sum() / (strategy_returns != 0).sum() if (strategy_returns != 0).sum() > 0 else 0
    return {
        'name': name,
        'return': total_return,
        'sharpe': sharpe,
        'trades': trades,
        'win_rate': win_rate * 100,
        'latest_signal': signals.iloc[-1]
    }

# Test strategies
results = []

# Strategy 1: Pure Carry (just follow rate differential)
signals = pd.Series(0, index=df.index)
signals[df['rate_diff'] > 0.5] = 1
signals[df['rate_diff'] < -0.5] = -1
results.append(backtest_strategy(signals, "Pure Carry (rate diff)"))

# Strategy 2: Pure Momentum
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] > df['ma_20']] = 1
signals[df['audusd_close'] < df['ma_20']] = -1
results.append(backtest_strategy(signals, "Pure Momentum (20-day MA)"))

# Strategy 3: Gold correlation (AUD follows commodities)
signals = pd.Series(0, index=df.index)
signals[df['gold_momentum'] > 3] = 1
signals[df['gold_momentum'] < -3] = -1
results.append(backtest_strategy(signals, "Gold Momentum"))

# Strategy 4: Carry + Momentum (both must agree)
carry_sig = pd.Series(0, index=df.index)
carry_sig[df['rate_diff'] > 0.2] = 1
carry_sig[df['rate_diff'] < -0.2] = -1

mom_sig = pd.Series(0, index=df.index)
mom_sig[df['audusd_close'] > df['ma_20']] = 1
mom_sig[df['audusd_close'] < df['ma_20']] = -1

signals = pd.Series(0, index=df.index)
signals[(carry_sig == 1) & (mom_sig == 1)] = 1
signals[(carry_sig == -1) & (mom_sig == -1)] = -1
results.append(backtest_strategy(signals, "Carry + Momentum"))

# Strategy 5: Carry + Gold (both must agree)
gold_sig = pd.Series(0, index=df.index)
gold_sig[df['gold_momentum'] > 2] = 1
gold_sig[df['gold_momentum'] < -2] = -1

signals = pd.Series(0, index=df.index)
signals[(carry_sig == 1) & (gold_sig == 1)] = 1
signals[(carry_sig == -1) & (gold_sig == -1)] = -1
results.append(backtest_strategy(signals, "Carry + Gold"))

# Strategy 6: Mean reversion (opposite of momentum - fade moves)
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] < df['ma_20'] * 0.98] = 1  # Buy dips
signals[df['audusd_close'] > df['ma_20'] * 1.02] = -1  # Sell rallies
results.append(backtest_strategy(signals, "Mean Reversion"))

# Print results
print("\n" + "="*80)
print("STRATEGY COMPARISON")
print("="*80)
print(f"{'Strategy':<30} {'Return':>10} {'Sharpe':>8} {'Trades':>8} {'Win%':>8} {'Now':>6}")
print("-"*80)

for r in results:
    sig_str = {1: 'LONG', -1: 'SHORT', 0: 'FLAT'}[r['latest_signal']]
    print(f"{r['name']:<30} {r['return']:>9.2f}% {r['sharpe']:>8.2f} {r['trades']:>8.0f} {r['win_rate']:>7.1f}% {sig_str:>6}")

# Find best
best = max(results, key=lambda x: x['return'])

print("\n" + "="*80)
print("WINNER")
print("="*80)
print(f"{best['name']}: {best['return']:.2f}% total return")
print(f"Sharpe: {best['sharpe']:.2f}, Win rate: {best['win_rate']:.1f}%")

print("\n" + "="*80)
print("TODAY'S RECOMMENDATION")
print("="*80)

if best['latest_signal'] == 1:
    print("[LONG] BUY AUD / SELL USD")
    print("Reasoning: {} shows bullish signal".format(best['name']))
elif best['latest_signal'] == -1:
    print("[SHORT] SELL AUD / BUY USD")
    print("Reasoning: {} shows bearish signal".format(best['name']))
else:
    print("[FLAT] NO TRADE - Wait for clearer signal")
    print("Reasoning: {} is neutral right now".format(best['name']))

print("="*80)

# Show if strategies agree
long_count = sum(1 for r in results if r['latest_signal'] == 1)
short_count = sum(1 for r in results if r['latest_signal'] == -1)
print(f"\nStrategy consensus: {long_count} LONG, {short_count} SHORT, {len(results)-long_count-short_count} FLAT")

if long_count >= 4:
    print("STRONG CONSENSUS: Multiple strategies agree on LONG")
elif short_count >= 4:
    print("STRONG CONSENSUS: Multiple strategies agree on SHORT")
else:
    print("MIXED SIGNALS: Strategies disagree, higher risk")
