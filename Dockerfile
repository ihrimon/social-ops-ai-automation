# --- build stage: compile TypeScript, keep only production deps afterwards ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --omit=dev

# --- runtime stage: minimal image, no build toolchain ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY knowledge-base.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
