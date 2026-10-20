// Optional Solana wallet sign-in (Phantom, Solflare or Backpack) so finished hunts count on the leaderboard.
const KEY = 'packhunt_wallet';

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export const shortAddr = (a) => (a ? `${a.slice(0, 4)}...${a.slice(-4)}` : '');

function provider() {
  return window.phantom?.solana || window.solflare || window.backpack || (window.solana?.connect ? window.solana : null);
}

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

export async function connectWallet() {
  const p = provider();
  if (!p) {
    // On phones, reopen the site inside Phantom's built-in browser.
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      location.href = `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;
      return { pending: true };
    }
    return { error: 'No Solana wallet found. Install Phantom or Solflare, then try again.' };
  }
  try {
    const resp = await p.connect();
    const address = (resp?.publicKey || p.publicKey).toString();
    const message = `Packhunt sign-in\nWallet: ${address}\nTime: ${Date.now()}\nThis only proves you own this wallet. It costs nothing.`;
    const signed = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    const signature = toB64(signed.signature || signed);
    const r = await fetch('/api/wallet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, message, signature }),
    });
    const j = await r.json();
    if (!r.ok) return { error: j.error || 'Wallet sign-in failed.' };
    localStorage.setItem(KEY, JSON.stringify(j));
    return j;
  } catch (e) {
    return { error: e?.message?.includes('reject') ? 'Sign-in cancelled.' : 'Wallet sign-in failed.' };
  }
}

export function disconnectWallet() {
  try { localStorage.removeItem(KEY); } catch {}
  try { provider()?.disconnect?.(); } catch {}
}
