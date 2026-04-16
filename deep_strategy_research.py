#!/usr/bin/env python3
"""
DEEP RESEARCH: Test 15+ different FX strategies to find what REALLY works.
No assumptions - test everything and let the data decide.
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

# Calculate ALL features we might need
df['rate_diff'] = df['rba_rate'] - df['fed_rate']
df['rate_change'] = df['rba_rate'].diff() - df['fed_rate'].diff()
df['returns'] = df['audusd_close'].pct_change()

# Moving averages
df['ma_5'] = df['audusd_close'].rolling(5).mean()
df['ma_10'] = df['audusd_close'].rolling(10).mean()
df['ma_20'] = df['audusd_close'].rolling(20).mean()
df['ma_50'] = df['audusd_close'].rolling(50).mean()
df['ma_100'] = df['audusd_close'].rolling(100).mean()

# Volatility
df['std_20'] = df['returns'].rolling(20).std()
df['atr'] = df['audusd_close'].diff().abs().rolling(14).mean()

# Bollinger Bands
df['bb_upper'] = df['ma_20'] + (2 * df['std_20'] * df['audusd_close'])
df['bb_lower'] = df['ma_20'] - (2 * df['std_20'] * df['audusd_close'])

# RSI
delta = df['audusd_close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df['rsi'] = 100 - (100 / (1 + rs))

# Gold momentum at different timeframes
df['gold_mom_5'] = df['gold_close'].pct_change(5) * 100
df['gold_mom_20'] = df['gold_close'].pct_change(20) * 100
df['gold_mom_50'] = df['gold_close'].pct_change(50) * 100

# Price momentum at different timeframes
df['price_mom_5'] = df['audusd_close'].pct_change(5) * 100
df['price_mom_20'] = df['audusd_close'].pct_change(20) * 100
df['price_mom_50'] = df['audusd_close'].pct_change(50) * 100

df = df.dropna().reset_index(drop=True)

print("="*100)
print("DEEP STRATEGY RESEARCH - TESTING 20+ STRATEGIES")
print("="*100)
print(f"Period: {df['date'].iloc[0].date()} to {df['date'].iloc[-1].date()} ({len(df)} trading days)")
print(f"AUD/USD: {df['audusd_close'].iloc[0]:.4f} -> {df['audusd_close'].iloc[-1]:.4f}")
print(f"Buy & Hold return: {((df['audusd_close'].iloc[-1] / df['audusd_close'].iloc[0]) - 1) * 100:.2f}%")

def backtest_strategy(signals, name):
    """Run backtest and return comprehensive results"""
    strategy_returns = signals.shift(1) * df['returns']
    strategy_returns = strategy_returns.fillna(0)
    
    cumulative = (1 + strategy_returns).cumprod()
    total_return = (cumulative.iloc[-1] - 1) * 100
    
    # Calculate drawdown
    running_max = cumulative.cummax()
    drawdown = (cumulative - running_max) / running_max
    max_drawdown = drawdown.min() * 100
    
    # Sharpe ratio
    sharpe = strategy_returns.mean() / strategy_returns.std() * np.sqrt(252) if strategy_returns.std() > 0 else 0
    
    # Trade statistics
    trades = (signals.diff() != 0).sum()
    winning_trades = (strategy_returns > 0).sum()
    total_trades = (strategy_returns != 0).sum()
    win_rate = winning_trades / total_trades * 100 if total_trades > 0 else 0
    
    # Average win/loss
    wins = strategy_returns[strategy_returns > 0]
    losses = strategy_returns[strategy_returns < 0]
    avg_win = wins.mean() * 100 if len(wins) > 0 else 0
    avg_loss = losses.mean() * 100 if len(losses) > 0 else 0
    
    return {
        'name': name,
        'return': total_return,
        'sharpe': sharpe,
        'max_dd': max_drawdown,
        'trades': trades,
        'win_rate': win_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'profit_factor': abs(avg_win / avg_loss) if avg_loss != 0 else 0,
        'latest_signal': signals.iloc[-1]
    }

results = []

# ============================================================================
# MOMENTUM STRATEGIES
# ============================================================================

# 1. Short-term momentum (5-day)
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] > df['ma_5']] = 1
signals[df['audusd_close'] < df['ma_5']] = -1
results.append(backtest_strategy(signals, "Mom: 5-day MA"))

# 2. Medium-term momentum (20-day)
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] > df['ma_20']] = 1
signals[df['audusd_close'] < df['ma_20']] = -1
results.append(backtest_strategy(signals, "Mom: 20-day MA"))

# 3. Long-term momentum (100-day)
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] > df['ma_100']] = 1
signals[df['audusd_close'] < df['ma_100']] = -1
results.append(backtest_strategy(signals, "Mom: 100-day MA"))

# 4. Dual moving average crossover (fast crosses slow)
signals = pd.Series(0, index=df.index)
signals[df['ma_5'] > df['ma_20']] = 1
signals[df['ma_5'] < df['ma_20']] = -1
results.append(backtest_strategy(signals, "Mom: 5/20 MA cross"))

# 5. Triple MA alignment (trend strength)
signals = pd.Series(0, index=df.index)
signals[(df['ma_5'] > df['ma_20']) & (df['ma_20'] > df['ma_50'])] = 1
signals[(df['ma_5'] < df['ma_20']) & (df['ma_20'] < df['ma_50'])] = -1
results.append(backtest_strategy(signals, "Mom: Triple MA align"))

# ============================================================================
# MEAN REVERSION STRATEGIES
# ============================================================================

# 6. RSI oversold/overbought
signals = pd.Series(0, index=df.index)
signals[df['rsi'] < 30] = 1  # Oversold - buy
signals[df['rsi'] > 70] = -1  # Overbought - sell
results.append(backtest_strategy(signals, "MR: RSI(30/70)"))

# 7. Bollinger Band extremes
signals = pd.Series(0, index=df.index)
signals[df['audusd_close'] < df['bb_lower']] = 1  # Price below lower band - buy
signals[df['audusd_close'] > df['bb_upper']] = -1  # Price above upper band - sell
results.append(backtest_strategy(signals, "MR: Bollinger Bands"))

# 8. Distance from 20-day MA (buy dips, sell rallies)
signals = pd.Series(0, index=df.index)
dist_pct = ((df['audusd_close'] - df['ma_20']) / df['ma_20']) * 100
signals[dist_pct < -1.5] = 1  # 1.5% below MA - buy dip
signals[dist_pct > 1.5] = -1  # 1.5% above MA - sell rally
results.append(backtest_strategy(signals, "MR: MA distance +/-1.5%"))

# ============================================================================
# VOLATILITY BREAKOUT STRATEGIES
# ============================================================================

# 9. High volatility breakout (trade when vol spikes)
vol_threshold = df['std_20'].quantile(0.7)
signals = pd.Series(0, index=df.index)
signals[(df['std_20'] > vol_threshold) & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['std_20'] > vol_threshold) & (df['audusd_close'] < df['ma_20'])] = -1
results.append(backtest_strategy(signals, "Vol: High vol breakout"))

# 10. Low volatility fade (only trade in calm markets)
vol_threshold_low = df['std_20'].quantile(0.3)
signals = pd.Series(0, index=df.index)
signals[(df['std_20'] < vol_threshold_low) & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['std_20'] < vol_threshold_low) & (df['audusd_close'] < df['ma_20'])] = -1
results.append(backtest_strategy(signals, "Vol: Low vol only"))

# ============================================================================
# GOLD-BASED STRATEGIES
# ============================================================================

# 11. Gold momentum 20-day
signals = pd.Series(0, index=df.index)
signals[df['gold_mom_20'] > 3] = 1
signals[df['gold_mom_20'] < -3] = -1
results.append(backtest_strategy(signals, "Gold: 20-day mom > 3%"))

# 12. Gold momentum 50-day (longer term)
signals = pd.Series(0, index=df.index)
signals[df['gold_mom_50'] > 5] = 1
signals[df['gold_mom_50'] < -5] = -1
results.append(backtest_strategy(signals, "Gold: 50-day mom > 5%"))

# 13. Gold + Price momentum agreement
signals = pd.Series(0, index=df.index)
signals[(df['gold_mom_20'] > 2) & (df['price_mom_20'] > 1)] = 1
signals[(df['gold_mom_20'] < -2) & (df['price_mom_20'] < -1)] = -1
results.append(backtest_strategy(signals, "Gold + Price mom align"))

# ============================================================================
# CARRY TRADE STRATEGIES
# ============================================================================

# 14. Pure carry (rate differential)
signals = pd.Series(0, index=df.index)
signals[df['rate_diff'] > 0.3] = 1
signals[df['rate_diff'] < -0.3] = -1
results.append(backtest_strategy(signals, "Carry: Rate diff > 0.3%"))

# 15. Carry + trend confirmation
signals = pd.Series(0, index=df.index)
signals[(df['rate_diff'] > 0.2) & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['rate_diff'] < -0.2) & (df['audusd_close'] < df['ma_20'])] = -1
results.append(backtest_strategy(signals, "Carry + Trend"))

# 16. Carry + Gold alignment
signals = pd.Series(0, index=df.index)
signals[(df['rate_diff'] > 0.1) & (df['gold_mom_20'] > 2)] = 1
signals[(df['rate_diff'] < -0.1) & (df['gold_mom_20'] < -2)] = -1
results.append(backtest_strategy(signals, "Carry + Gold"))

# ============================================================================
# SENTIMENT STRATEGIES
# ============================================================================

# 17. Pure sentiment
signals = pd.Series(0, index=df.index)
signals[df['sentiment_score'] > 0.3] = 1
signals[df['sentiment_score'] < -0.3] = -1
results.append(backtest_strategy(signals, "Sentiment > 0.3"))

# 18. Sentiment + Price momentum
signals = pd.Series(0, index=df.index)
signals[(df['sentiment_score'] > 0.2) & (df['audusd_close'] > df['ma_20'])] = 1
signals[(df['sentiment_score'] < -0.2) & (df['audusd_close'] < df['ma_20'])] = -1
results.append(backtest_strategy(signals, "Sentiment + Momentum"))

# ============================================================================
# ADVANCED COMBO STRATEGIES
# ============================================================================

# 19. Three Green Lights (Gold + Carry + Sentiment all agree)
gold_sig = pd.Series(0, index=df.index)
gold_sig[df['gold_mom_20'] > 2] = 1
gold_sig[df['gold_mom_20'] < -2] = -1

carry_sig = pd.Series(0, index=df.index)
carry_sig[df['rate_diff'] > 0.15] = 1
carry_sig[df['rate_diff'] < -0.15] = -1

sent_sig = pd.Series(0, index=df.index)
sent_sig[df['sentiment_score'] > 0.15] = 1
sent_sig[df['sentiment_score'] < -0.15] = -1

signals = pd.Series(0, index=df.index)
signals[(gold_sig == 1) & (carry_sig == 1) & (sent_sig == 1)] = 1
signals[(gold_sig == -1) & (carry_sig == -1) & (sent_sig == -1)] = -1
results.append(backtest_strategy(signals, "Three Green Lights"))

# 20. Gold + RSI combo (trend + reversion)
signals = pd.Series(0, index=df.index)
signals[(df['gold_mom_20'] > 2) & (df['rsi'] < 50)] = 1  # Gold up + AUD not overbought
signals[(df['gold_mom_20'] < -2) & (df['rsi'] > 50)] = -1  # Gold down + AUD not oversold
results.append(backtest_strategy(signals, "Gold + RSI filter"))

# 21. Rate change reaction (central bank action)
signals = pd.Series(0, index=df.index)
signals[df['rate_change'] > 0.1] = 1  # RBA raises more than Fed
signals[df['rate_change'] < -0.1] = -1  # Fed raises more than RBA
results.append(backtest_strategy(signals, "Rate change reaction"))

print("\n" + "="*100)
print("RESULTS - ALL STRATEGIES RANKED BY SHARPE RATIO")
print("="*100)

# Sort by Sharpe (best risk-adjusted returns)
results_sorted = sorted(results, key=lambda x: x['sharpe'], reverse=True)

print(f"\n{'Rank':<5} {'Strategy':<25} {'Return':>9} {'Sharpe':>8} {'MaxDD':>8} {'Trades':>7} {'Win%':>7} {'P.F.':>6} {'Now':>6}")
print("-"*100)

for i, r in enumerate(results_sorted, 1):
    sig_str = {1: 'LONG', -1: 'SHORT', 0: 'FLAT'}[r['latest_signal']]
    print(f"{i:<5} {r['name']:<25} {r['return']:>8.2f}% {r['sharpe']:>8.2f} {r['max_dd']:>7.2f}% {r['trades']:>7.0f} {r['win_rate']:>6.1f}% {r['profit_factor']:>6.2f} {sig_str:>6}")

# Top 5 analysis
print("\n" + "="*100)
print("TOP 5 STRATEGIES - DETAILED ANALYSIS")
print("="*100)

for i, r in enumerate(results_sorted[:5], 1):
    print(f"\n#{i}. {r['name']}")
    print(f"   Total Return: {r['return']:.2f}%")
    print(f"   Sharpe Ratio: {r['sharpe']:.2f} (risk-adjusted performance)")
    print(f"   Max Drawdown: {r['max_dd']:.2f}% (worst losing streak)")
    print(f"   Win Rate: {r['win_rate']:.1f}% ({r['trades']:.0f} total trades)")
    print(f"   Avg Win: {r['avg_win']:.3f}% | Avg Loss: {r['avg_loss']:.3f}%")
    print(f"   Profit Factor: {r['profit_factor']:.2f} (>1.5 is good)")
    sig_str = {1: 'LONG', -1: 'SHORT', 0: 'FLAT'}[r['latest_signal']]
    print(f"   Current Signal: {sig_str}")

# Signal consensus for today
print("\n" + "="*100)
print("TODAY'S SIGNAL CONSENSUS")
print("="*100)

long_count = sum(1 for r in results if r['latest_signal'] == 1)
short_count = sum(1 for r in results if r['latest_signal'] == -1)
flat_count = sum(1 for r in results if r['latest_signal'] == 0)

print(f"\nAll strategies: {long_count} LONG | {short_count} SHORT | {flat_count} FLAT")
print(f"Top 5 strategies: ", end="")
top5_signals = [r['latest_signal'] for r in results_sorted[:5]]
print(f"{top5_signals.count(1)} LONG | {top5_signals.count(-1)} SHORT | {top5_signals.count(0)} FLAT")

best = results_sorted[0]
print(f"\n{'='*100}")
print(f"RECOMMENDED ACTION (based on #{1} strategy: {best['name']})")
print(f"{'='*100}")

if best['latest_signal'] == 1:
    print("[LONG] BUY AUD / SELL USD - Expect AUD to strengthen")
elif best['latest_signal'] == -1:
    print("[SHORT] SELL AUD / BUY USD - Expect AUD to weaken")  
else:
    print("[FLAT] NO TRADE - Wait for clearer opportunity")

if top5_signals.count(best['latest_signal']) >= 4:
    print("\nCONFIDENCE: HIGH - Top strategies agree")
elif top5_signals.count(best['latest_signal']) >= 3:
    print("\nCONFIDENCE: MEDIUM - Most top strategies agree")
else:
    print("\nCONFIDENCE: LOW - Strategies disagree, higher risk")

print(f"{'='*100}")
