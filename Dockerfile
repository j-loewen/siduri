# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

# ---- Build: install workspace deps, build the SPA and bundle the server ---------------
# Runs on the build machine's own platform even for multi-arch images: its output (JS bundle,
# web assets) is platform-independent, so only the runtime-deps stage needs the target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
# Manifests first, so the dependency layer stays cached until a package.json changes.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/brewcalc/package.json packages/brewcalc/
COPY packages/formats/package.json packages/formats/
COPY packages/seed-data/package.json packages/seed-data/
# No install scripts needed: native modules ship prebuilt binaries, build tools use optional deps.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime deps: only the native modules the bundle leaves external ----------------
FROM base AS runtime-deps
COPY --from=build /app/apps/server/dist/package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund \
 && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src node_modules/node-addon-api \
 && find node_modules/better-sqlite3/prebuilds -type f ! -name 'linuxmusl-*' -delete \
 && npm cache clean --force

# ---- Runtime ------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
RUN apk add --no-cache su-exec && mkdir -p /data && chown node:node /data
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
# index.js (bundled server), drizzle/ (migrations), public/ (web app), package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/siduri-entrypoint
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/siduri-entrypoint"]
CMD ["node", "index.js"]
