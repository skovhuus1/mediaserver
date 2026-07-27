#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo ./scripts/install-direct.sh"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${SUDO_USER:-root}"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
SYSTEMCTL_BIN="$(command -v systemctl)"

if [[ "$("$NODE_BIN" -p 'process.versions.node.split(\".\")[0]')" != "22" ]]; then
  echo "Node.js 22 is required."
  exit 1
fi
if ! command -v nginx >/dev/null || ! command -v psql >/dev/null || ! command -v redis-cli >/dev/null; then
  echo "nginx, PostgreSQL client and Redis client must be installed first."
  exit 1
fi

cd "$REPO_ROOT"
if [[ ! -f .env ]]; then
  cp .env.direct.example .env
fi
sudo -u "$SERVICE_USER" "$NODE_BIN" scripts/bootstrap-env.mjs
sudo -u "$SERVICE_USER" "$NPM_BIN" ci
sudo -u "$SERVICE_USER" "$NPM_BIN" run prisma:generate
sudo -u "$SERVICE_USER" "$NPM_BIN" run prisma:migrate
sudo -u "$SERVICE_USER" "$NPM_BIN" run build

cat > /etc/systemd/system/bb-media-api.service <<EOF
[Unit]
Description=BoltBytes Media API
After=network-online.target postgresql.service redis-server.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$REPO_ROOT/.env
ExecStart=$NODE_BIN $REPO_ROOT/services/api/dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=bb-media.target
EOF

cat > /etc/systemd/system/bb-media-admin.service <<EOF
[Unit]
Description=BoltBytes Media Admin
After=network-online.target bb-media-api.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$REPO_ROOT/.env
Environment=PORT=3000
ExecStart=$NODE_BIN $REPO_ROOT/web/admin/.next/standalone/web/admin/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=bb-media.target
EOF

cat > /etc/systemd/system/bb-media-worker.service <<EOF
[Unit]
Description=BoltBytes Media Worker
After=network-online.target bb-media-api.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$REPO_ROOT/.env
ExecStart=$NODE_BIN $REPO_ROOT/services/worker/dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=bb-media.target
EOF

cat > /etc/systemd/system/bb-media.target <<EOF
[Unit]
Description=BoltBytes Media Server
Wants=bb-media-api.service bb-media-admin.service bb-media-worker.service
After=bb-media-api.service bb-media-admin.service bb-media-worker.service

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/sudoers.d/bb-media-updater <<EOF
$SERVICE_USER ALL=(root) NOPASSWD: $SYSTEMCTL_BIN restart bb-media.target
EOF
chmod 0440 /etc/sudoers.d/bb-media-updater
visudo -cf /etc/sudoers.d/bb-media-updater

cp "$REPO_ROOT/infra/nginx/direct.conf" /etc/nginx/sites-available/bb-media
ln -sfn /etc/nginx/sites-available/bb-media /etc/nginx/sites-enabled/bb-media
nginx -t
systemctl daemon-reload
systemctl enable --now bb-media.target
systemctl reload nginx
echo "BoltBytes Media is available on port 5555."
