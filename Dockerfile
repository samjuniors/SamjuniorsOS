# ============================================================================
# SamJuniorsOS — Production & Staging Dockerfile (Option A Architecture)
# Single Container: Next.js Standalone + Live WebSocket Gateway + Persistent Volume
# ============================================================================

# ─── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
COPY prisma ./prisma/

RUN npm install --frozen-lockfile || npm install

# ─── Stage 2: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client and build Next.js standalone
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate
RUN npm run build

# ─── Stage 3: Runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat sqlite curl wget bash tar

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV LIVE_WS_PORT=3001
ENV DATABASE_URL=file:/app/db/custom.db
ENV DATABASE_MODE=authoritative

# Volumes for persistent database, durable files, and automated backups
VOLUME ["/app/db", "/app/.data", "/app/backups"]

# Copy standalone Next.js server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/src/lib/server/live ./src/lib/server/live
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "scripts/start-staging.mjs"]
