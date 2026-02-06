# Render deploy (Docker runtime)
#
# Monorepo notes:
# - We copy only package manifests first so `bun install` layer is cached.
# - Runtime uses Bun (works fine for SvelteKit adapter-node output).

FROM oven/bun:1.2.22 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/influencer-scout-api/package.json ./apps/influencer-scout-api/package.json
COPY apps/influencer-scout-web/package.json ./apps/influencer-scout-web/package.json
COPY apps/mcp-server/package.json ./apps/mcp-server/package.json
COPY packages/client-ts/package.json ./packages/client-ts/package.json

RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun run --cwd apps/influencer-scout-web build

FROM oven/bun:1.2.22 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000

# Bun's node_modules layout is compatible at runtime.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/influencer-scout-web/build ./build

EXPOSE 10000
CMD ["bun", "./build/index.js"]

