// /api/news - Recent AUD-relevant headlines from GDELT Doc API (free, no key).
// Runs on Vercel Edge runtime.
// Query: topic=all|aud|rba|fed|gold|risk (default 'all'), limit 1..50 (default 25)

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// GDELT requires OR-joined terms to be wrapped in parentheses.
const TOPICS = {
  aud:  '(AUD OR "Australian dollar" OR AUDUSD)',
  rba:  '("Reserve Bank of Australia" OR RBA OR "cash rate")',
  fed:  '("Federal Reserve" OR FOMC OR "US inflation" OR "nonfarm payrolls")',
  gold: '("gold price" OR "gold futures" OR XAUUSD)',
  risk: '("risk off" OR VIX OR "safe haven")'
};
const ALL_QUERY = '(AUD OR AUDUSD OR RBA OR "Federal Reserve" OR FOMC OR "gold price" OR "risk off" OR VIX)';

function buildQuery(topic) {
  if (topic === 'all') return ALL_QUERY;
  return TOPICS[topic] || TOPICS.aud;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const { searchParams } = new URL(req.url);
    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 25, 1), 50);
    const q = buildQuery(topic) + ' sourcelang:eng';

    const url = 'https://api.gdeltproject.org/api/v2/doc/doc'
      + '?format=json'
      + '&mode=ArtList'
      + '&maxrecords=' + limit
      + '&sort=DateDesc'
      + '&timespan=72h'
      + '&query=' + encodeURIComponent(q);

    const r = await fetch(url, { headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; trade1-ipad/1.0)'
    }});

    if (r.status === 429) {
      const text = await r.text();
      return new Response(JSON.stringify({
        error: 'GDELT rate-limited us. Wait 5+ seconds and try again.',
        upstream_note: text.slice(0, 200),
        retry_after_seconds: 6
      }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!r.ok) throw new Error('GDELT HTTP ' + r.status);

    const ctype = r.headers.get('content-type') || '';
    const body = await r.text();
    if (!ctype.includes('json')) {
      return new Response(JSON.stringify({
        error: 'GDELT returned non-JSON. Query may be malformed.',
        upstream_note: body.slice(0, 200)
      }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    let j;
    try { j = JSON.parse(body); }
    catch {
      return new Response(JSON.stringify({ error: 'GDELT JSON parse failed', upstream_note: body.slice(0, 200) }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const articles = (j.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: a.domain || a.sourcecountry || '',
      seendate: a.seendate,
      language: a.language,
      socialimage: a.socialimage || null
    }));

    return new Response(JSON.stringify({
      source: 'GDELT Doc API (last 72h, English)',
      updated_at: new Date().toISOString(),
      topic,
      count: articles.length,
      query_used: q,
      articles
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}
