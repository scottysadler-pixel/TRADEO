// /api/fx - Daily AUD/USD history and latest from Frankfurter (ECB reference, free, no key).
// Runs on Vercel Edge runtime (portable, zero-config, uses Web Fetch API).
// Query: days (default 260, max 800) or from (YYYY-MM-DD)
// Response: { source, base, quote, updated_at, latest: {date, rate}, history: [{date, rate}, ...] }

export const config = { runtime: 'edge' };

const UPSTREAM_BASE = 'https://api.frankfurter.app';
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const toISO = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(parseInt(searchParams.get('days'), 10) || 260, 800);
    const fromParam = searchParams.get('from');
    let fromDate;
    if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
      fromDate = fromParam;
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
    const [histJ, latestJ] = await Promise.all([histR.json(), latestR.json()]);

    const history = Object.keys(histJ.rates || {}).sort().map(date => ({
      date, rate: histJ.rates[date].USD
    }));
    const latest = { date: latestJ.date, rate: latestJ.rates && latestJ.rates.USD };

    return new Response(JSON.stringify({
      source: 'Frankfurter (ECB reference, daily)',
      base: 'AUD', quote: 'USD',
      updated_at: new Date().toISOString(),
      latest, history
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}
