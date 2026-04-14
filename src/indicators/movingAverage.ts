/**
 * Simple moving average (SMA) over a sliding window: each point is the arithmetic mean
 * of the last `period` prices including the current index.
 *
 * For indices `0 .. period-2` there is insufficient history; those entries are **null**.
 * The first numeric SMA appears at index `period-1` (50-day SMA needs 50 closes, etc.).
 *
 * Implementation uses an O(n) rolling sum for clarity; no need for micro-optimisation here.
 */
export function simpleMovingAverage(
  values: number[],
  period: number
): (number | null)[] {
  if (period < 1) {
    throw new Error(`SMA period must be >= 1, got ${period}`);
  }
  const out: (number | null)[] = [];
  let windowSum = 0;
  for (let i = 0; i < values.length; i++) {
    windowSum += values[i];
    if (i >= period) {
      windowSum -= values[i - period];
    }
    if (i < period - 1) {
      out.push(null);
    } else {
      out.push(windowSum / period);
    }
  }
  return out;
}
