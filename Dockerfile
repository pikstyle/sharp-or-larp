# Runs the site on your own machine, with Cloudflare's open-source runtime (workerd) and a local
# SQLite copy of the D1 database. No Cloudflare account is needed. See "Run it locally" in the README.
# Debian rather than Alpine: workerd needs glibc.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV WRANGLER_SEND_METRICS=false
EXPOSE 5173

ENTRYPOINT ["sh", "docker/entrypoint.sh"]
