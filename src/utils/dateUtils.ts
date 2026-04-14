/**
 * Normalize a date string to YYYY-MM-DD for stable sorting and display.
 * Accepts full ISO strings (e.g. 2024-01-15T00:00:00.000Z) or YYYY-MM-DD.
 */
export function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const dayPart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid date string: "${raw}"`);
    }
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return dayPart;
}

/** Compare two YYYY-MM-DD (or normalized) strings: negative if a < b. */
export function compareIsoDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
