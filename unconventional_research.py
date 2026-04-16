#!/usr/bin/env python3
"""
UNCONVENTIONAL RESEARCH: Find hidden edges that most traders (and AIs) miss.

Testing weird ideas that aren't in textbooks:
- Day of week effects
- Time-based patterns  
- Volatility regime changes
- Contrarian/inverse strategies
- Weird correlations
- Failed breakouts
- Sentiment divergences
"""

import pandas as pd
import numpy as np
from pathlib import Path

# Load data
prices = pd.read_csv('data/prices.csv', parse_dates=['date'])
rates = pd.read_csv('data/rates.csv', parse_dates=['date'])
commodities = pd.read_csv('data/commodities.csv', parse_dates=['date'])
sentiment = pd.read_csv('data/sentiment.csv', parse_dates=['date'])

df = prices.merge(rates, on='date', how='inner')
df = df.merge(commodities, on='date', how='left')
df = df.merge(sentiment, on='date', how='left')

# Calculate features
df['rate_diff'] = df['rba_rate'] - df['fed_rate']
df['returns'] = df['audusd_close'].pct_change()
df['ma_20'] = df['audusd_close'].rolling(20).mean()
df['ma_50'] = df['audusd_close'].rolling(50).mean()
df['std_20'] = df['returns'].rolling(20).std()
df['gold_mom_20'] = df['gold_close'].pct_change(20) * 100

# Day of week (0=Monday, 4=Friday)
df['day_of_week'] = df['date'].dt.dayofweek
df['is_monday'] = (df['day_of_week'] == 0).astype(int)
df['is_friday'] = (df['day_of_week'] == 4).astype(int)

# Week/month patterns
df['week_of_month'] = (df['date'].dt.day - 1) // 7 + 1
df['is_month_end'] = (df['date'].dt.is_month_end).astype(int)
df['is_month_start'] = ((df['date'].dt.day >= 1) & (df['date'].dt.day <= 3)).astype(int)

# Volatility regime
df['vol_regime'] = pd.qcut(df['std_20'].fillna(df['std_20'].median()), q=3, labels=['low', 'med', 'high'])

# RSI
delta = df['audusd_close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df['rsi'] = 100 - (100 / (1 + rs))

# Price vs MA divergence
df['price_vs_ma'] = ((df['audusd_close'] - df['ma_20']) / df['ma_20']) * 100

# Sentiment vs price divergence
df['price_mom_5'] = df['audusd_close'].pct_change(5) * 100
df['sentiment_divergence'] = df['sentiment_score'] - (df['price_mom_5'] / 10)  # Normalized

df = df.dropna().reset_index(drop=True)

print("="*100)
print("UNCONVENTIONAL EDGE RESEARCH - FINDING WHAT OTHERS MISS")
print("="*100)
print(f"Period: {df['date'].iloc[0].date()} to {df['date'].iloc[-1].date()} ({len(df)} days)")
print(f"Buy & Hold: {((df['audusd_close'].iloc[-1] / df['audusd_close'].iloc[0]) - 1) * 100:.2f}%\n")

def backtest_strategy(signals, name):
    """Backtest with comprehensive stats"""
    strategy_returns = signals.shift(1) * df['returns']
    strategy_returns = strategy_returns.fillna(0)
    
    cumulative = (1 + strategy_returns).cumprod()
    total_return = (cumulative.iloc[-1] - 1) * 100
    
    running_max = cumulative.cummax()
    drawdown = (cumulative - running_max) / running_max
    max_drawdown = drawdown.min() * 100
    
    sharpe = strategy_returns.mean() / strategy_returns.std() * np.sqrt(252) if strategy_returns.std() > 0 else 0
    
    trades = (signals.diff() != 0).sum()
    winning = (strategy_returns > 0).sum()
    total = (strategy_returns != 0).sum()
    win_rate = winning / total * 100 if total > 0 else 0
    
    return {
        'name': name,
        'return': total_return,
        'sharpe': sharpe,
        'max_dd': max_drawdown,
        'trades': trades,
        'win_rate': win_rate,
        'latest_signal': signals.iloc[-1]
    }

results = []

# ============================================================================
# CONTRARIAN/INVERSE STRATEGIES (do the opposite of what seems obvious)
# ============================================================================

print("\n" + "="*100)
print("CONTRARIAN STRATEGIES - Fade the obvious trade")
print("="*100)

# 1. Inverse momentum (fade trends)
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] < df['ma_20']] = 1  # Buy when below MA (opposite of normal)
signals[df['audusd_close'] > df['ma_20']] = -1  # Sell when above MA
results.append(backtest_strategy(signals, "Contrarian: Fade momentum"))

