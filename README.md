# sharp-or-larp

Drop a GitHub link. The LARP meter tells you if they're sharp or larping.

## Run locally

Requires Node.js 22.12+ and a [GitHub token](https://github.com/settings/personal-access-tokens) with read-only access to public data, in a `.dev.vars` file:

```
GITHUB_TOKEN="github_pat_..."
```

```bash
npm install
npm run cf-typegen
npm run dev
```

Open `http://localhost:5173`. The React front and the Worker start together.

## Structure

```
src/              React front
worker/           API server (Cloudflare Worker)
├── main.ts       Route menu: which route runs what
├── analyze.ts    POST /api/analyze, step by step
├── github.ts     Fetches profile, repos and activity from GitHub
├── dossier.ts    Turns raw GitHub data into an evidence dossier
├── judge.ts      Asks the LLM for the verdict
└── types.ts      Shared shapes and ApiError
```
