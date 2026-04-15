/**
 * One-off: align data/commodities.csv and data/rates.csv to data/prices.csv dates.
 * Run: node scripts/build-seed-csvs.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pricesPath = resolve(root, "data/prices.csv");
const text = readFileSync(pricesPath, "utf8");
const lines = text.trim().split(/\n/);
let commodities = "date,gold_close\n";
let rates = "date,rba_rate,fed_rate\n";
const base = 2350;
function rateFor(d) {
  const t = Date.parse(`${d}T12:00:00Z`);
  if (t < Date.parse("2025-06-01T12:00:00Z")) return [4.35, 5.33];
  if (t < Date.parse("2026-01-01T12:00:00Z")) return [4.1, 4.75];
  return [4.1, 4.25];
}
for (let i = 1; i < lines.length; i++) {
  const date = lines[i].split(",")[0];
  const g = (base + i * 0.35 + ((i % 17) * 2.1)).toFixed(2);
  commodities += `${date},${g}\n`;
  const [rb, fd] = rateFor(date);
  rates += `${date},${rb},${fd}\n`;
}
writeFileSync(resolve(root, "data/commodities.csv"), commodities);
writeFileSync(resolve(root, "data/rates.csv"), rates);
console.log(`Wrote data/commodities.csv and data/rates.csv (${lines.length - 1} rows).`);
