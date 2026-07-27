# Deployment og drift

## Lokal udvikling

1. Start PostgreSQL + Redis via compose:

```bash
docker compose up -d postgres redis
```

2. Kør API migration + service:

```bash
cd services/api
npm run prisma:migrate
npm run dev
```

3. Kør admin web:

```bash
cd ../../web/admin
npm run dev
```

## Produktionsstack (lokal)

- `docker-compose.yml` bygger tre services: `api`, `admin`, `reverse-proxy`.
- `infra/docker/nginx.conf` router `/api` til API og fallback til admin.
- Health checks bygger på `GET /api/v1/system/health`.

## CI

- `.github/workflows/ci.yml` kører lint, tests, builds og docker compose validation.
