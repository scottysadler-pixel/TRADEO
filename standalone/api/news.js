// /api/news - Recent AUD-relevant headlines from GDELT Doc API.
// Free, no key. Rate-limited to ~1 request every 5 seconds per IP, so we
// cache at the Vercel edge (s-maxage=300) to amortise the cost across users.
//
// Query:
//   topic = all | aud | rba | fed | gold | risk  (default 'all')
//   limit = integer 1..50 (default 25)
//
// Response: { source, updated_at, topic, articles: [{title, url, source, seendate}] }

// Keep each topic string short - GDELT rejects very long queries.
// IMPORTANT: GDELT requires OR-joined terms to be wrapped in parentheses.
const TOPICS = {
  aud:  '(AUD OR "Australian dollar" OR AUDUSD)',
  rba:  '("Reserve Bank of Australia" OR RBA OR "cash rate")',
  fed:  '("Federal Reserve" OR FOMC OR "US inflation" OR "nonfarm payrolls")',
  gold: '("gold price" OR "gold futures" OR XAUUSD)',
  risk: '("risk off" OR VIX OR "safe haven")'
};

// 'all' = a *short* combined query that stays under GDELT's length cap (~255).
const ALL_QUERY = '(AUD OR AUDUSD OR RBA OR "Federal Reserve" OR FOMC OR "gold price" OR "risk off" OR VIX)';

function buildQuery(topic) {
  if (topic === 'all') return ALL_QUERY;
  return TOPICS[topic] || TOPICS.aud;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const topic = (req.query.topic || 'all').toString().toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 50);
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
      res.status(429).json({
        error: 'GDELT rate-limited us. Wait 5+ seconds and try again.',
        upstream_note: text.slice(0, 200),
        retry_after_seconds: 6
      });
      return;
    }
    if (!r.ok) throw new Error('GDELT HTTP ' + r.status);

    const ctype = r.headers.get('content-type') || '';
    const body = await r.text();
    if (!ctype.includes('json')) {
      // GDELT returns HTML on some errors ("query too short/long").
      res.status(502).json({
        error: 'GDELT returned non-JSON. Query may be malformed.',
        upstream_note: body.slice(0, 200)
      });
      return;
    }

    let j;
    try { j = JSON.parse(body); }
    catch (e) { res.status(502).json({ error: 'GDELT JSON parse failed', upstream_note: body.slice(0, 200) }); return; }

    const articles = (j.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: a.domain || a.sourcecountry || '',
      seendate: a.seendate,
      language: a.language,
      socialimage: a.socialimage || null
    }));

    res.status(200).json({
      source: 'GDELT Doc API (last 72h, English)',
      updated_at: new Date().toISOString(),
      topic,
      count: articles.length,
      query_used: q,
      articles
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
