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
# Prisma 7 default engine "client" requires an adapter (e.g.
# @prisma/adapter-pg). For our SQLite-dev / Postgres-prod setup we
# don't want to pull in an adapter, so we pin to the legacy
# "library" engine via the documented env-var. Both `prisma generate`
# (build-time) and `new PrismaClient()` (runtime) read this — the
# runner stage below inherits it via the runtime ENV declaration.
ENV PRISMA_CLIENT_ENGINE_TYPE=library
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .

# Prisma client must be generated before `next build` so that
# `prisma.priceSnapshot.findMany(...)` returns the correct typed shape
# (otherwise TS sees `any` and strict checks fail in API routes).
RUN cd apps/web && npx prisma generate

# Pre-create a template SQLite DB with all tables baked in. The runner
# stage copies this to /app/data/web.db on first boot (idempotent — the
# entrypoint skips the copy when a real DB already exists). This lets
# us avoid shipping the Prisma CLI + all its transitive deps (incl.
# `effect`, which Next.js standalone-tracing doesn't pull in) into the
# 290 MB runner image.
RUN cd apps/web \
    && DATABASE_URL="file:/tmp/web.db.template" npx prisma db push \
        --accept-data-loss \
    && cp /tmp/web.db.template /workspace/apps/web/prisma/web.db.template

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

# Pre-create the SQLite data dir owned by nextjs so the named volume
# (`web_data:/app/data` in docker-compose) inherits a writable owner.
# Without this the volume is mounted with root:root from the host docker
# daemon and the entrypoint's `prisma db push` fails on `EACCES`.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# `output: 'standalone'` + `outputFileTracingRoot` produces:
#   .next/standalone/  <- entry script + minimal node_modules
#   .next/static/      <- Next-emitted static chunks
#   public/            <- static assets
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public           ./apps/web/public

# Prisma table seeding on container start.
#
# The standalone Next.js output traces *runtime* deps only — @prisma/client
# and @prisma/adapter-libsql get pulled in, but the `prisma` CLI and its
# transitive `effect` dep do not (they're build-time tools). Without them
# the User/SyncRecord/Subscription/TelemetryEvent tables would never be
# created in /app/data/web.db, and /api/sync /api/telemetry /api/auth/*
# would 500 on every request.
#
# Solution: the builder stage already ran `prisma db push` against a
# disposable /tmp DB and dropped the resulting empty-but-fully-schema'd
# file at apps/web/prisma/web.db.template. We carry just that template
# into the runner, and the entrypoint `cp`s it into /app/data/web.db on
# first boot. Idempotent — subsequent boots see the real DB and skip.
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/prisma/web.db.template  ./apps/web/prisma/web.db.template

# Entrypoint copies the template to the runtime DB path on first boot,
# then execs the Next.js standalone server. `exec` so SIGTERM reaches
# node directly instead of being trapped by the shell.
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 23700

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
