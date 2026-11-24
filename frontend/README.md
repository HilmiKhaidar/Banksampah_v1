# Bank Sampah Sekolah Merdeka — Frontend

Frontend dibangun dengan Next.js, React, dan TypeScript. Login, sesi, akun, profil, jenis sampah, setoran, saldo rupiah, pencairan, notifikasi, preferensi notifikasi, dan foto terhubung ke backend/database.

## Menjalankan aplikasi

Dari folder proyek:

```powershell
cd frontend
npm run dev
```

Buka `http://localhost:3000`.

Validasi:

```powershell
npm run lint
npm run build
```

## Akun dan penyimpanan

- Peserta didik tidak mendaftar sendiri. Pengelola mengimpor data siswa dari CSV atau Excel `.xlsx` dengan kolom `NISN` dan `Nama`; `Kelas` bersifat opsional.
- Setiap akun hasil impor mendapat kata sandi sementara acak dan harus menggantinya setelah login pertama. Daftar kredensial hanya ditampilkan sekali setelah impor; simpan dan bagikan secara pribadi.
- Pengelola dapat mengatur kata sandi sementara baru untuk peserta dari menu Peserta. Sesi peserta akan dicabut, dan kata sandi sementara wajib diganti saat peserta masuk kembali.
- Akun pengelola disiapkan melalui backend.
- Tidak ada akun atau data contoh bawaan.
- Akun, sesi, dan data bisnis (jenis sampah, setoran, saldo, pencairan, dan notifikasi) disimpan di database backend dan tersinkron antar perangkat.
- Nomor WhatsApp pengelola menggunakan data profil akun di database; preferensi notifikasi juga tersimpan per akun di database.
- Foto setoran dan foto jenis sampah yang diunggah disimpan di MySQL dan dapat dilihat dari perangkat lain setelah masuk.
- Profil akun hanya di-cache sementara di memori browser. Cache akun, sesi, dan bisnis versi lama di `localStorage` dibersihkan saat aplikasi dimulai.
- Alur aplikasi aktif tidak menyimpan data akun atau bisnis ke `localStorage`, `sessionStorage`, atau cache HTTP; data bisnis dibaca dan disimpan melalui API ke MySQL.
- Browser tetap menyimpan cookie sesi `HttpOnly` untuk autentikasi. Cookie tersebut berisi token sesi, bukan salinan data bisnis.

## Fitur prototipe

Dashboard tidak berisi data contoh. Pengelola dapat mengelola peserta, menetapkan tarif rupiah per satuan untuk tiap jenis sampah (kg/liter), mencatat setoran langsung setelah penimbangan, memeriksa pengajuan, memasukkan berat/volume aktual, lalu menyetujui atau menolak setoran. Setoran yang disetujui menambahkan saldo berdasarkan jumlah aktual dikalikan tarif. Halaman laporan menampilkan rekap berat, nilai, transaksi, pencairan, dan jenis sampah berdasarkan periode. Pengelola juga dapat meninjau permintaan pencairan, mengirim transfer secara manual, lalu mencatat pencairan selesai.

Di katalog jenis sampah, pengelola dapat memilih ikon yang disarankan otomatis dari nama sampah atau mengunggah foto sebagai visual. Foto dikompres di browser, diunggah, lalu disimpan di MySQL. Tarif sampah dan saldo menggunakan rupiah langsung; tidak ada sistem poin atau konversi.

Peserta dapat memilih beberapa jenis sampah atau mengajukan jenis yang belum tersedia dengan deskripsi, mengunggah hingga lima foto, membatalkan pengajuan yang belum diperiksa, melihat saldo dan riwayat transaksi, serta mengajukan pencairan ke rekening bank atau e-wallet. Untuk jenis yang belum tersedia, pengelola memetakan jenis katalog dan tarif saat pemeriksaan sebelum saldo dapat ditambahkan. Saldo pada pengajuan aktif ditahan sampai pengajuan dibatalkan, ditolak, atau dibayar. Transfer dilakukan manual; tidak ada integrasi pembayaran.

Profil menyediakan data akun, ubah kata sandi, preferensi notifikasi, pengaturan kontak WhatsApp pengelola, bantuan, dan keluar. Foto setoran dikompres di browser sebelum dikirim dan disimpan di MySQL. Data poin lama tidak dikonversi menjadi saldo rupiah.

## Mencoba alur lokal

1. Masuk sebagai pengelola, tambahkan jenis sampah, pilih satuan kg atau liter, dan tetapkan tarif rupiah per satuan.
2. Sebagai pengelola, impor data siswa dan bagikan kata sandi sementara secara pribadi. Peserta login dengan NISN, mengganti kata sandi, lalu mengajukan setoran dengan jenis sampah dan foto. Jika jenis belum tersedia di katalog, peserta dapat memilih opsi jenis lain dan mengisi deskripsinya.
3. Masuk kembali sebagai pengelola untuk memasukkan berat/jumlah aktual dan menyetujui setoran; saldo rupiah akan ditambahkan otomatis.
4. Sebagai peserta, ajukan pencairan saldo. Pengelola menyetujui atau menolak, lalu setelah transfer manual dicatat sebagai selesai.

Jalankan backend dan frontend, lalu masuk dengan akun yang sudah disiapkan; tidak ada akun demo atau data uji yang dibuat otomatis.

## Struktur sumber

- `src/app/` berisi route Next.js, layout, dan stylesheet global.
- `src/components/ui/` berisi komponen antarmuka umum yang dapat dipakai lintas fitur.
- `src/features/workspace/` berisi shell aplikasi setelah autentikasi dan komposisi tampilan.
- `src/features/notifications/` berisi komponen notifikasi dan stylesheet khusus.
- `src/lib/` berisi autentikasi, klien API, tipe data, dan validasi.

Saat menambah fitur, letakkan UI dan stylesheet spesifik di `src/features/<nama-fitur>/`; pertahankan komponen generik di `src/components/` dan aturan/operasi data di `src/lib/`. Pemisahan tampilan workspace lainnya dapat dilanjutkan bertahap agar perubahan tetap terisolasi dan mudah divalidasi.
