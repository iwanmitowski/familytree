# Multi-stage build for the TypeScript/Node API (ADR 0004).
# Build context is the REPO ROOT: docker build -f services/api/Dockerfile .
# Targets linux/arm64 (Oracle Ampere A1) via buildx --platform.

# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Manifests first for layer caching. All workspace package.json files are
# required so `npm ci` can validate the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/

# Install only the API + shared workspaces (skips the heavy web toolchain).
RUN npm ci --workspace @familytree/api --include-workspace-root

# Source needed to build the API bundle.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api

RUN npm run build --workspace @familytree/api

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The esbuild bundle is self-contained (pg, hono, pino, kysely, zod, shared all
# inlined); only the dist output is needed at runtime.
COPY --from=build /repo/services/api/dist ./dist

# Run as the built-in non-root user with a read-only filesystem (compose adds
# tmpfs for /tmp). Distroless is avoided so the Node fetch healthcheck works.
USER node

EXPOSE 8080

# Node 22 ships global fetch — no curl needed for the healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
