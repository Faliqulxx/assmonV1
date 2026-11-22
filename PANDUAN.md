# Panduan PETRIK

Alur harian: pengingat muncul -> ketik kegiatan -> "Buat Laporan" -> "Buka portal & bawa draf" -> periksa, tambah lokasi, centang pernyataan, lalu **Anda sendiri** menekan Simpan dan Kirim.

Aplikasi ini sengaja tidak menekan tombol kirim, tidak mencentang pernyataan "telah meninjau", dan tidak menyentuh lokasi. Ketiganya adalah pernyataan dan bukti kehadiran Anda.

## 1. Salin semua dan buka portal

Sudah aktif tanpa pengaturan. Tombol ada di bawah hasil 3 kolom.

## 2. Pengingat harian (Web Push)

1. Buat kunci VAPID sekali saja di terminal: `npx web-push generate-vapid-keys`
2. Di Vercel, buka Project > Settings > Environment Variables, lalu isi:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = public key
   - `VAPID_PRIVATE_KEY` = private key (jangan dibagikan)
   - `VAPID_SUBJECT` = `mailto:emailanda@contoh.com`
   - `CRON_SECRET` = teks acak panjang
3. Redeploy. Pasang aplikasi ke layar utama HP (menu Chrome > Install), buka, lalu Pengaturan > **Aktifkan pengingat** dan izinkan notifikasi.
4. Tekan **Uji notifikasi**. Kalau muncul, lanjut: **Salin kode langganan**, lalu tempel ke Vercel sebagai `PUSH_SUBSCRIPTION`, dan redeploy lagi.

Jam kirim ada di `vercel.json` (`"0 9 * * 1-5"` = 09:00 UTC = **16:00 WIB**, Senin-Jumat). Ubah angka jam sesuai kebutuhan (WIB = UTC + 7). Pada paket Hobby, Vercel hanya menjalankan cron sekali sehari dan waktunya bisa meleset dalam jam yang sama.

## 3. Userscript pengisi form

1. Di Android, pasang **Firefox** lalu ekstensi **Violentmonkey** (Chrome biasa tidak menjalankan userscript).
2. Di Firefox, buka `https://assmonev.vercel.app/monev-autofill.user.js` dan konfirmasi pemasangan.
3. Pakai **Buka portal & bawa draf** dari aplikasi. Login SIAPkerja seperti biasa, buka Riwayat Kehadiran, pilih tanggal, dan **Tambah laporan**. Tiga kolom terisi otomatis kalau masih kosong.
4. Kalau tidak terisi, tekan tombol biru **Isi dari draf** di pojok kanan bawah halaman portal.

Catatan teknis: draf dibawa lewat bagian `#` di URL, jadi tidak dikirim ke server mana pun, dan dihapus dari address bar setelah dibaca. Draf kedaluwarsa setelah 24 jam. Skrip membaca label kolom ("Uraian aktivitas", "Pembelajaran yang diperoleh", "Kendala yang dialami"); kalau portal mengubah tampilannya dan tidak terisi, kabari agar penyesuaiannya diperbarui.
