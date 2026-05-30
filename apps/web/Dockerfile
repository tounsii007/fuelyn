# syntax=docker/dockerfile:1.7
# ─── Dependencies ────────────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /workspace
RUN apk add --no-cache libc6-compat
# Workspace manifests first for cache-friendly layer.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
# Only install the web workspace + its transitive @fuelyn/core dep.
# Skipping `apps/mobile` (Expo) and `apps/api` (Java) keeps the layer small
# and avoids native-module install failures on Alpine.
#
# Network resilience:
#   * BuildKit cache mount on /root/.npm — partial downloads survive a
#     build retry, so a flaky link doesn't restart the 60-min layer from
#     zero.
#   * maxsockets=4 — npm defaults to 50 parallel connections, which
#     overwhelms residential / restricted networks and surfaces as
#     ECONNRESET / ETIMEDOUT in the middle of large packages. Four
#     concurrent fetches finish almost as fast on a healthy link and
#     are far more robust on a constrained one.
#   * fetch-retries=5 with a 20 s floor / 5 min ceiling rides out
#     transient drops without giving up.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 300000 \
    && npm config set fetch-timeout 600000 \
    && npm config set maxsockets 4 \
    && npm ci \
        --workspace=@fuelyn/web \
        --workspace=@fuelyn/core \
        --include-workspace-root

# ─── Build ───────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
# Pin the legacy "library" Prisma engine (the same engine the previous
# SQLite/adapter-libsql setup ran). Postgres is driven through the
# @prisma/adapter-pg driver adapter at runtime. Both `prisma generate`
# (build-time) and `new PrismaClient()` (runtime) read this — the
# runner stage below inherits it via the runtime ENV declaration.
ENV PRISMA_CLIENT_ENGINE_TYPE=library
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .

# Prisma client must be generated before `next build` so that
# `prisma.priceSnapshot.findMany(...)` returns the correct typed shape
# (otherwise TS sees `any` and strict checks fail in API routes).
RUN cd apps/web && npx prisma generate

# The Postgres schema is applied to the live database at deploy time by
# the `web-migrate` one-shot service (see docker-compose.yml), which
# reuses THIS builder image's Prisma CLI. That keeps the slim runner
# below free of the CLI + its `effect` transitive (which Next.js
# standalone tracing doesn't pull in anyway).
RUN npm run build --workspace=@fuelyn/web

# ─── Runtime (Next.js standalone) ────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=23700
ENV HOSTNAME=0.0.0.0
# Match builder so runtime PrismaClient picks the library engine.
ENV PRISMA_CLIENT_ENGINE_TYPE=library

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: 'standalone'` + `outputFileTracingRoot` produces:
#   .next/standalone/  <- entry script + minimal node_modules
#   .next/static/      <- Next-emitted static chunks
#   public/            <- static assets
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public           ./apps/web/public

USER nextjs
EXPOSE 23700

# The schema lives in Postgres and is applied by the `web-migrate`
# one-shot service before this container starts (see docker-compose.yml),
# so there is nothing to seed here. The standalone server is the only
# process — `node` as PID 1 receives SIGTERM directly for graceful
# shutdown, no entrypoint shim needed.
CMD ["node", "apps/web/server.js"]
