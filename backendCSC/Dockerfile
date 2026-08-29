FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-fund --no-audit
COPY tsconfig.json ./
COPY src ./src
COPY contracts ./contracts
RUN npm run build && npm prune --omit=dev --no-fund --no-audit

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV FFMPEG_PATH=/usr/bin/ffmpeg
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node database ./database
COPY --chown=node:node contracts ./contracts
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
