# Packhunt

Pokémon GO, but inside Google Street View. Drop anywhere on Earth, follow the clues, and find 3D voxel booster packs floating in real streets. Rip them open for collectible cards and hunt down the Golden pack.

- Realistic 3D booster packs (foil wrapper, crimped ends, set logo and cover art) floating in the Street View panorama
- 12 timed challenges at famous spots (Times Square, Shibuya, the Colosseum and more), plus harder wild drops anywhere
- Optional Solana wallet sign-in to record finished hunts on a weekly leaderboard for creator rewards
- Pack opening animation and 8-bit sound effects
- Real Pokémon TCG cards (common, uncommon, rare, holo and golden-tier pulls) shown with a textured holo-foil effect over a Street View photo of where each card was found
- Pack locations, card rolls and clues are handled on the server (Vercel functions)
- Clues: compass direction, nearby landmark, warmer/colder radar, a photo of the hiding spot, street name

## Run locally

```bash
cp .env.example .env.local   # add your Google Maps key (see SETUP.md)
npm run dev                  # http://localhost:5200
```

Try the pack opening without any keys at `http://localhost:5200/?demo`.

See [SETUP.md](SETUP.md) for the Google key, Upstash and Vercel steps.

The card pool lives in `data/cards.json`. Rebuild it with `node scripts/build-cards.mjs` (edit `SETS` to change which sets can be pulled).

## Disclaimer

**Packhunt is an unofficial fan project. It is not affiliated with, endorsed, sponsored or approved by Nintendo, The Pokémon Company, Creatures Inc. or GAME FREAK.** Pokémon and all related names, characters and card images are trademarks and © of their respective owners. Cards in Packhunt are digital collectibles only, with no monetary value, and can't be bought, sold or traded. Card data comes from the community [Pokémon TCG data](https://github.com/PokemonTCG/pokemon-tcg-data) project, and card images load from `images.pokemontcg.io`. This is a free, non-commercial personal project.
