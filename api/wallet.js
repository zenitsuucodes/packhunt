// POST /api/wallet {address, message, signature} -> a 30-day wallet session for recording scores.
import { seal, verifySolana } from './_lib/server.js';

const SESSION_DAYS = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { address, message, signature } = req.body || {};
  if (typeof address !== 'string' || typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing wallet details.' });
  }
  // The signed message must name this wallet and be fresh.
  const ts = Number(message.match(/Time: (\d+)/)?.[1]);
  if (!message.startsWith('Packhunt sign-in') || !message.includes(address) || !ts || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return res.status(400).json({ error: 'That sign-in message is invalid or too old.' });
  }
  if (!verifySolana(address, message, signature)) return res.status(401).json({ error: 'Signature check failed.' });
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return res.status(200).json({ session: seal({ w: address, exp }), wallet: address, exp });
}
