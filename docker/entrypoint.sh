#!/bin/sh
set -e

if [ ! -f .dev.vars ]; then
  echo "Missing .dev.vars: run 'cp .dev.vars.example .dev.vars', fill in your keys, then start again." >&2
  exit 1
fi

# Creates the local database on the first run and applies any new migration afterwards.
npx wrangler d1 migrations apply DB --local

# Dev mode on purpose: it uses Turnstile's test sitekey, so the bot check passes on localhost.
exec npx vite --host 0.0.0.0 --port 5173 --strictPort
