FROM node:22-bookworm-slim AS build

WORKDIR /app

# Use the workspace-pinned pnpm version.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY . .
RUN find . -name '*.tsbuildinfo' -delete

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @jarvis/browser build
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Keep the runtime image simple and predictable for server/VM installs.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY --from=build /app /app

# Default container process. Compose overrides this for worker/dashboard/migrate.
CMD ["pnpm", "--filter", "@jarvis/agent", "start"]
