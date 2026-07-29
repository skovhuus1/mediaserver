FROM node:22-alpine AS dependencies
WORKDIR /app
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
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY tsconfig.base.json ./
COPY shared/contracts shared/contracts
COPY web/admin web/admin
RUN npm run build --workspace=@boltbytes/contracts \
    && npm run build --workspace=@boltbytes/admin

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/web/admin/.next/standalone ./
COPY --from=build /app/web/admin/.next/static ./web/admin/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/admin/server.js"]
