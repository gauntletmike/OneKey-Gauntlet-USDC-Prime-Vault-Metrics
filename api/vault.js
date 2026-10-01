import { summary, history, holders, transactions } from '../lib/morpho.js';

function integer(value, fallback, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) > max) throw new Error('Invalid pagination or range');
  return Number(value);
}
export async function getPayload(params) {
  const action = params.get('action') || 'summary';
  const page = integer(params.get('page'), 0, 10_000);
  if (action === 'summary') return summary();
  if (action === 'history') {
    const days = integer(params.get('days'), 90, 365);
    if (![7,30,90,365].includes(days)) throw new Error('Invalid history range');
    return history(days);
  }
  if (action === 'holders') return holders(page);
  if (action === 'transactions') {
    const type = params.get('type') || 'All';
    if (!['All','Deposit','Withdraw','Transfer'].includes(type)) throw new Error('Invalid transaction type');
    const days = integer(params.get('days'), 0, 90);
    if (![0,7,30,90].includes(days)) throw new Error('Invalid activity range');
    return transactions(page,type,days);
  }
  throw new Error('Unknown action');
}
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({ error: 'Use GET' }); }
  try {
    const params = new URL(req.url, 'https://vault.local').searchParams;
    const data = await getPayload(params);
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(data);
  } catch (error) {
    const badRequest = /Invalid |Unknown action/.test(error.message);
    res.setHeader('Cache-Control','no-store');
    console.error('Vault analytics request failed:', error.message);
    return res.status(badRequest ? 400 : 502).json({ error: badRequest ? error.message : 'Morpho data is temporarily unavailable. Please retry shortly.' });
  }
}
