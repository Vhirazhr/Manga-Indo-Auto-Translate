MANGA INDO AUTO TRANSLATE
Versi 1.1.0
Chrome Extension Manifest V3

FITUR
- Mengambil screenshot area halaman Chrome yang sedang terlihat.
- Menggunakan Gemini Vision untuk mendeteksi dialog dan narasi manga.
- Mendeteksi teks dari berbagai bahasa, termasuk Jepang, Inggris, Korea, dan Mandarin.
- Menerjemahkan dialog ke bahasa Indonesia.
- Menampilkan hasil terjemahan di area bubble atau kotak narasi.
- Menyesuaikan ukuran teks overlay dengan ukuran area dialog.
- Mendukung auto-translate setelah scroll, termasuk scroll pada area reader di dalam halaman.
- Menampilkan status berhasil atau gagal langsung di halaman manga.
- Mengulang request ketika terjadi gangguan sementara pada Gemini API.
- Menyimpan API key di penyimpanan lokal Chrome, bukan di content script.

CARA PASANG
1. Unduh atau clone repository ini.
2. Buka Google Chrome.
3. Ketik chrome://extensions di address bar.
4. Aktifkan Developer mode.
5. Klik Load unpacked.
6. Pilih folder repository yang berisi manifest.json.
7. Pin extension jika ingin akses lebih cepat.

CARA PAKAI
1. Buat Gemini API key di https://aistudio.google.com/apikey
2. Buka extension Manga Indo Auto Translate.
3. Tempel API key, lalu klik Simpan / Ganti API key.
4. Buka halaman manga di tab Chrome.
5. Centang opsi otomatis jika ingin menerjemahkan setelah scroll.
6. Klik Mulai / Terjemahkan layar sekarang.
7. Tunggu notifikasi dan hasil terjemahan muncul di halaman.
8. Klik Matikan dan sembunyikan terjemahan untuk berhenti.

PENGATURAN API KEY
- API key disimpan menggunakan chrome.storage.local.
- Kolom API key tidak menampilkan ulang key yang sudah tersimpan.
- Gunakan tombol Hapus API key tersimpan jika ingin menghapus key dari extension.
- Jangan menaruh API key di source code, screenshot, atau repository publik.

BATASAN
- Extension memproses area layar yang sedang terlihat, bukan seluruh chapter sekaligus.
- Screenshot dikirim ke Gemini API saat pengguna menekan Mulai atau saat auto-translate berjalan setelah scroll.
- Posisi dan ukuran bubble ditentukan oleh model vision. Hasil dapat meleset pada dialog yang sangat kecil, halaman dengan banyak efek visual, atau layout yang padat.
- Terjemahan otomatis membutuhkan tab manga tetap aktif saat screenshot diambil.
- Sound effect, logo, kredit, dan teks website sengaja tidak diterjemahkan.
- Penggunaan Gemini API memiliki kuota dan ketentuan biaya tersendiri. Google AI Pro tidak otomatis mencakup kuota Gemini API.

PEMECAHAN MASALAH
- Jika extension tidak aktif, refresh halaman manga lalu tekan Mulai lagi.
- Jika API key ditolak, periksa key dan akses Gemini API di Google AI Studio.
- Jika kuota habis, periksa dashboard penggunaan Gemini API.
- Jika tidak ada hasil, pastikan dialog terlihat jelas di layar dan coba terjemahkan ulang.
- Jika screenshot gagal, aktifkan kembali tab manga dan ulangi proses.
- Jika layout overlay tidak pas, coba zoom halaman ke 100 persen dan terjemahkan ulang.

PRIVASI
Screenshot hanya diambil ketika proses terjemahan diminta oleh pengguna atau dipicu oleh opsi auto-translate. Gambar dikirim ke Google Gemini API untuk diproses. Jangan gunakan extension pada halaman yang memuat informasi pribadi atau sensitif.
