// /api/rates - Current RBA + Fed policy rates.
// Hand-maintained: edit the RATES constant below, commit, Vercel redeploys.
// Why hand-maintained? Free / no-key RBA + Fed feeds either block browsers (CORS)
// or require API keys. Baking the number into a serverless function is the most
// honest option for a self-contained iPad app: one-line edit when policy changes.

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const diff = +(RATES.rba.rate - RATES.fed.rate).toFixed(2);
  res.status(200).json({
    source: 'Hand-maintained in standalone/api/rates.js',
    updated_at: new Date().toISOString(),
    as_of: RATES.as_of,
    rba: RATES.rba,
    fed: RATES.fed,
    differential_rba_minus_fed: diff,
    note: RATES.note
  });
}
