# Smart Finder - Kios Pencarian Buku Mandiri

Aplikasi web kiosk touchscreen mandiri untuk pengunjung toko buku mencari judul buku, pengarang, penerbit, kode produk/SKU, lokasi rak, lantai, dan ketersediaan stok secara real-time.

## Fitur Utama
- **Live Google Sheets Sync:** Terhubung langsung ke spreadsheet katalog & stok buku.
- **Offline Cache (LocalStorage):** Memuat instan 0-detik dari cache lokal jika jaringan toko sedang lambat atau terputus sementara.
- **Background Auto-Sync:** Melakukan sinkronisasi otomatis setiap 10 menit tanpa mengganggu pencarian aktif pengunjung.
- **Kiosk Auto-Reset (Idle Timer):** Mengosongkan form pencarian secara otomatis setelah 60 detik jika pengunjung selesai dan meninggalkan layar.
- **Touchscreen Friendly:** Dilengkapi Virtual Keyboard bawaan layar sentuh, optimasi gesture touch, dan pencegah menu klik kanan/long-press.
- **Multi-Filter Search:** Mendukung pencarian multi-kategori (Judul, SKU/ISBN, Pengarang, Penerbit).

## Deployment GitHub Pages
1. Masuk ke tab **Settings > Pages** di repositori GitHub.
2. Di bagian **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `root`
3. Klik **Save**. Halaman akan aktif di URL GitHub Pages Anda.

## Penggunaan di Layar Kiosk Toko (Chrome Kiosk Mode)
Gunakan perintah shortcut berikut di komputer toko:

```bash
google-chrome --kiosk "https://eurekabookhouseorg.github.io/smart-finder/" --disable-pinch --overscroll-history-navigation=0
```
