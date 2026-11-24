# Multi-stage lean Node 22 build (uses built-in node:sqlite — zero native compilation!)
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci || npm install

COPY web/package.json web/package-lock.json* ./web/
RUN npm --prefix web ci || npm --prefix web install

COPY migrations ./migrations
COPY server ./server
COPY web ./web

RUN npm run build:web && npm run build:server

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4180
ENV OWNDROP_DATA_DIR=/data
ENV OWNDROP_STATIC_DIR=/app/web/dist
ENV OWNDROP_MIGRATIONS_DIR=/app/migrations

RUN useradd --system --uid 10001 --create-home owndrop \
  && mkdir -p /data/uploads \
  && chown -R owndrop:owndrop /app /data

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/migrations ./migrations

USER owndrop
EXPOSE 4180
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "--no-warnings", "dist-server/adapters/node/index.js", "--healthcheck"]
CMD ["node", "--no-warnings", "dist-server/adapters/node/index.js"]
