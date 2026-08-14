#!/usr/bin/env sh
set -eu

current_percent=60
current_phase="runner"

progress() {
  current_percent="$1"
  current_phase="$2"
  message="$3"
  printf 'BB_UPDATE_PROGRESS|%s|%s|%s|%s\n' "$current_percent" "$current_phase" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$message"
}

failed() {
  code="$?"
  trap - EXIT HUP INT TERM
  progress "$current_percent" "failed" "Opdateringen fejlede i fase $current_phase (exit $code)"
  exit "$code"
}

trap failed EXIT HUP INT TERM

compose_files="-f docker-compose.yml -f docker-compose.updater.yml"
if [ -f .env ] && grep -Eiq '^[[:space:]]*BB_MEDIA_GPU_ENABLED[[:space:]]*=[[:space:]]*(true|1|yes)[[:space:]]*$' .env; then
  compose_files="$compose_files -f docker-compose.nvidia.yml"
fi
progress 60 runner "Updater-runneren er startet"
sleep 2
progress 65 building "Docker images bygges"
docker compose $compose_files build
progress 82 healthcheck "Containerne erstattes, og health checks afventes"
docker compose $compose_files up --detach --remove-orphans --wait --wait-timeout 300
progress 94 proxy "Proxyen genstartes med de nye container-adresser"
docker compose $compose_files restart proxy
progress 100 completed "Opdateringen er installeret, og alle services er startet"
trap - EXIT HUP INT TERM
