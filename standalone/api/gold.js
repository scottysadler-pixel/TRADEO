// /api/gold - Daily gold (GC=F futures) history + latest close from Yahoo Finance.
// Yahoo's public chart endpoint is free and no-key. We call it server-side
// (via this Vercel function) so the iPad browser never hits it directly.
// Query: days (default 260, max 800). Internally we request `range` big
// enough to cover that and slice down.
// Response: { source, symbol, updated_at, latest: {date, close}, history: [{date, close}] }

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toISO(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

function pickRange(days) {
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 180) return '6mo';
  if (days <= 260) return '1y';
  return '2y';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=7200');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 260, 10), 800);
  const range = pickRange(days);
  const symbol = 'GC=F'; // COMEX gold front-month future, trades alongside spot
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol)
    + '?interval=1d&range=' + range + '&includePrePost=false&events=div%2Csplit';

  try {
    const r = await fetch(url, { headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; trade1-ipad/1.0)',
      'Accept': 'application/json'
    }});
    if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
    const j = await r.json();
    const result = j && j.chart && j.chart.result && j.chart.result[0];
    if (!result) throw new Error('Yahoo: empty result');
    const timestamps = result.timestamp || [];
    const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const closes = quote.close || [];
    if (!timestamps.length || !closes.length) throw new Error('Yahoo: no bars');

    const rows = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (typeof c !== 'number' || !isFinite(c)) continue;
      rows.push({ date: toISO(timestamps[i] * 1000), close: +c.toFixed(2) });
    }
    const sliced = rows.slice(-days);
    const latest = sliced[sliced.length - 1];

    res.status(200).json({
      source: 'Yahoo Finance (GC=F gold front-month future, daily)',
      symbol,
      updated_at: new Date().toISOString(),
      range_used: range,
      latest: { date: latest.date, close: latest.close },
      history: sliced,
      notes: 'Previous session close. GC=F tracks spot gold very closely.'
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