# 2. Fade gold (do opposite of gold)
signals = pd.Series(0, index=df.index)
signals[df['gold_mom_20'] < -3] = 1  # Buy AUD when gold falls
signals[df['gold_mom_20'] > 3] = -1  # Sell AUD when gold rises
results.append(backtest_strategy(signals, "Contrarian: Fade gold"))

# 3. Sentiment contrarian (news is wrong)
signals = pd.Series(0, index=df.index)
signals[df['sentiment_score'] < -0.3] = 1  # Buy when news is bad
signals[df['sentiment_score'] > 0.3] = -1  # Sell when news is good
results.append(backtest_strategy(signals, "Contrarian: Fade sentiment"))

# 4. Rate differential contrarian
signals = pd.Series(0, index=df.index)
signals[df['rate_diff'] < -0.3] = 1  # Buy AUD when USD pays more
signals[df['rate_diff'] > 0.3] = -1  # Sell AUD when AUD pays more
results.append(backtest_strategy(signals, "Contrarian: Fade carry"))

# ============================================================================
# CALENDAR/TIME-BASED PATTERNS
# ============================================================================

print("\n" + "="*100)
print("CALENDAR EFFECTS - Timing patterns others miss")
print("="*100)

# 5. Monday Effect (Monday different from other days?)
monday_return = df[df['is_monday'] == 1]['returns'].mean()
print(f"Monday average return: {monday_return*100:.3f}%")
signals = pd.Series(0, index=df.index)
signals[df['is_monday'] == 1] = 1 if monday_return > 0 else -1
results.append(backtest_strategy(signals, "Calendar: Monday only"))

# 6. Friday Effect
friday_return = df[df['is_friday'] == 1]['returns'].mean()
print(f"Friday average return: {friday_return*100:.3f}%")
signals = pd.Series(0, index=df.index)
signals[df['is_friday'] == 1] = 1 if friday_return > 0 else -1
results.append(backtest_strategy(signals, "Calendar: Friday only"))

# 7. Month-end rebalancing flows
signals = pd.Series(0, index=df.index)
signals[df['is_month_end'] == 1] = 1  # Buy on month-end
results.append(backtest_strategy(signals, "Calendar: Month-end flows"))

# 8. Month-start patterns
signals = pd.Series(0, index=df.index)
signals[df['is_month_start'] == 1] = -1  # Sell at month start
results.append(backtest_strategy(signals, "Calendar: Month-start fade"))

# 9. Week of month effect
for week in [1, 2, 3, 4]:
    week_return = df[df['week_of_month'] == week]['returns'].mean()
    print(f"Week {week} average return: {week_return*100:.3f}%")

# ============================================================================
# VOLATILITY REGIME SWITCHING
# ============================================================================

print("\n" + "="*100)
print("VOLATILITY REGIMES - Different markets need different strategies")
print("="*100)

# 10. Momentum in low vol, mean reversion in high vol
signals = pd.Series(0, index=df.index)
# Low vol: follow trend
signals[(df['vol_regime'] == 'low') & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['vol_regime'] == 'low') & (df['audusd_close'] < df['ma_20'])] = -1
# High vol: fade extremes
signals[(df['vol_regime'] == 'high') & (df['price_vs_ma'] < -1.5)] = 1
signals[(df['vol_regime'] == 'high') & (df['price_vs_ma'] > 1.5)] = -1
results.append(backtest_strategy(signals, "Regime: Switch strategy by vol"))

