FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json .
COPY web/admin/package.json ./web/admin/package.json
COPY web/admin ./web/admin
RUN npm install
RUN npm run build --workspace=web/admin

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/web/admin/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/admin/.next ./.next
COPY --from=builder /app/web/admin/public ./public
COPY --from=builder /app/web/admin/package.json ./package.json
COPY --from=builder /app/web/admin/node_modules ./node_modules
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
