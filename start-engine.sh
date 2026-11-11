#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Install dan jalankan Docker terlebih dahulu."; exit 1; }
docker info >/dev/null
docker compose -f engine/compose.yaml up -d
echo 'Buka popup ekstensi dan klik Cek mesin lokal.'
echo 'Log mesin: docker compose -f engine/compose.yaml logs -f'
