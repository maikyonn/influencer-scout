# Stage 1: Builder
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install dependencies.
# Note: we intentionally do not require package-lock.json (this repo uses Bun for dev).
COPY package.json ./
RUN npm install --no-audit --no-fund

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Copy package file and install production dependencies only.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist

# Copy OpenAPI spec for runtime serving at /openapi.yaml
COPY openapi.yaml ./openapi.yaml

# Set production environment
ENV NODE_ENV=production

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]
