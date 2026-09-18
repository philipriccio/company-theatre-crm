# Company Theatre CRM - Production Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Install only the packages required by the long-running worker. Prisma CLI is
# a build-time peer/tool and is deliberately removed before this install so
# its transitive advisory-bearing config stack cannot enter the worker image.
FROM base AS worker-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm pkg delete devDependencies.prisma \
  && npm ci --omit=dev --omit=peer \
  && npm audit --omit=dev --omit=peer --audit-level=high \
  && npm cache clean --force

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
# The generated Prisma runtime is created in the builder, then copied without
# copying the Prisma CLI itself.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

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
