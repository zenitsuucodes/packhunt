# Packhunt build plan

Agreed by Claude and GPT-6.1-Sol (via Codex) on 2026-10-20 after two rounds of debate.

## Game
- Virtual treasure hunt in Google Street View. Players move with the normal Street View controls (arrows, click-to-go, drag). No GPS, nobody physically moves.
- Drop anywhere: the server checks that the area has enough Street View, otherwise it retries nearby or suggests a city.
- **Solo only.** No rooms, codes or groups. Anyone opens the site and plays their own hunt.
- Each hunt hides 4 normal packs + 1 Golden pack around the player's drop point.
- **Update 2026-10-20: packs are digital-only collectibles with no real value, so there's no prize pool and no claim codes.** The prize pool notes below are no longer used.
- (Old) Real prizes come from a **weekly prize pool** on the server. The owner sets N real packs per week (default 3), and it resets every Monday 00:00 UTC.
  - The first N Golden finds of the week get a real claim code. Taking a pack from the pool is atomic (Redis `DECR` on `pool:{week}`, undone if it goes below 0).
  - After that, the Golden is digital only: *"The prize pool is empty, check back Monday!"*, plus bonus points.
  - The title screen shows how many real packs are left this week, which pulls players back.
  - One real prize per player per week (checked by IP and a device ID), so one person can't drain the pool.
  - Free entry, owner-funded prizes, and no paid retries or cash-out.
- Clues unlock on a server timer. Opening normal packs earns hint shortcuts.

## Stack
- Viewer: Maps JavaScript API `StreetViewPanorama`. Google bills once per viewer created, and moving around inside it is free. 5,000 free per month, then $14 per 1,000. Create one viewer per session and reuse it between rounds.
- Packs drawn inside the scene: legacy `google.maps.Marker` on the panorama first. It's deprecated but still works, and it's anchored to the ground. A custom projected overlay comes later: ground pitch = atan2(-cameraHeight, distance).
- Backend: Vercel Functions (Hobby plan) + Upstash Redis Free (500k commands per month).
- Hunt generation on the server: pick random points around the drop, then snap them with the Street View Static **metadata** endpoint, which is free and unlimited. Don't crawl or store a link graph (Google's Tiles terms raise a compliance question about that). Don't rely on pano IDs being the same across APIs.
- **Stateless hunts, no database per move:** the server encrypts the hunt (pack points, opened packs, start time) into a token the client holds but can't read. Each move sends `{token, lat, lng}`. The server decrypts it, checks the jump is a believable distance for the time elapsed, and returns packs within about 30m (contents hidden until opened), warmer/colder, and an updated token. Accept that a modified client can cheat on movement.
- Rarity rolls happen on the server. Redis is used only for: the admission counter, the prize pool, Golden claim codes (`SET NX`, one claim per hunt) and an optional global best-times leaderboard. That's a few commands per hunt, so the free tier covers thousands of hunts a month.
- The owner has a page to check and redeem claim codes.

## Hints (≈$0)
1. Compass direction + distance band from the start
2. "At least N turns away"
3. A named landmark nearby, from one cached Overpass query per room (skipped if none is found)
4. Warmer/colder after each move
5. Postcard photo of the hiding spot from Street View Static (10k free per month)
6. Street name + final direction

## Cost protection (no true hard cap exists with a browser key)
- Dedicated Google project. The browser key is restricted to the production domain and Maps JS (+ Street View Static). The server key is restricted to Street View Static metadata.
- Admission gate: the viewer is only created after `POST /api/admit` passes. Monthly counter in Redis, about 4,500, rate-limited, refuses if anything fails.
- Rate-limit new hunts per IP (e.g. 5 a day). The site is open to anyone, so the admission counter and the per-IP limit are the main protection. Consider posting a video on X first and opening the link later.
- Budget alerts + an emergency billing-disable function for the Maps project. Google's billing data can lag by up to about a day, so this limits the damage but isn't a hard cap.

## Build order
1. Milestone 1: admission gate + per-IP limit, restricted keys, server-generated hunt in an encrypted token, persistent viewer, normal packs, Golden claim with the prize pool, owner redeem page.
2. Movement checks, server-side rolls, reconnect handling.
3. Hint ladder + Overpass landmarks + hint shortcuts from normal packs.
4. Drop anywhere with area checks, then sprite polish (custom overlay, shadow).
5. Emergency shutdown + quota measurement before anything public.
