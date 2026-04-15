/**
 * Shared: read FX close from `audusd_close` OR `fx_close` (mutually exclusive).
 */
import type { PriceColumnUsed } from "../types.js";

export function parseNumberStrict(
  value: string,
  ctx: string
): number {
  const n = Number(String(value).trim());
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number in ${ctx}: "${value}"`);
  }
  return n;
}

export function resolvePriceFromRecord(
  rec: Record<string, string>,
  ctx: string
): { close: number; which: PriceColumnUsed } {
  const hasAud =
    "audusd_close" in rec &&
    rec.audusd_close !== undefined &&
    String(rec.audusd_close).trim() !== "";
  const hasFx =
    "fx_close" in rec &&
    rec.fx_close !== undefined &&
    String(rec.fx_close).trim() !== "";
  if (hasAud && hasFx) {
    throw new Error(`${ctx}: use only one of audusd_close or fx_close`);
  }
  if (hasAud) {
    return {
      close: parseNumberStrict(rec.audusd_close!, ctx + " audusd_close"),
      which: "audusd_close",
    };
  }
  if (hasFx) {
    return {
      close: parseNumberStrict(rec.fx_close!, ctx + " fx_close"),
      which: "fx_close",
    };
  }
  throw new Error(
    `${ctx}: missing price column (need audusd_close or fx_close)`
  );
}
