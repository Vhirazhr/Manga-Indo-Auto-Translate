# Manga Indo Auto Translate · v3.1.0

Ekstensi Chrome untuk menerjemahkan gambar manga langsung di halaman baca. **Tanpa Gemini, tanpa API key, tanpa layanan terjemahan berbayar.** Mesin AI dijalankan di komputer sendiri menggunakan [Manga Image Translator](https://github.com/zyddnys/manga-image-translator).

## Mulai di Windows

1. Install dan buka **Docker Desktop**, gunakan Linux containers / WSL 2.
2. Clone repository (`git clone https://github.com/Vhirazhr/Manga-Indo-Auto-Translate.git`) lalu buka PowerShell di folder repository.
3. Jalankan `powershell -ExecutionPolicy Bypass -File .\start-engine.ps1`.
4. Buka `chrome://extensions`, aktifkan **Developer mode**, pilih **Load unpacked** dan folder yang berisi `manifest.json`. Untuk versi lama, pilih **Reload**.
5. Refresh tab manga. Buka popup ekstensi → **Cek mesin lokal** → **Izinkan situs & CDN gambar**.
6. Pilih Bahasa Indonesia, arahkan kursor ke gambar, klik **R**. Coba satu halaman dahulu sebelum mengaktifkan Auto.

Docker mengunduh runtime terlebih dahulu. Saat gambar pertama diproses, mesin mengunduh model; siapkan internet, ruang disk yang cukup, dan waktu unduh. Model dan cache AI disimpan persisten agar tidak diunduh ulang setiap hari. Setelah model tersedia, inferensi berjalan lokal. CPU didukung tetapi dapat lambat. Profil bawaan tidak membutuhkan NVIDIA; akselerasi GPU memerlukan konfigurasi Docker/upstream terpisah. Tidak ada model yang berjalan otomatis hanya karena ekstensi dipasang.

Image resmi saat ini hanya menyediakan AMD64. Mac Apple Silicon memakai emulasi dan bisa jauh lebih lambat.

Linux/macOS: jalankan `sh start-engine.sh` setelah Docker siap.

## Fitur

- Tombol **R**, Auto per hostname, dan prioritas halaman dekat posisi scroll.
- Deteksi teks, OCR 48px, terjemahan offline **M2M100 → IND**, inpainting **LaMa**, serta lettering dari mesin upstream.
- Klik **Original/Result** untuk mengganti tampilan. Tahan lebih dari 250 ms untuk mengintip gambar asli sementara.
- **Alt+Shift+E**: Auto. **Alt+Shift+S**: pilih area. **Alt+Shift+O**: asli/hasil.
- Pilihan area di dalam satu gambar digabungkan kembali ke gambar penuh, sehingga hasilnya tetap utuh saat halaman di-scroll. Screenshot fallback untuk canvas/reader khusus tetap berupa overlay sementara.
- Editor menyediakan teks multiline, font, ukuran, bold, alignment, outline, brush, penghapus transparan, Undo/Redo hingga 12 langkah, dan download PNG.
- Proses panjang disimpan di offscreen document; service worker boleh tidur tanpa membuang pekerjaan. Antrean lintas tab dijalankan satu per satu.

Mesin mendeteksi bahasa sumber otomatis; pilihan sumber manual lama dihapus karena protokol upstream tidak menyediakan parameter itu. Pilihan target tersedia di popup. Profil kualitas memakai deteksi 2048px, OCR 48px, inpainting LaMa 2048px/BF16, arah teks otomatis, dan urutan baca kanan-ke-kiri. Filter non-bubble bernilai 5 membantu mengurangi pemrosesan teks efek suara di luar bubble, tetapi tidak menjamin semua sound effect dipertahankan.

## Mesin yang dipakai

Ekstensi hanya menjadi penghubung dan antarmuka browser, bukan implementasi OCR/terjemahan/inpainting baru. Launcher memakai image resmi `zyddnys/manga-image-translator:main` yang dikunci pada digest `sha256:62b690cfbfd619afa4ea446d62cf8ea1088a76c5ece64dd834d67a881fc05ff7` agar runtime tidak berubah tanpa sengaja. Adapter diperiksa terhadap sumber upstream commit `36fed8528d851f8e4cce8e35255e080f4138a8d3`, khususnya `server/main.py`, `server/streaming.py`, dan `manga_translator/config.py`.

Gambar dikirim sebagai multipart ke `http://127.0.0.1:8000/translate/with-form/image/stream`. Ini koneksi HTTP lokal ke komputer sendiri, bukan API cloud. Adapter membaca frame streaming upstream, memeriksa hasil PNG, dan menampilkan error. Tidak ada fallback yang menutupi gambar dengan persegi warna; jika mesin gagal, gambar asli tetap ada.

Jika sudah memasang upstream dengan Python, jalankan dari folder upstream:

```sh
python server/main.py --host 127.0.0.1 --port 8000 --start-instance
```

## Retensi file dan penghematan penyimpanan\n\n- Gambar hasil terjemahan dari extension dikirim sebagai data gambar langsung ke tab Chrome; extension tidak otomatis membuat file PNG permanen. Hasil yang kamu pilih melalui **Download PNG** tetap menjadi file milikmu dan tidak disentuh pembersih otomatis.\n- Container menjalankan `engine/cleanup-temp.sh`: pembersihan langsung saat startup, lalu setiap 15 menit menghapus file temporary dan file di `/app/result` yang waktu modifikasinya lebih dari 3 jam. File yang masih baru/aktif dipertahankan.\n- Folder temporary Python diarahkan ke volume `manga-temp`; hasil server berada di volume `manga-results`. Keduanya terpisah dari `manga-models` dan `manga-cache`, yang tidak pernah dihapus oleh pembersih.\n- Log Docker dibatasi sampai tiga file berukuran maksimum 10 MB per file (maksimum sekitar 30 MB).\n- Pembersihan 3 jam tidak menghapus Docker image, model OCR/M2M100/LaMa, cache model, repository, atau folder Downloads. Jangan gunakan `docker compose down -v` kecuali memang ingin menghapus seluruh volume termasuk model yang sudah diunduh.\n\n## Pengelolaan & pemecahan masalah

```sh
# Lihat progres unduhan model dan error inferensi
docker compose -f engine/compose.yaml logs -f
# Matikan mesin (model tetap tersimpan)
docker compose -f engine/compose.yaml down
# Unduh ulang runtime dengan digest yang tercantum di compose
docker compose -f engine/compose.yaml pull
docker compose -f engine/compose.yaml up -d
```

- **Server terhubung** berarti endpoint kompatibel tersedia, belum membuktikan model selesai diunduh atau inferensi berhasil.
- Mesin tidak terhubung: pastikan Docker berjalan, port 8000 kosong, dan periksa log di atas.
- Proses melewati 20 menit: periksa unduhan/model atau coba area lebih kecil. Jangan langsung mengantrekan banyak halaman saat model pertama dimuat.
- Izin CDN: scroll sampai gambar muncul, buka kembali popup, lalu klik tombol izin.
- Refresh tab setelah update ekstensi. Shortcut bisa diubah di `chrome://extensions/shortcuts`.
- Hasil AI dapat salah membaca nama, teks kecil/dekoratif, tulisan vertikal, atau salah mendeteksi area. Sound effect di luar bubble lebih mungkin dilewati oleh filter, tetapi teks efek suara di dalam bubble tetap dapat diterjemahkan. Kualitas hasil tidak dijamin setara lettering manusia. Gunakan Original dan editor untuk memeriksa hasil.
- Server mengembalikan gambar akhir, bukan metadata area; ekstensi tidak mengarang jumlah bubble atau menjamin halaman tanpa teks telah diterjemahkan.
- Reader `<picture>`, object-fit khusus, canvas, atau proteksi situs mungkin memerlukan screenshot fallback. Pada fallback ini hasil area masih berupa overlay sementara; integrasi permanen saat ini berlaku untuk area yang dipilih di dalam satu elemen gambar.

## Privasi dan batas operasional

Gambar hanya diproses ketika Translate/area/Auto dipicu. Ekstensi mengambil gambar dari situs/CDN yang diizinkan, lalu mengirimnya ke loopback. Tidak mengirim gambar ke Gemini. Kunci Gemini lama dihapus saat update. Port Docker dipublikasikan hanya ke `127.0.0.1`; jangan membuka server ini ke internet. Model/dependensi tetap diunduh dari penyedia upstream pada pemakaian awal. Temporary files dan result server yang berumur lebih dari 3 jam dibersihkan otomatis. Model dan cache AI tetap tersimpan di volume persisten saat `down`; file yang diunduh manual ke folder Downloads tidak disentuh.

Kode dan model upstream memiliki lisensi masing-masing; lihat [lisensi upstream](https://github.com/zyddnys/manga-image-translator/blob/main/LICENSE) dan model terkait sebelum redistribusi. Image upstream tidak disalin ke repository ini.

## Validasi pengembangan

`node --test tests/*.test.mjs` menguji konfigurasi offline, multipart, parsing frame terpotong, error, batas ukuran, dan hasil PNG. Workflow juga memeriksa manifest dan sintaks JavaScript. Tes browser dengan server simulasi menguji integrasi ekstensi; simulasi tidak mengukur kualitas OCR/terjemahan/LaMa. Inferensi model sesungguhnya harus diuji dengan runtime upstream yang aktif.
