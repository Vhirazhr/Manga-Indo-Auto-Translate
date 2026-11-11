# Manga Indo Auto Translate · v3

Ekstensi Chrome untuk menerjemahkan gambar manga langsung di halaman baca. **Tanpa Gemini, tanpa API key, tanpa layanan terjemahan berbayar.** Mesin AI dijalankan di komputer sendiri menggunakan [Manga Image Translator](https://github.com/zyddnys/manga-image-translator).

## Mulai di Windows

1. Install dan buka **Docker Desktop**, gunakan Linux containers / WSL 2.
2. Download ZIP repo ini, ekstrak, lalu buka PowerShell di folder hasil ekstraksi.
3. Jalankan `powershell -ExecutionPolicy Bypass -File .\start-engine.ps1`.
4. Buka `chrome://extensions`, aktifkan **Developer mode**, pilih **Load unpacked** dan folder yang berisi `manifest.json`. Untuk versi lama, pilih **Reload**.
5. Refresh tab manga. Buka popup ekstensi → **Cek mesin lokal** → **Izinkan situs & CDN gambar**.
6. Pilih Bahasa Indonesia, arahkan kursor ke gambar, klik **R**. Coba satu halaman dahulu sebelum mengaktifkan Auto.

Docker mengunduh runtime terlebih dahulu. Saat gambar pertama diproses, mesin mengunduh model; siapkan internet, ruang disk beberapa GB, dan waktu unduh. Setelah model tersedia, inferensi berjalan lokal. CPU didukung tetapi dapat lambat. Profil bawaan tidak membutuhkan NVIDIA; akselerasi GPU memerlukan konfigurasi Docker/upstream terpisah. Tidak ada model yang berjalan otomatis hanya karena ekstensi dipasang.

Linux/macOS: jalankan `sh start-engine.sh` setelah Docker siap.

## Fitur

- Tombol **R**, Auto per hostname, dan prioritas halaman dekat posisi scroll.
- Deteksi teks, OCR 48px, terjemahan **M2M100 → IND**, inpainting **LaMa**, serta lettering dari mesin upstream.
- Klik **Original/Result** untuk mengganti tampilan. Tahan lebih dari 250 ms untuk mengintip gambar asli sementara.
- **Alt+Shift+E**: Auto. **Alt+Shift+S**: pilih area. **Alt+Shift+O**: asli/hasil.
- Pilihan area di dalam satu gambar; screenshot area sebagai alternatif ketika gambar tidak dapat diambil.
- Editor teks, kuas, hapus putih manual, undo, dan download PNG.
- Proses panjang disimpan di offscreen document; service worker boleh tidur tanpa membuang pekerjaan. Antrean lintas tab dijalankan satu per satu.

Mesin mendeteksi bahasa sumber otomatis; pilihan sumber manual lama dihapus karena protokol upstream tidak menyediakan parameter itu. Pilihan target tersedia di popup.

## Mesin yang dipakai

Ekstensi hanya menjadi penghubung dan antarmuka browser, bukan implementasi OCR/terjemahan/inpainting baru. Launcher memakai image resmi `zyddnys/manga-image-translator:main`. Tag upstream ini dapat berubah. Adapter diperiksa terhadap sumber upstream commit `36fed8528d851f8e4cce8e35255e080f4138a8d3`, khususnya `server/main.py`, `server/streaming.py`, dan `manga_translator/config.py`.

Gambar dikirim sebagai multipart ke `http://127.0.0.1:8000/translate/with-form/image/stream`. Ini koneksi HTTP lokal ke komputer sendiri, bukan API cloud. Adapter membaca frame streaming upstream, memeriksa hasil PNG, dan menampilkan error. Tidak ada fallback yang menutupi gambar dengan persegi warna; jika mesin gagal, gambar asli tetap ada.

Jika sudah memasang upstream dengan Python, jalankan dari folder upstream:

```sh
python server/main.py --host 127.0.0.1 --port 8000 --start-instance
```

## Pengelolaan & pemecahan masalah

```sh
# Lihat progres unduhan model dan error inferensi
docker compose -f engine/compose.yaml logs -f
# Matikan mesin (model tetap tersimpan)
docker compose -f engine/compose.yaml down
# Perbarui runtime upstream jika diperlukan
docker compose -f engine/compose.yaml pull
docker compose -f engine/compose.yaml up -d
```

- **Server terhubung** berarti endpoint kompatibel tersedia, belum membuktikan model selesai diunduh atau inferensi berhasil.
- Mesin tidak terhubung: pastikan Docker berjalan, port 8000 kosong, dan periksa log di atas.
- Proses melewati 20 menit: periksa unduhan/model atau coba area lebih kecil. Jangan langsung mengantrekan banyak halaman saat model pertama dimuat.
- Izin CDN: scroll sampai gambar muncul, buka kembali popup, lalu klik tombol izin.
- Refresh tab setelah update ekstensi. Shortcut bisa diubah di `chrome://extensions/shortcuts`.
- Hasil AI dapat salah membaca nama, teks kecil/dekoratif, vertikal, atau salah mendeteksi area. Kualitas hasil tidak dijamin setara lettering manusia. Gunakan Original dan editor untuk memeriksa hasil.
- Server mengembalikan gambar akhir, bukan metadata area; ekstensi tidak mengarang jumlah bubble atau menjamin halaman tanpa teks telah diterjemahkan.
- Reader `<picture>`, object-fit khusus, canvas, atau proteksi situs mungkin memerlukan pilihan area/screenshot. Overlay area dihapus ketika scroll agar tidak menempel pada bagian halaman yang salah.

## Privasi dan batas operasional

Gambar hanya diproses ketika Translate/area/Auto dipicu. Ekstensi mengambil gambar dari situs/CDN yang diizinkan, lalu mengirimnya ke loopback. Tidak mengirim gambar ke Gemini. Kunci Gemini lama dihapus saat update. Port Docker dipublikasikan hanya ke `127.0.0.1`; jangan membuka server ini ke internet. Model/dependensi tetap diunduh dari penyedia upstream pada pemakaian awal. Upstream dapat menyimpan hasil/log di container; volume model/cache dipertahankan saat `down`.

Kode dan model upstream memiliki lisensi masing-masing; lihat [lisensi upstream](https://github.com/zyddnys/manga-image-translator/blob/main/LICENSE) dan model terkait sebelum redistribusi. Image upstream tidak disalin ke repository ini.

## Validasi pengembangan

`node --test tests/*.test.mjs` menguji konfigurasi offline, multipart, parsing frame terpotong, error, batas ukuran, dan hasil PNG. Workflow juga memeriksa manifest dan sintaks JavaScript. Tes browser dengan server simulasi menguji integrasi ekstensi; simulasi tidak mengukur kualitas OCR/terjemahan/LaMa. Inferensi model sesungguhnya harus diuji dengan runtime upstream yang aktif.
