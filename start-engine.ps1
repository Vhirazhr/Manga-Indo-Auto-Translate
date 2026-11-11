$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Install dan buka Docker Desktop (Linux containers) dahulu: https://www.docker.com/products/docker-desktop/"
}
docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop belum siap. Buka Docker Desktop, lalu ulangi." }
docker compose -f engine/compose.yaml up -d
if ($LASTEXITCODE -ne 0) { throw "Mesin gagal dijalankan. Periksa pesan Docker di atas." }
Write-Host "Menunggu server lokal..."
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
        $schema = Invoke-RestMethod http://127.0.0.1:8000/openapi.json -TimeoutSec 3
        if ($schema.paths.'/translate/with-form/image/stream'.post) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
}
if (-not $ready) { throw "Server belum siap. Cek: docker compose -f engine/compose.yaml logs --tail 80" }
Write-Host "Server terhubung. Buka popup ekstensi, klik Cek mesin lokal, lalu terjemahkan satu gambar."
Write-Host "Pembersihan otomatis aktif: temporary/result >24 jam (pemeriksaan tiap 15 menit). Model AI dan cache dipertahankan."
Write-Host "Pemakaian pertama mengunduh model. Lihat progres: docker compose -f engine/compose.yaml logs -f"
