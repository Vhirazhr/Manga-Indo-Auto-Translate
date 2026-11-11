MANGA INDO AUTO TRANSLATE
Versi 2.0.0
Chrome Extension Manifest V3

TUJUAN
Manga Indo adalah implementasi independen dengan alur penggunaan yang terinspirasi dari fitur publik RuneManga: terjemahkan gambar manga langsung di halaman browser, otomatis mengikuti scroll, dan edit hasil gambar. Project ini tidak menyalin source code, backend, model proprietary, atau identitas RuneManga.

FITUR V2
- Floating R button pada gambar manga yang terdeteksi.
- Toolbar per gambar: Translate, Auto, Original/Result, dan Edit.
- Auto-translate per website, disimpan berdasarkan hostname.
- Queue satu halaman pada satu waktu dan memprioritaskan gambar yang dekat dengan posisi scroll.
- OCR dan terjemahan ke bahasa pilihan dengan Gemini 3.8 Flash.
- AI background cleanup/inpainting dengan Gemini 3.1 Flash Image (Nano Banana 2).
- Typesetting terjemahan ke area bubble/caption.
- Original/Result toggle dan tekan-tahan tombol Original untuk membandingkan.
- Translate an area dengan shortcut Alt+Shift+S atau menu klik kanan.
- Image editor: tambah teks, brush, hapus/paint putih, undo satu langkah, simpan ke halaman, dan download PNG.
- Context menu untuk translate image dan edit image.
- Keyboard shortcut:
  Alt+Shift+E = toggle Auto untuk situs ini
  Alt+Shift+S = pilih area
  Alt+Shift+O = tampilkan Original/Result
- Bahasa sumber Auto atau pilihan manual. Target default Bahasa Indonesia.
- API key disimpan di chrome.storage.local dan tidak ditulis ke source code.

CARA INSTALL / UPDATE
1. Download ZIP repository atau git clone.
2. Buka Google Chrome dan masuk ke chrome://extensions.
3. Aktifkan Developer mode.
4. Jika extension lama sudah terpasang, klik Reload. Jika belum, klik Load unpacked dan pilih folder repository yang berisi manifest.json.
5. Buka halaman manga dan refresh tab setelah extension diperbarui.
6. Buka popup extension, simpan Gemini API key.
7. Klik "Izinkan situs & CDN gambar". Chrome akan meminta izin untuk domain halaman dan host gambar yang terdeteksi.
8. Pilih bahasa tujuan dan sumber. Default tujuan adalah Bahasa Indonesia dan sumber Auto.
9. Arahkan pointer ke gambar manga. Klik R untuk menerjemahkan satu halaman.
10. Aktifkan Auto di popup atau toolbar gambar untuk memproses halaman yang masuk ke area baca saat scroll.

PENGGUNAAN
- Translate satu halaman: arahkan pointer ke gambar, lalu klik R.
- Auto per situs: klik Auto pada toolbar atau aktifkan dari popup. Pengaturan tersimpan per hostname.
- Original/Result: klik tombol Original/Result. Tekan dan tahan tombol Original untuk melihat gambar sumber sementara.
- Translate area: tekan Alt+Shift+S atau pilih menu konteks. Tarik kotak di dalam satu gambar.
- Edit image: klik Edit pada toolbar atau klik kanan gambar. Editor mendukung penambahan teks, kuas, penghapus putih, undo, simpan ke halaman, dan download PNG.
- Context menu: klik kanan gambar lalu pilih Translate image atau Edit image.

MODEL DAN PIPELINE
1. Extension mengambil byte gambar dari URL image setelah pengguna memberi izin host.
2. Gemini 3.8 Flash membaca dialog dan mengembalikan teks terjemahan serta koordinat area.
3. Gemini 3.1 Flash Image mencoba menghapus lettering sumber dan merekonstruksi latar di area yang terdeteksi.
4. Extension menggambar typesetting Indonesia di atas hasil restorasi.
5. Hasil ditampilkan menggantikan gambar asli di halaman. Gambar asli tetap dapat dipulihkan melalui Original.

PRIVASI DAN BIAYA
- Tidak ada gambar yang dikirim sebelum pengguna menekan Translate, memilih area, atau mengaktifkan Auto untuk situs.
- Gambar halaman yang dipilih dikirim ke Google Gemini API untuk OCR dan restorasi gambar.
- API key disimpan di penyimpanan lokal Chrome dan hanya digunakan oleh service worker extension.
- Izin situs/CDN diminta secara terpisah melalui popup. Extension membutuhkan izin host untuk mengambil gambar langsung dari reader.
- Penggunaan Gemini API memiliki kuota dan biaya sendiri. Langganan Google AI Pro tidak otomatis mencakup kuota Gemini API.
- Jangan gunakan pada halaman yang berisi data pribadi atau materi yang tidak berhak kamu proses.

BATASAN V2 (BETA)
- Ini bukan salinan internal RuneManga dan tidak menggunakan RuneLingua. Ini implementasi mandiri dengan Gemini API.
- Hasil AI inpainting dapat mengubah detail gambar di sekitar lettering. Model image generation tidak menjamin preservasi piksel yang identik.
- Typesetting menggunakan font dan style estimasi, belum mendeteksi font manga secara presisi.
- Deteksi halaman saat ini berfokus pada elemen HTML img yang memuat file gambar. Reader berbasis canvas, CSS background, blob khusus, atau DRM mungkin belum didukung.
- Translate area bekerja pada satu elemen img dan hasilnya ditampilkan sebagai overlay pada posisi seleksi.
- Queue otomatis memproses satu gambar dalam satu waktu. Tab harus tetap aktif saat gambar diambil.
- Hasil AI dapat salah membaca slang, nama, tulisan kecil, teks vertikal, dan lettering dekoratif.
- Simple cleanup adalah fallback dasar dan tidak setara dengan inpainting AI.

TROUBLESHOOTING
- Tidak muncul tombol R: refresh halaman. Pastikan reader menampilkan halaman sebagai gambar HTML dan ukuran gambar cukup besar.
- Izin gambar ditolak: buka popup dan klik "Izinkan situs & CDN gambar".
- Izin CDN baru: scroll hingga gambar baru muncul, lalu buka popup dan minta izin lagi.
- API key invalid: periksa key dan aktifkan Gemini API di Google AI Studio.
- Error 429: kuota atau rate limit Gemini API tercapai.
- Tidak ada dialog terdeteksi: pilih bahasa sumber manual dan gunakan scan yang lebih jelas.
- AI cleanup gagal: extension memakai fallback sederhana, lalu menampilkan peringatan.
- Shortcut bentrok: buka chrome://extensions/shortcuts untuk mengubahnya.

MODEL ID
OCR/translation: gemini-3.8-flash
Image cleanup: gemini-3.1-flash-image
