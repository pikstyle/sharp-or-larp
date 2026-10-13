# Sharp or Larp

Drop a GitHub link, a CV, or both. The LARP meter tells you if they're sharp or larping.

Try it: [sharporlarp.com](https://sharporlarp.com)

## Larp Alert
This project was 99% vibe coded. 

## What it scans

- **GitHub profile** (official API): bio, profile README, followers vs following
- **Repos**: the 100 most recently pushed, own vs forks, empty ones, stars, commit counts
- **Activity**: contributions and active weeks over the last year, bursts of repos created the same week, auto-commit repos full of identical messages
- **Real collaboration**: PRs merged into other people's repos, and how big those repos are
- **Top 5 projects** (pinned first, then most starred): README, issues opened by others, share of commits written by AI agents, AI builders (Lovable, Bolt, v0…)
- **Their website** (from the bio): home page + up to 3 inner pages
- **Optional CV** (PDF, read in your browser): its text, and every link in it gets opened

## How the score is built

- **Facts, in plain code**: starts at 58% and moves with each signal
  - Sharp: stars on a project they really worked on, more followers than following, steady contributions, PRs merged elsewhere
  - Larp: flashy profile README with little work behind it, follow-farming, empty repos, more forks than own repos, fake auto-commits, zero stars, vibe-coded projects nobody uses, dead website
- **Vibe, from Claude Haiku**: reads the texts (bio, READMEs, website, CV) and gives a gut feeling from "sharp" to "larp", plus the flags and the roast. It never picks the number.
- **Both combined** as two witnesses: when facts and vibe agree, the score goes extreme; when they disagree, it lands in the middle
- **Same unchanged profile = same verdict** (the vibe is cached for 30 days)
- **Zones**: 0–19 Sharp · 20–39 Low · 40–59 Moderate · 60–79 High · 80+ LARP god

## Run it locally

The site runs on your machine with Cloudflare's open-source runtime (workerd) and a local SQLite copy of the database. No Cloudflare account is needed. You need a GitHub token and an Anthropic API key, since every analysis calls both.

With Docker:

```sh
cp .dev.vars.example .dev.vars   # then fill in GITHUB_TOKEN and ANTHROPIC_API_KEY
docker compose up --build
```

Without Docker (Node 22):

```sh
cp .dev.vars.example .dev.vars   # then fill in GITHUB_TOKEN and ANTHROPIC_API_KEY
npm ci
npm run db:migrate
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). Use `localhost`, not `127.0.0.1`: the Turnstile test key only passes on `localhost`.

- Checks and the leaderboard are kept in a Docker volume. `docker compose down -v` starts from a clean database.
- Buying an ad doesn't work locally (it needs Stripe).

## Privacy

- GitHub data is public; the scores and the leaderboard use only that.
- A CV is read in your browser, sent to our server and to Claude (Anthropic's API) for the verdict, then discarded. We never store it.
- Anthropic doesn't train on API data and deletes it within 30 days.
- We keep the GitHub username, avatar and score of each check, and the verdict for 30 days so the same profile gets the same answer.
- A profile added to the leaderboard stays there with its username, avatar, latest score and date, even after those 30 days. A new check of that profile updates its score. To have a profile removed, email s.mounier.contact@gmail.com.
