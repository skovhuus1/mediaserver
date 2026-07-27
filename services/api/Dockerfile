FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json .
COPY services/api/package.json ./services/api/package.json
COPY shared/types/package.json ./shared/types/package.json
COPY services/api ./services/api
COPY shared ./shared
RUN npm install
RUN npm run prisma:generate --workspace=services/api
RUN npm run build --workspace=services/api

FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/services/api/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/api/dist ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
