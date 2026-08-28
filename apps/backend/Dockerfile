# Build context is the repo root (npm workspaces needs the root lockfile) —
# build with `docker build -f apps/backend/Dockerfile .` from the repo root,
# which is what docker-compose.yml's `context: .` / `dockerfile: ...` does.

# --- build stage: compile TypeScript, keep only production deps afterwards ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --workspace=apps/backend --include-workspace-root

COPY apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY apps/backend/src ./apps/backend/src
RUN npm run build --workspace=apps/backend

RUN npm prune --omit=dev --workspace=apps/backend --include-workspace-root

# --- runtime stage: minimal image, no build toolchain ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/backend

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/apps/backend/package.json ./package.json
COPY apps/backend/knowledge-base.json ./knowledge-base.json

EXPOSE 3000

CMD ["node", "dist/index.js"]
