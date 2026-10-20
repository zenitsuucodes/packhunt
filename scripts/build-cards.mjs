// Builds data/cards.json from the open Pokémon TCG data repo (github.com/PokemonTCG/pokemon-tcg-data).
// Only card metadata is stored; images load from images.pokemontcg.io.
// Run: node scripts/build-cards.mjs
import fs from 'node:fs';

const SETS = ['base1', 'base2', 'base3', 'sv3pt5', 'swsh7', 'swsh12pt5', 'sv4pt5', 'sv8pt5'];

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
for (const id of SETS) {
  const setName = sets.find((s) => s.id === id)?.name || id;
  const cards = await (await fetch(`${base}/cards/en/${id}.json`)).json();
  for (const c of cards) {
    const tier = tierOf(c.rarity);
    if (!tier || c.supertype !== 'Pokémon' || !c.images?.large) continue;
    const img = c.images.large.replace('https://images.pokemontcg.io/', '').replace(/_hires\.png$/, '');
    out.push({ id: c.id, n: c.name, s: setName, r: c.rarity, t: tier, i: img });
  }
  console.log(`${id} (${setName}): ${cards.length} cards`);
}
fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../data/cards.json', import.meta.url), JSON.stringify(out));
const count = {};
for (const c of out) count[c.t] = (count[c.t] || 0) + 1;
console.log(`${out.length} Pokémon cards`, count);
