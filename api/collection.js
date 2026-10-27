// GET /api/collection?wallet=<address> -> the cards recorded for that wallet, newest first.
import { HAS_REDIS, walletCards, base58 } from './_lib/server.js';

export default async function handler(req, res) {
  const wallet = String(req.query?.wallet || '');
  if (base58(wallet)?.length !== 32) return res.status(400).json({ error: 'Not a Solana wallet address.' });
  if (!HAS_REDIS) return res.status(200).json({ enabled: false, wallet, cards: [] });
  try {
    return res.status(200).json({ enabled: true, wallet, cards: await walletCards(wallet) });
  } catch {
    return res.status(200).json({ enabled: false, wallet, cards: [] });
  }
}
