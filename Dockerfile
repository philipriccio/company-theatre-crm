# Company Theatre CRM - Production Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Project the committed lock onto the actual worker runtime import closure.
# Keep web dependencies and Prisma CLI outside this audited runtime image.
FROM base AS worker-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/prepare-worker-runtime.mjs ./scripts/prepare-worker-runtime.mjs
RUN node scripts/prepare-worker-runtime.mjs \
  && npm ci --omit=dev --omit=peer \
  && npm audit --omit=dev --omit=peer --audit-level=high \
  && npm cache clean --force

# Worker needs generated Prisma, not a Next.js production build.
FROM deps AS worker-client
COPY prisma ./prisma
RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Standalone email worker image. It intentionally shares the same source,
# Prisma client, and dependency lockfile as the web app, but runs as a
# separate process/service so campaign execution never depends on a web
# request remaining alive.
FROM base AS worker
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=worker-deps --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=worker-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
# The generated Prisma runtime is created in worker-client, then copied without
# copying the Prisma CLI itself.
COPY --from=worker-client --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs tsconfig.json ./tsconfig.json

USER nextjs

CMD ["./node_modules/.bin/tsx", "scripts/email-worker.ts"]

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
