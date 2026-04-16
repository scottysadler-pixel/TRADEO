// /api/rates - Current RBA + Fed policy rates. Hand-maintained.
// Runs on Vercel Edge runtime. Zero upstream dependencies.
// Edit the RATES constant and commit when the RBA/Fed change policy.

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const RATES = {
  rba: {
    name: 'RBA cash rate target',
    rate: 4.35,
    last_change: '2023-11-07',
    direction: 'hike',
    source_url: 'https://www.rba.gov.au/statistics/cash-rate/'
  },
  fed: {
    name: 'US Fed Funds target (upper bound)',
    rate: 5.50,
    last_change: '2023-07-26',
    direction: 'hike',
    source_url: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm'
  },
  as_of: '2024-02-14',
  note: 'TEMPLATE baked into the repo. Check the source URLs vs the numbers above. If they disagree, edit standalone/api/rates.js, commit, and Vercel will redeploy.'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const diff = +(RATES.rba.rate - RATES.fed.rate).toFixed(2);
  const body = {
    source: 'Hand-maintained in standalone/api/rates.js',
    updated_at: new Date().toISOString(),
    as_of: RATES.as_of,
    rba: RATES.rba,
    fed: RATES.fed,
    differential_rba_minus_fed: diff,
    note: RATES.note
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600'
    }
  });
}
