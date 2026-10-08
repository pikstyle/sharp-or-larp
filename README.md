# sharp-or-larp

Drop a GitHub link, a CV, or both. The LARP meter tells you if they're sharp or larping.

## Larp Alert
This project was 99% vibe coded. 

## Run locally

Requires Node.js 22.12+ and an [Anthropic API key](https://console.anthropic.com) (the verdict uses Claude Haiku 5.5).

Create a `.dev.vars` file:

```
GITHUB_TOKEN="github_pat_..."
ANTHROPIC_API_KEY="sk-ant-..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

`GITHUB_TOKEN` needs read-only access to public data. The Stripe keys are only needed for ads.

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`. To test ad payments, forward Stripe's webhooks with the [Stripe CLI](https://docs.stripe.com/stripe-cli): `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to localhost:5173/api/stripe/webhook`.

## Structure

```
src/                React front
├── App.tsx         The page: form, meter, verdict, ad slots
├── LarpMeter.tsx   The gauge
├── LoadingPhrase.tsx  Rotating "Cooking…" lines while it checks
├── CvPicker.tsx    Picks the CV, rejects non-CVs right away, × to remove it
├── AdSlots.tsx     Ads with their score, the "place my ad" offer, the buy form
├── zones.ts        The 5 LARP zones and their colors
├── readCv.ts       Reads a PDF CV in the browser
└── api.ts          Calls to our API
worker/             API server (Cloudflare Worker)
├── main.ts         Route menu: which route runs what, behind which guards
├── guards.ts       Rate limits and same-site checks
├── analyze.ts      POST /api/analyze, step by step
├── github.ts       Fetches profile, repos and activity from GitHub
├── cvCheck.ts      Tells if a text reads like a CV (used by front and server)
├── cv.ts           Sorts and follows the CV's links
├── web.ts          Opens web pages (website, CV links) and reads their text
├── dossier.ts      Turns raw data into an evidence dossier
├── score.ts        Scores the numbers, then blends in the LLM's gut feeling
├── judge.ts        Asks Claude Haiku for its gut feeling on the texts
├── checks.ts       Saves each score, so an ad can show it untouched
├── ads.ts          Ad slots, Stripe checkout and webhook
└── types.ts        Shapes shared with the front, and ApiError
migrations/         Database tables (D1)
public/_headers     Security headers for the site (CSP…)
```
