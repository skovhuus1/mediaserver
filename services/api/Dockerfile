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
COPY tsconfig.base.json eslint.config.mjs ./
COPY shared/contracts shared/contracts
COPY services/api services/api
RUN for attempt in 1 2 3 4; do \
      npm run prisma:generate && exit 0; \
      if [ "$attempt" -eq 4 ]; then exit 1; fi; \
      echo "Prisma engine download failed (attempt ${attempt}/4); retrying..." >&2; \
      sleep $((attempt * 20)); \
    done
RUN npm run build --workspace=@boltbytes/contracts
RUN npm run build --workspace=@boltbytes/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache docker-cli docker-cli-compose git openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/contracts ./shared/contracts
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/prisma ./services/api/prisma
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY package.json ./
USER node
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema services/api/prisma/schema.prisma && node services/api/dist/main.js"]
