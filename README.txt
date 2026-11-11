MANGA INDO AUTO TRANSLATE (Chrome extension)
Versi 1.0.0

FUNGSI
- Mengambil screenshot area layar Chrome yang sedang terlihat.
- Mengirim screenshot ke Gemini API untuk mendeteksi dan menerjemahkan dialog manga.
- Menampilkan teks Indonesia di atas area bubble.
- Opsional: menerjemahkan ulang setelah kamu scroll.

CARA PASANG
1. Ekstrak ZIP ini ke folder yang mudah ditemukan.
2. Buka Google Chrome.
3. Ketik chrome://extensions di address bar.
4. Aktifkan Developer mode di kanan atas.
5. Klik Load unpacked.
6. Pilih folder hasil ekstrak yang berisi manifest.json.
7. Pin extension "Manga Indo Auto Translate" jika perlu.

CARA PAKAI
1. Buat Gemini API key di https://aistudio.google.com/apikey
2. Klik ikon extension di Chrome.
3. Tempel API key, lalu klik "Simpan API key".
4. Buka halaman manga.
5. Klik extension, centang "Terjemahkan otomatis saat aku scroll" jika ingin mode otomatis.
6. Klik "Mulai / Terjemahkan layar sekarang".
7. Tunggu hasil terjemahan muncul di area manga.
8. Klik "Matikan dan sembunyikan terjemahan" untuk berhenti.

CATATAN PENTING
- Extension ini menerjemahkan area layar yang sedang terlihat, bukan seluruh halaman sekaligus.
- Setelah scroll, extension mengambil screenshot baru dan menerjemahkan tampilan terbaru.
- Akurasi posisi kotak terjemahan bergantung pada deteksi visual Gemini. Hasil pada manga yang ramai, teks kecil, halaman berwarna, atau layout tidak biasa bisa kurang tepat.
- Google AI Pro tidak otomatis mencakup kuota Gemini API. API key dan penggunaan Gemini API memiliki kuota/harga tersendiri. Periksa halaman harga dan penggunaan API Google.
- API key disimpan di penyimpanan lokal extension Chrome dan dikirim ke Google Gemini API saat dipakai. Jangan bagikan API key atau folder extension kepada orang lain.
- Gunakan API key pribadi. Jangan menaruh API key di screenshot atau membagikannya di chat publik.

PEMECAHAN MASALAH
- Jika tidak aktif: refresh halaman manga, lalu klik Mulai lagi.
- Jika API key error: periksa key di Google AI Studio dan pastikan Gemini API tersedia untuk project tersebut.
- Jika kuota habis: cek dashboard penggunaan dan batas API di Google AI Studio.
- Jika tidak ada bubble diterjemahkan: pastikan dialog terlihat jelas di layar, lalu klik Mulai lagi.
