# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./

# Copy all package.json files first (for caching)
COPY packages/domain/package.json        packages/domain/
COPY packages/events/package.json        packages/events/
COPY packages/schemas/package.json       packages/schemas/
COPY packages/shared-utils/package.json  packages/shared-utils/
COPY packages/registration/package.json  packages/registration/
COPY packages/fusion-core/package.json   packages/fusion-core/
COPY packages/eo-investigation/package.json packages/eo-investigation/
COPY packages/eo-tasking/package.json    packages/eo-tasking/
COPY packages/geometry/package.json      packages/geometry/
COPY packages/projections/package.json   packages/projections/
COPY packages/scenario-library/package.json packages/scenario-library/
COPY packages/validation/package.json    packages/validation/
COPY apps/simulator/package.json         apps/simulator/
COPY apps/api/package.json               apps/api/
COPY apps/workstation/package.json       apps/workstation/

RUN pnpm install --frozen-lockfile

# Copy all source
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm build

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps

# Serve workstation static files via a simple server
RUN npm install -g serve@14

EXPOSE 3000 3001

# Start both API and static file server
CMD sh -c '\
  cd /app/apps/api && node dist/server.js & \
  serve -s /app/apps/workstation/dist -l 3000 --no-clipboard & \
  wait'
