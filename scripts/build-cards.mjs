// Builds data/cards.json from the open Pokémon TCG data repo (github.com/PokemonTCG/pokemon-tcg-data).
// Only card metadata is stored; images load from images.pokemontcg.io.
// Run: node scripts/build-cards.mjs
import fs from 'node:fs';

const SETS = ['base1', 'base2', 'base3', 'sv3pt5', 'swsh7', 'swsh12pt5', 'sv4pt5', 'sv8pt5'];

// Wrapper colour for each set's booster pack.
const COLORS = {
  base1: '#2a6bd1', base2: '#2e8b3e', base3: '#7b5ea7', sv3pt5: '#d93838',
  swsh7: '#1f6f8b', swsh12pt5: '#c9a227', sv4pt5: '#3a3a8c', sv8pt5: '#d0559a',
};
// Preferred cover art for the wrapper, first match wins.
const COVER = ['Charizard', 'Pikachu', 'Mew', 'Umbreon', 'Rayquaza', 'Mewtwo', 'Eevee', 'Lugia', 'Gengar',
  'Snorlax', 'Sylveon', 'Espeon', 'Dragonite', 'Blastoise', 'Venusaur', 'Terapagos'];

const TIERS = {
  COMMON: ['Common'],
  UNCOMMON: ['Uncommon'],
  RARE: ['Rare'],
  HOLO: ['Rare Holo', 'Double Rare', 'Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR', 'Rare Holo EX',
    'Rare Holo GX', 'Shiny Rare', 'Radiant Rare'],
  GOLDEN: ['Illustration Rare', 'Special Illustration Rare', 'Ultra Rare', 'Rare Ultra', 'Hyper Rare',
    'Rare Rainbow', 'Rare Secret', 'Shiny Ultra Rare'],
};
const tierOf = (rarity) => Object.keys(TIERS).find((t) => TIERS[t].includes(rarity));

const base = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master';
const sets = await (await fetch(`${base}/sets/en.json`)).json();
const out = [];
const setInfo = [];
for (const id of SETS) {
  const setName = sets.find((s) => s.id === id)?.name || id;
  const cards = await (await fetch(`${base}/cards/en/${id}.json`)).json();
  const mine = [];
  for (const c of cards) {
    const tier = tierOf(c.rarity);
    if (!tier || c.supertype !== 'Pokémon' || !c.images?.large) continue;
    const img = c.images.large.replace('https://images.pokemontcg.io/', '').replace(/_hires\.png$/, '');
    mine.push({ id: c.id, set: id, n: c.name, s: setName, r: c.rarity, t: tier, i: img });
  }
  out.push(...mine);
  const shiny = mine.filter((c) => c.t === 'HOLO' || c.t === 'GOLDEN');
  const cover = COVER.map((n) => shiny.find((c) => c.n.startsWith(n))).find(Boolean) || shiny[0] || mine[0];
  setInfo.push({ id, name: setName, color: COLORS[id] || '#3060c0', art: cover.i, golden: mine.some((c) => c.t === 'GOLDEN') });
  console.log(`${id} (${setName}): ${cards.length} cards, cover ${cover.n}`);
}
fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../data/cards.json', import.meta.url), JSON.stringify(out));
fs.writeFileSync(new URL('../data/sets.json', import.meta.url), JSON.stringify(setInfo, null, 1));
const count = {};
for (const c of out) count[c.t] = (count[c.t] || 0) + 1;
console.log(`${out.length} Pokémon cards`, count);
