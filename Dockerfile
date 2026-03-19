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
COPY packages/deployment-planner/package.json packages/deployment-planner/
COPY packages/eo-management/package.json packages/eo-management/
COPY packages/asterix-adapter/package.json packages/asterix-adapter/
COPY packages/terrain/package.json       packages/terrain/
COPY packages/database/package.json      packages/database/
COPY apps/simulator/package.json         apps/simulator/
COPY apps/api/package.json               apps/api/
COPY apps/workstation/package.json       apps/workstation/

RUN pnpm install --frozen-lockfile

# Pass git revision for the UI version display
ARG BUILD_REVISION=dev
ENV BUILD_REVISION=${BUILD_REVISION}

ARG BUILD_TIMESTAMP=
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

ARG BUILD_BRANCH=
ENV BUILD_BRANCH=${BUILD_BRANCH}

# Copy all source
COPY packages/ packages/
COPY apps/ apps/
COPY configs/ configs/

RUN pnpm build

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json /app/turbo.json /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/configs ./configs

# Ensure turbo and other node_modules binaries are in PATH
# (Cloud Build overrides WORKDIR, so pnpm may not resolve .bin correctly)
ENV PATH="/app/node_modules/.bin:${PATH}"
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/server.js"]
