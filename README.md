# Bank JSON Studio

Aplikasi web statis untuk mengubah file soal menjadi JSON yang mengikuti format impor bank soal Latveria.

## Fitur

- Membaca file PDF berbasis teks, DOCX, TXT, MD, CSV, dan JSON.
- Mengekstrak soal berlabel nomor, opsi A–E, kunci jawaban, pembahasan, dan sumber menggunakan pola teks.
- Mengedit grup, slug subtes, nama paket, kategori, prompt, opsi, jawaban benar, pembahasan, dan sumber.
- Memuat JSON yang sudah memakai struktur `groups` untuk diperiksa dan diperbaiki.
- Memvalidasi field wajib, slug subtes, empat opsi unik, kunci jawaban, maksimum 100 soal, serta batas 200 KB.
- Menampilkan pratinjau, menyalin, dan mengunduh JSON setelah lolos validasi.
- Menyediakan pintasan ke halaman admin Latveria untuk drilling dan tryout.
- Seluruh pemrosesan dilakukan di browser; tidak membutuhkan database, backend, atau API key.

## Penggunaan lokal

Buka `index.html` di browser modern. Pembaca PDF dan DOCX memakai pustaka dari CDN sehingga memerlukan koneksi internet. Alternatifnya jalankan server statis:

```bash
python -m http.server 8000
```

Buka http://localhost:8000.

## Deploy di Vercel

Impor repository ini ke Vercel. Tidak ada proses build atau dependensi npm yang perlu dipasang; aplikasi dilayani sebagai situs statis dari root repository.

## Tujuan di Latveria

- **Impor paket drilling:** https://latveriacademy.site/admin/soal/impor
- **Kelola paket tryout:** https://latveriacademy.site/admin/tryouts

JSON ekspor dibuat untuk format impor bank soal drilling. Tautan tryout hanya membuka halaman admin terkait; format tryout tidak diasumsikan sama dengan JSON drilling dan aplikasi belum mengirim data otomatis ke halaman tersebut.

## Batasan

- Ekstraksi menggunakan pola teks, bukan pemahaman semantik AI. Verifikasi prompt, opsi, kunci, pembahasan, dan sumber sebelum ekspor.
- PDF hasil scan berbentuk gambar belum didukung OCR.
- Tabel, diagram, rumus rumit, bacaan bersama, dan format sumber yang tidak konsisten mungkin membutuhkan koreksi manual.
- Aplikasi tidak masuk ke akun Latveria atau menyimpan paket langsung; proses impor tetap dilakukan oleh pengguna pada halaman admin.


## Catatan parser (pembaruan)

Parser kini mempertahankan baris teks hasil ekstraksi PDF berdasarkan pemisah baris PDF dan perubahan posisi teks, serta mengenali format nomor seperti `1.`, `1)`, nomor tunggal pada baris tersendiri, dan label opsi `A.`, `A)`, `(A)`, atau `[A]`. Kunci, pembahasan, dan sumber yang berada setelah opsi pada baris yang sama juga dipisahkan jika polanya dikenali.

Tetap periksa hasilnya di editor. PDF dua kolom, urutan teks yang tidak biasa, atau dokumen yang menghilangkan label opsi mungkin membutuhkan koreksi manual.
