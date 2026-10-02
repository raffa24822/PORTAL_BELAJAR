# ASTS — Satu Link Publik, Satu Server

Paket ini berisi web ujian dan API penyimpanan pada satu layanan Node.js. Setelah deploy, guru dan siswa membuka **link publik yang sama**. URL server otomatis mengikuti link tersebut; tidak perlu menyalin URL API secara terpisah.

## Yang sudah disiapkan
- Web ujian disajikan langsung dari server pada `/`.
- API sinkronisasi tersedia di layanan yang sama.
- Soal/mata pelajaran, akun siswa, dan hasil ujian disimpan di `asts-data.json`.
- Data siswa dan hasil ujian digabung berdasarkan nama/ID hasil untuk mengurangi risiko tertimpa ketika ada beberapa perangkat.
- File database ditulis secara atomik untuk mengurangi risiko file rusak ketika proses simpan berlangsung.
- Ada pemeriksaan kesehatan di `/health`.
- Pengaturan sinkronisasi tersedia dari halaman login, sehingga perangkat siswa juga bisa menghubungkan cloud. Kolom URL server bisa diketik atau ditempel secara manual bila tidak terisi otomatis.
- Tab monitor guru diberi nama **Daftar Akun**. Tombol **Reset Akun** menghapus semua akun siswa dari server bersama dengan konfirmasi ganda; perangkat lain menghapus data akun lama pada sinkronisasi berikutnya. Server juga menolak pengiriman ulang akun lama dari perangkat yang belum sempat menerima reset; akun baru setelah reset mendapat penanda waktu pembuatan baru. Rekap nilai tidak dihapus.

## Deploy publik (Render)
1. Unduh ZIP dan ekstrak semua isinya.
2. Unggah isi folder ke repository GitHub baru. Pastikan `server.js`, `package.json`, `render.yaml`, dan `ASTS_KELAS_10.html` berada di folder utama repository, bukan tersimpan satu folder tambahan.
3. Buka Render, pilih **New → Blueprint**, lalu sambungkan repository GitHub tersebut.
4. Pastikan layanan memakai Node.js dan persistent disk di `/var/data`. `render.yaml` mengatur variabel `ASTS_SERVER_KEY` acak dan persistent disk; paket disk persisten mungkin memerlukan paket hosting berbayar.
5. Tunggu deploy selesai. Link publik akan dibuat oleh Render, misalnya `https://nama-layanan.onrender.com`.
6. Buka link tersebut. Cek `https://nama-layanan.onrender.com/health`; jika statusnya `ok`, server hidup.
7. Kunci default paket ini adalah `BELAJAR ASTS KELAS 10` (juga disetel pada `render.yaml`). Pastikan Environment `ASTS_SERVER_KEY` di Render persis sama dengan nilai tersebut. Catatan: kunci sederhana ini mudah ditebak dan hanya untuk uji coba; jangan gunakan untuk ujian resmi atau data sensitif.
8. Pada setiap perangkat guru dan siswa, buka link publik yang sama → tekan **Pengaturan Server / Sinkronisasi** di halaman awal → masukkan kunci server → tekan **Simpan & Tes Koneksi**. URL terisi otomatis saat web dibuka dari server; jika belum, ketik atau tempel alamat publik Render. Masukkan kunci `BELAJAR ASTS KELAS 10`, lalu tekan Simpan & Tes Koneksi. Setelah berhasil, perangkat akan melakukan sinkronisasi berkala.

## Menjalankan lokal
Perlu Node.js 18+. Jalankan `npm install`, atur environment `ASTS_SERVER_KEY`, lalu `npm start`. Buka `http://localhost:3000`.

## Batasan penting
- Saya tidak bisa membuat link publik aktif langsung dari sini karena deploy membutuhkan akun GitHub/hosting milik pemilik aplikasi.
- Sinkronisasi berkala, bukan realtime per milidetik. Saat koneksi internet buruk, perubahan akan tersinkron setelah koneksi kembali dan proses simpan berikutnya.
- Kunci server dimasukkan ke browser dan disimpan di localStorage perangkat tersebut. Siapa pun yang memiliki kunci dapat membaca/mengubah data. Ini cukup untuk uji coba kelas tepercaya, **bukan** keamanan ujian resmi. Untuk penggunaan resmi, perlu autentikasi backend per guru/siswa dan hak akses yang benar.
- Persistent disk harus aktif. Jangan menghapus disk atau mengubah `DATA_DIR` sembarangan. Buat cadangan `asts-data.json` secara berkala.
- Server menggabungkan data akun siswa/hasil untuk mengurangi kehilangan akibat beberapa perangkat, tetapi bukan database transaksional; untuk pemakaian skala besar sebaiknya gunakan database terkelola seperti PostgreSQL.
- Perubahan mata pelajaran mengikuti data server sebagai sumber utama. Jika ada perubahan lokal saat offline, sambungkan kembali dan pastikan perubahan tersimpan sebelum pindah perangkat.
