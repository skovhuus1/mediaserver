FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY web/admin/package.json web/admin/package.json
COPY shared/contracts/package.json shared/contracts/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY services/api/prisma services/api/prisma
COPY services/worker services/worker
RUN npx prisma generate --schema services/api/prisma/schema.prisma
RUN npm run build --workspace=@boltbytes/worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/services/worker/dist ./services/worker/dist
COPY --from=build /app/services/worker/package.json ./services/worker/package.json
USER node
CMD ["node", "services/worker/dist/main.js"]
