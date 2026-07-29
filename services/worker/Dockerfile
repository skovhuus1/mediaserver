FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=300000
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY web/admin/package.json web/admin/package.json
COPY shared/contracts/package.json shared/contracts/package.json
RUN for attempt in 1 2 3; do \
      npm ci --no-audit --no-fund --prefer-offline && exit 0; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      sleep $((attempt * 15)); \
    done

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY shared/contracts shared/contracts
COPY services/api/prisma services/api/prisma
COPY services/worker services/worker
RUN for attempt in 1 2 3 4; do \
      npx prisma generate --schema services/api/prisma/schema.prisma && exit 0; \
      if [ "$attempt" -eq 4 ]; then exit 1; fi; \
      echo "Prisma engine download failed (attempt ${attempt}/4); retrying..." >&2; \
      sleep $((attempt * 20)); \
    done
RUN npm run build --workspace=@boltbytes/contracts
RUN npm run build --workspace=@boltbytes/worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/contracts ./shared/contracts
COPY --from=build /app/services/worker/dist ./services/worker/dist
COPY --from=build /app/services/worker/package.json ./services/worker/package.json
USER node
CMD ["node", "services/worker/dist/main.js"]
