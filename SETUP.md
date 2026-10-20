# Packhunt setup

You need 3 free things: Google Maps keys, an Upstash database and a Vercel deploy. It takes about 20 minutes.

## 1. One Google Maps key (about 5 min)

1. Open https://console.cloud.google.com/google/maps-apis/start. It's Google's guided setup: it creates a project, asks for a billing card and gives you an API key. Copy the key.
   - The card is required, but the free monthly allowances cover a game this size.
2. Open https://console.cloud.google.com/apis/library/street-view-image-backend.googleapis.com and click **Enable** (Street View Static API).
   - Also check that **Maps JavaScript API** is enabled. The guided setup usually turns it on.
3. Open https://console.cloud.google.com/apis/credentials and click your key:
   - **Application restrictions → Websites**. Add `http://localhost:5200/*`, and later `https://YOUR-APP.vercel.app/*`.
   - **API restrictions → Restrict key**: tick **Maps JavaScript API** and **Street View Static API**. Click **Save**.
4. Optional safety net: **Billing → Budgets & alerts → Create budget** for $1, with email alerts.

You only need this one key. The server sends your site's address with each request, so the website restriction still lets it through.

## 2. Upstash Redis (about 3 min, turns on the hunt limits)

1. Go to https://console.upstash.com, sign up and click **Create Database**.
2. Name it **packhunt**, pick a region close to you, and choose the **Free** plan.
3. On the database page, under **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 3. Play locally

1. Copy `.env.example` to `.env.local` in this folder and fill it in:
   - `MAPS_BROWSER_KEY`: your key from step 1. Leave `MAPS_SERVER_KEY` empty.
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: from step 2
   - `TOKEN_SECRET`: a random string. Make one with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Restart the dev server (`npm run dev` in this folder) and open http://localhost:5200.

## 4. Deploy to Vercel

1. `npm i -g vercel`, then run `vercel` in this folder and accept the defaults.
2. In the Vercel dashboard: **Project → Settings → Environment Variables**. Add the same values as in `.env.local`, plus `SITE_URL=https://YOUR-APP.vercel.app/`.
3. Run `vercel --prod`. You get a URL like `https://packhunt-xyz.vercel.app`.
4. Go back to Google Cloud and add `https://packhunt-xyz.vercel.app/*` to the **browser key**'s website list.

## What it costs

| Google product | Free per month | What uses it |
|---|---|---|
| Dynamic Street View | 5,000 | one per hunt (walking around inside it is free) |
| Street View Static | 10,000 | the photo clue + free metadata lookups |
| Dynamic Maps | 10,000 | the "Pick a spot" world map |

The server stops new hunts at `MONTHLY_HUNT_CAP` (4,500) and `DAILY_HUNTS_PER_IP` (10), so normal play stays at $0.
