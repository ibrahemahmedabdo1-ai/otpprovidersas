# Build from the repository root:  docker build -f infrastructure/docker/backend.Dockerfile -t otpprovider-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --no-frozen-lockfile && pnpm -C backend/api build

FROM node:22-slim
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /repo /repo
USER node
EXPOSE 3001
# Configuration comes from real environment variables (see .env.example); no .env file is baked in.
CMD ["node", "backend/api/dist/main.js"]