# 11. Only trade low volatility periods
signals = pd.Series(0, index=df.index)
signals[(df['vol_regime'] == 'low') & (df['gold_mom_20'] > 2)] = 1
signals[(df['vol_regime'] == 'low') & (df['gold_mom_20'] < -2)] = -1
results.append(backtest_strategy(signals, "Regime: Low vol gold mom"))

# 12. Only trade high volatility periods (breakouts)
signals = pd.Series(0, index=df.index)
signals[(df['vol_regime'] == 'high') & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['vol_regime'] == 'high') & (df['audusd_close'] < df['ma_20'])] = -1
results.append(backtest_strategy(signals, "Regime: High vol momentum"))

# ============================================================================
# DIVERGENCE STRATEGIES
# ============================================================================

print("\n" + "="*100)
print("DIVERGENCES - When markets disagree, opportunity arises")
print("="*100)

# 13. Sentiment-Price divergence (news says one thing, price does another)
signals = pd.Series(0, index=df.index)
# Bullish divergence: bad news but price holding up
signals[(df['sentiment_score'] < -0.2) & (df['price_mom_5'] > 0)] = 1
# Bearish divergence: good news but price falling
signals[(df['sentiment_score'] > 0.2) & (df['price_mom_5'] < 0)] = -1
results.append(backtest_strategy(signals, "Divergence: Sentiment vs Price"))

# 14. Gold-AUD divergence (gold moves but AUD doesn't follow)
df['aud_mom_5'] = df['audusd_close'].pct_change(5) * 100
df['gold_mom_5'] = df['gold_close'].pct_change(5) * 100
signals = pd.Series(0, index=df.index)
# Gold up but AUD not following - catch up trade
signals[(df['gold_mom_5'] > 2) & (df['aud_mom_5'] < 1)] = 1
# Gold down but AUD not following
signals[(df['gold_mom_5'] < -2) & (df['aud_mom_5'] > -1)] = -1
results.append(backtest_strategy(signals, "Divergence: Gold-AUD catchup"))

# 15. Rate diff vs price divergence
signals = pd.Series(0, index=df.index)
# Rates favor AUD but price falling - mean reversion
signals[(df['rate_diff'] > 0.3) & (df['price_mom_5'] < -1)] = 1
# Rates favor USD but price rising
signals[(df['rate_diff'] < -0.3) & (df['price_mom_5'] > 1)] = -1
results.append(backtest_strategy(signals, "Divergence: Carry vs Price"))

# ============================================================================
# FAILED PATTERN STRATEGIES
# ============================================================================

print("\n" + "="*100)
print("FAILED PATTERNS - When obvious setups fail, trade the opposite")
print("="*100)

# 16. Failed breakout above MA (price touches MA but fails to hold)
df['touched_ma'] = (abs(df['audusd_close'] - df['ma_20']) / df['ma_20']) < 0.002
df['prev_below_ma'] = (df['audusd_close'].shift(1) < df['ma_20'].shift(1))
signals = pd.Series(0, index=df.index)
# Touched MA from below but next day still below - failed breakout, fade it
for i in range(1, len(df)):
    if df['touched_ma'].iloc[i-1] and df['prev_below_ma'].iloc[i-1]:
        if df['audusd_close'].iloc[i] < df['ma_20'].iloc[i]:
            signals.iloc[i] = -1  # Fade the failed breakout
results.append(backtest_strategy(signals, "Failed: Breakout fade"))

# 17. RSI extreme that doesn't reverse (strength signal)
signals = pd.Series(0, index=df.index)
# RSI oversold but doesn't bounce - go with the trend
for i in range(2, len(df)):
    if df['rsi'].iloc[i-1] < 35 and df['returns'].iloc[i-1] < 0:
        signals.iloc[i] = -1  # Sell into continued weakness
    if df['rsi'].iloc[i-1] > 65 and df['returns'].iloc[i-1] > 0:
        signals.iloc[i] = 1  # Buy into continued strength
results.append(backtest_strategy(signals, "Failed: RSI no-reversal"))

# ============================================================================
# HYBRID UNCONVENTIONAL
# ============================================================================

