# syntax=docker/dockerfile:1.7
# ─── Dependencies ────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /workspace
RUN apk add --no-cache libc6-compat
# Workspace manifests first for cache-friendly layer.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
# Only install the web workspace + its transitive @tankpilot/core dep.
# Skipping `apps/mobile` (Expo) and `apps/api` (Java) keeps the layer small
# and avoids native-module install failures on Alpine.
RUN npm ci \
    --workspace=@tankpilot/web \
    --workspace=@tankpilot/core \
    --include-workspace-root

# ─── Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .

# Prisma client must be generated before `next build` so that
# `prisma.priceSnapshot.findMany(...)` returns the correct typed shape
# (otherwise TS sees `any` and strict checks fail in API routes).
RUN cd apps/web && npx prisma generate

RUN npm run build --workspace=@tankpilot/web

# ─── Runtime (Next.js standalone) ────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=23700
ENV HOSTNAME=0.0.0.0

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

# Standalone server.js path inside the workspace-tracing layout.
CMD ["node", "apps/web/server.js"]
