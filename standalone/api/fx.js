// /api/fx - Daily AUD/USD history and latest from Frankfurter (ECB reference, free, no key).
// Query params:
//   days  = integer, default 260 (~1 trading year). Max 800.
//   from  = ISO date (YYYY-MM-DD) -- optional, overrides days
// Response:
//   { source, base, quote, updated_at, latest: {date, rate}, history: [{date, rate}, ...] }

const UPSTREAM_BASE = 'https://api.frankfurter.app';

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toISO(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const days = Math.min(parseInt(req.query.days, 10) || 260, 800);
    let fromDate;
    if (typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      fromDate = req.query.from;
    } else {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - days);
      fromDate = toISO(d);
    }
    const toDate = toISO(new Date());

    const histUrl = `${UPSTREAM_BASE}/${fromDate}..${toDate}?from=AUD&to=USD`;
    const latestUrl = `${UPSTREAM_BASE}/latest?from=AUD&to=USD`;

    const [histR, latestR] = await Promise.all([fetch(histUrl), fetch(latestUrl)]);
    if (!histR.ok) throw new Error('Frankfurter history HTTP ' + histR.status);
    if (!latestR.ok) throw new Error('Frankfurter latest HTTP ' + latestR.status);
    const histJ = await histR.json();
    const latestJ = await latestR.json();

    const history = Object.keys(histJ.rates || {}).sort().map(date => ({
      date, rate: histJ.rates[date].USD
    }));
    const latest = { date: latestJ.date, rate: latestJ.rates && latestJ.rates.USD };

    res.status(200).json({
      source: 'Frankfurter (ECB reference, daily)',
      base: 'AUD', quote: 'USD',
      updated_at: new Date().toISOString(),
      latest, history
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