print("\n" + "="*100)
print("HYBRID UNCONVENTIONAL - Combining weird ideas")
print("="*100)

# 18. Low vol + Gold divergence + Monday
signals = pd.Series(0, index=df.index)
signals[(df['vol_regime'] == 'low') & (df['is_monday'] == 1) & 
        (df['gold_mom_5'] > 2) & (df['aud_mom_5'] < 1)] = 1
results.append(backtest_strategy(signals, "Hybrid: LowVol+Monday+GoldDiv"))

# 19. High vol + Sentiment contrarian + Month-end
signals = pd.Series(0, index=df.index)
signals[(df['vol_regime'] == 'high') & (df['is_month_end'] == 1) & 
        (df['sentiment_score'] < -0.2)] = 1  # Buy fear at month-end
signals[(df['vol_regime'] == 'high') & (df['is_month_end'] == 1) & 
        (df['sentiment_score'] > 0.2)] = -1  # Sell greed at month-end
results.append(backtest_strategy(signals, "Hybrid: HighVol+MonthEnd+Contrarian"))

# 20. Extreme carry + Extreme gold (both must be very strong)
signals = pd.Series(0, index=df.index)
signals[(df['rate_diff'] > 0.5) & (df['gold_mom_20'] > 5)] = 1  # Super bullish
signals[(df['rate_diff'] < -0.5) & (df['gold_mom_20'] < -5)] = -1  # Super bearish
results.append(backtest_strategy(signals, "Hybrid: Extreme carry+gold"))

# ============================================================================
# RESULTS
# ============================================================================

print("\n" + "="*100)
print("UNCONVENTIONAL STRATEGIES RANKED (by Sharpe ratio)")
print("="*100)

results_sorted = sorted(results, key=lambda x: x['sharpe'], reverse=True)

print(f"\n{'Rank':<5} {'Strategy':<40} {'Return':>9} {'Sharpe':>8} {'MaxDD':>8} {'Trades':>7} {'Win%':>7} {'Now':>6}")
print("-"*100)

for i, r in enumerate(results_sorted, 1):
    sig_str = {1: 'LONG', -1: 'SHORT', 0: 'FLAT'}[r['latest_signal']]
    print(f"{i:<5} {r['name']:<40} {r['return']:>8.2f}% {r['sharpe']:>8.2f} {r['max_dd']:>7.2f}% {r['trades']:>7.0f} {r['win_rate']:>6.1f}% {sig_str:>6}")

print("\n" + "="*100)
print("TOP 3 UNCONVENTIONAL STRATEGIES - DETAILED")
print("="*100)

for i, r in enumerate(results_sorted[:3], 1):
    print(f"\n#{i}. {r['name']}")
    print(f"   Return: {r['return']:.2f}% (vs {((df['audusd_close'].iloc[-1]/df['audusd_close'].iloc[0]-1)*100):.2f}% buy-hold)")
    print(f"   Sharpe: {r['sharpe']:.2f}")
    print(f"   Max Drawdown: {r['max_dd']:.2f}%")
    print(f"   Trades: {r['trades']:.0f} | Win Rate: {r['win_rate']:.1f}%")
    sig_str = {1: 'LONG', -1: 'SHORT', 0: 'FLAT'}[r['latest_signal']]
    print(f"   Current: {sig_str}")

# Best unconventional vs best conventional
print("\n" + "="*100)
print("KEY INSIGHTS")
print("="*100)

best_unconventional = results_sorted[0]
print(f"\nBest unconventional strategy: {best_unconventional['name']}")
print(f"Return: {best_unconventional['return']:.2f}%, Sharpe: {best_unconventional['sharpe']:.2f}")

# Find strategies that actually worked
winners = [r for r in results if r['return'] > 5 and r['sharpe'] > 0.5]
print(f"\nStrategies that beat buy-hold with good risk-adjusted returns: {len(winners)}")

if winners:
    print("\nHidden gems (unconventional strategies that work):")
    for w in winners[:5]:
        print(f"  - {w['name']}: {w['return']:.2f}% (Sharpe {w['sharpe']:.2f})")

print("\n" + "="*100)
