# Packhunt

Pokémon GO, but inside Google Street View. Drop anywhere on Earth, follow the clues, and find 3D voxel booster packs floating in real streets. Rip them open for collectible cards and hunt down the Golden pack.

- 3D packs drawn with three.js on top of the Street View panorama
- Pack opening animation, generated pixel-art cards and 8-bit sound effects
- Pack locations, card rolls and clues are handled on the server (Vercel functions)
- Clues: compass direction, nearby landmark, warmer/colder radar, a photo of the hiding spot, street name

## Run locally

```bash
cp .env.example .env.local   # add your Google Maps key (see SETUP.md)
npm run dev                  # http://localhost:5200
```

Try the pack opening without any keys at `http://localhost:5200/?demo`.

See [SETUP.md](SETUP.md) for the Google key, Upstash and Vercel steps.
