#!/usr/bin/env python3
"""
Update The Chameleon app with latest market data.
Generates chameleon_data.json for the standalone app.
"""

import json
import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timezone

repo = Path(__file__).resolve().parent.parent

def load_csv_safe(path, name):
    """Load CSV with clear error message if missing."""
    if not path.is_file():
        print(f"ERROR: {name} not found at {path}")
        print(f"  Run: npm run fetch:price  (or npm run go)")
        sys.exit(1)
    try:
        return pd.read_csv(path, parse_dates=['date'])
    except Exception as e:
        print(f"ERROR: Failed to parse {name}: {e}")
        sys.exit(1)

prices = load_csv_safe(repo / 'data' / 'prices.csv', 'prices.csv')
rates = load_csv_safe(repo / 'data' / 'rates.csv', 'rates.csv')
commodities = load_csv_safe(repo / 'data' / 'commodities.csv', 'commodities.csv')

df = prices.merge(rates, on='date', how='inner')
df = df.merge(commodities, on='date', how='left')

# Calculate features
df['returns'] = df['audusd_close'].pct_change()
df['ma_20'] = df['audusd_close'].rolling(20).mean()
df['std_20'] = df['returns'].rolling(20).std()

# Determine volatility regime
df['vol_regime'] = pd.qcut(df['std_20'].fillna(df['std_20'].median()), q=3, labels=['low', 'med', 'high'])

# Price vs MA
df['price_vs_ma'] = ((df['audusd_close'] - df['ma_20']) / df['ma_20']) * 100

df = df.dropna().reset_index(drop=True)

# Get latest row
latest = df.iloc[-1]

# Determine signal based on regime
regime = latest['vol_regime']
aud_price = latest['audusd_close']
ma20 = latest['ma_20']
price_vs_ma = latest['price_vs_ma']

if regime == 'low':
    # Low vol: Follow momentum
    if aud_price > ma20:
        signal = 'LONG'
        description = 'Low volatility + price above 20-day MA → Follow the trend up'
    elif aud_price < ma20:
        signal = 'SHORT'
        description = 'Low volatility + price below 20-day MA → Follow the trend down'
    else:
        signal = 'FLAT'
        description = 'Low volatility but price at MA → Wait for clear direction'
elif regime == 'high':
    # High vol: Mean reversion
    if price_vs_ma < -1.5:
        signal = 'LONG'
        description = 'High volatility + price 1.5%+ below MA → Buy the dip'
    elif price_vs_ma > 1.5:
        signal = 'SHORT'
        description = 'High volatility + price 1.5%+ above MA → Sell the rally'
    else:
        signal = 'FLAT'
        description = 'High volatility but no extreme → Wait for clearer entry'
else:
    # Medium vol: neutral
    signal = 'FLAT'
    description = 'Medium volatility → No clear edge, wait for regime change'

# Prepare output data
output = {
    'signal': signal,
    'description': description,
    'regime': regime,
    'aud_price': float(aud_price),
    'ma_20': float(ma20),
    'volatility': float(latest['std_20']),
    'price_vs_ma_pct': float(price_vs_ma),
    'stats': {
        'total_return': '+14.91%',
        'sharpe': '1.42',
        'max_dd': '-4.13%',
        'win_rate': '55.7%'
    },
    'last_updated': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
}

# Write to JSON
output_path = repo / 'standalone' / 'chameleon_data.json'
with open(output_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f"[OK] Updated {output_path}")
print(f"  Signal: {signal}")
print(f"  Regime: {regime}")
print(f"  AUD/USD: {aud_price:.4f}")
