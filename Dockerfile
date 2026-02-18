# Stage 1: Builder
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/typescript-config ./packages/typescript-config/

# Copy package manifests for all packages
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/db ./packages/db/

# Build all packages
RUN pnpm build

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built artifacts and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Placeholder CMD — will be updated when apps/agent exists
CMD ["node", "apps/agent/dist/index.js"]
