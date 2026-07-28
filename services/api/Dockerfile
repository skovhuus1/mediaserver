FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY web/admin/package.json web/admin/package.json
COPY shared/contracts/package.json shared/contracts/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json eslint.config.mjs ./
COPY shared/contracts shared/contracts
COPY services/api services/api
RUN npm run prisma:generate
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
