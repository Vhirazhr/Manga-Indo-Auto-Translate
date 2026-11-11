#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Install dan jalankan Docker terlebih dahulu."; exit 1; }
docker info >/dev/null
docker compose -f engine/compose.yaml up -d
echo 'Pembersihan otomatis aktif: temporary/result >3 jam (pemeriksaan tiap 15 menit). Model AI dan cache dipertahankan.'
echo 'Buka popup ekstensi dan klik Cek mesin lokal.'
echo 'Log mesin: docker compose -f engine/compose.yaml logs -f'
