#!/usr/bin/env python3
"""
Update The Catchup Trader app with latest market data.
Generates catchup_data.json for the standalone app.
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
commodities = load_csv_safe(repo / 'data' / 'commodities.csv', 'commodities.csv')

df = prices.merge(commodities, on='date', how='inner')

# Calculate momentum
df['gold_mom_5'] = df['gold_close'].pct_change(5) * 100
df['aud_mom_5'] = df['audusd_close'].pct_change(5) * 100

df = df.dropna().reset_index(drop=True)


def catchup_signal_for_row(gold_m, aud_m, gold_thr=2.0, aud_thr=1.0):
    """Return (signal, is_diverged) for the Catchup rules."""
    if gold_m > gold_thr and aud_m < aud_thr:
        return 'LONG', True
    if gold_m < -gold_thr and aud_m > -aud_thr:
        return 'SHORT', True
    return 'FLAT', False


# Get latest
latest = df.iloc[-1]
gold_mom = latest['gold_mom_5']
aud_mom = latest['aud_mom_5']

# Detect divergence and determine signal
GOLD_THRESHOLD = 2.0
AUD_THRESHOLD = 1.0

is_diverged = False
signal = 'FLAT'
description = 'Markets moving in sync - no divergence opportunity'
explanation = f"Gold is {gold_mom:+.2f}% and AUD is {aud_mom:+.2f}% over 5 days. They're moving together."

# Gold up but AUD not following
if gold_mom > GOLD_THRESHOLD and aud_mom < AUD_THRESHOLD:
    is_diverged = True
    signal = 'LONG'
    description = f'Gold up {gold_mom:+.2f}% but AUD only {aud_mom:+.2f}% → Buy AUD catchup'
    explanation = f"Gold has rallied {gold_mom:+.2f}% but AUD has only moved {aud_mom:+.2f}%. AUD tends to follow gold (commodity correlation). Buy AUD now to catch the delayed move up."

# Gold down but AUD not following
elif gold_mom < -GOLD_THRESHOLD and aud_mom > -AUD_THRESHOLD:
    is_diverged = True
    signal = 'SHORT'
    description = f'Gold down {gold_mom:+.2f}% but AUD only {aud_mom:+.2f}% → Sell AUD catchdown'
    explanation = f"Gold has fallen {gold_mom:+.2f}% but AUD has only moved {aud_mom:+.2f}%. AUD will likely follow gold lower. Sell AUD now before it catches down."

# Both moving same direction strongly (aligned, no trade)
elif (gold_mom > GOLD_THRESHOLD and aud_mom > AUD_THRESHOLD) or \
     (gold_mom < -GOLD_THRESHOLD and aud_mom < -AUD_THRESHOLD):
    explanation = f"Gold ({gold_mom:+.2f}%) and AUD ({aud_mom:+.2f}%) are moving together. No catchup trade available - they're already aligned."

# Prepare output
output = {
    'signal': signal,
    'description': description,
    'gold_momentum': float(gold_mom),
    'aud_momentum': float(aud_mom),
    'is_diverged': is_diverged,
    'explanation': explanation,
    'stats': {
        'total_return': '+13.26%',
        'sharpe': '1.30',
        'max_dd': '-3.26%',
        'win_rate': '56.7%',
        'trades': '143'
    },
    'last_updated': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
}

# Write to JSON
output_path = repo / 'standalone' / 'catchup_data.json'
with open(output_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f"[OK] Updated {output_path}")
print(f"  Signal: {signal}")
print(f"  Gold momentum: {gold_mom:+.2f}%")
print(f"  AUD momentum: {aud_mom:+.2f}%")
print(f"  Diverged: {is_diverged}")

# Rolling history (for Sandbox replay). Last ~250 trading days.
HISTORY_WINDOW = 250
hist_df = df.tail(HISTORY_WINDOW).copy()
history_rows = []
for _, row in hist_df.iterrows():
    gm = float(row['gold_mom_5'])
    am = float(row['aud_mom_5'])
    sig, diverged = catchup_signal_for_row(gm, am, GOLD_THRESHOLD, AUD_THRESHOLD)
    history_rows.append({
        'date': row['date'].strftime('%Y-%m-%d'),
        'signal': sig,
        'price': float(row['audusd_close']),
        'gold_momentum': gm,
        'aud_momentum': am,
        'is_diverged': bool(diverged),
    })

history_out = {
    'strategy': 'catchup',
    'last_updated': output['last_updated'],
    'count': len(history_rows),
    'rows': history_rows,
}
history_path = repo / 'standalone' / 'catchup_history.json'
with open(history_path, 'w') as f:
    json.dump(history_out, f, indent=2)
print(f"[OK] Updated {history_path} ({len(history_rows)} rows)")
