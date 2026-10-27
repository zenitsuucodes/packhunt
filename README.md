<p align="center">
  <img src="assets/readme-logo.webp" alt="Packhunt logo" width="220">
</p>

<h1 align="center">Packhunt</h1>

<p align="center">
  A treasure hunt inside Google Street View. Follow the clues, find 3D booster packs floating in real streets, and rip them open for Pokémon cards.
</p>

<p align="center">
  <a href="https://packhunt-nine.vercel.app"><b>Play now</b></a>
</p>

---

## How it works

1. **Drop in.** Pick a challenge at a famous spot, or drop anywhere on Earth.
2. **Follow the clues.** They unlock over time: a compass direction, a warmer/colder radar, a nearby landmark, a photo of the hiding spot and the street name.
3. **Find the packs.** Walk with the normal Street View controls. Packs appear in 3D when you get close.
4. **Rip them open.** Every pack holds a real card from its set. Find the Golden pack before the timer runs out to finish the hunt.

## Features

- **12 challenges** at famous spots, including Times Square, Shibuya Crossing, the Colosseum and Lombard Street
- **Drop anywhere** with place search. The game builds a challenge from what's actually around you
- **Realistic 3D packs** with each set's logo and cover art, from Base Set to Prismatic Evolutions
- **Holo-foil card reveals** over a photo of the street where you found the card
- **Your bag** keeps every card you collect, with a zoomable card viewer
- **Solana wallet sign-in** (optional) to record your collected cards
- **Live Street View title screen** that loops through famous places

## Built with

- Google Maps JavaScript API (Street View), Street View Static API and Places API (New)
- three.js for the 3D packs and pack opening
- Vercel functions for hunts, clues and card rolls, with Upstash Redis for limits and saved cards
- Card data from the community [Pokémon TCG data](https://github.com/PokemonTCG/pokemon-tcg-data) project

## Run locally

```bash
cp .env.example .env.local
npm run dev
```

Add your Google Maps key to `.env.local` first ([SETUP.md](SETUP.md) has the steps). The game runs at `http://localhost:5200`, and `http://localhost:5200/?demo` shows the pack opening without any keys.

## Disclaimer

Packhunt is an unofficial fan project. It is not affiliated with, endorsed, sponsored or approved by Nintendo, The Pokémon Company, Creatures Inc. or GAME FREAK. Pokémon and all related names, characters and card images are trademarks and © of their respective owners. Cards in Packhunt are digital collectibles only, with no monetary value.
