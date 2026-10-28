# Bank JSON Studio

Aplikasi web untuk mengubah file soal menjadi JSON sesuai format impor bank soal Latveria. Ekstraksi berjalan lokal di browser; analisis jawaban dan pembahasan memakai endpoint serverless dengan model AI gratis tanpa API key dari pengguna.

## Fitur

- Membaca file PDF berbasis teks, DOCX, TXT, MD, CSV, dan JSON.
- Mengekstrak soal berlabel nomor, opsi A–E, kunci jawaban, pembahasan, dan sumber menggunakan pola teks.
- Mengedit grup, slug subtes, nama paket, kategori, prompt, opsi, jawaban benar, pembahasan, dan sumber.
- Memuat JSON yang sudah memakai struktur `groups` untuk diperiksa dan diperbaiki.
- Memvalidasi field wajib, slug subtes, empat opsi unik, kunci jawaban, maksimum 100 soal, serta batas 200 KB.
- Menampilkan pratinjau, menyalin, dan mengunduh JSON setelah lolos validasi.
- Menyediakan pintasan ke halaman admin Latveria untuk drilling dan tryout.
- Ekstraksi file berjalan di browser; analisis jawaban dan pembahasan memakai endpoint serverless Vercel yang meneruskan teks soal ke layanan AI pihak ketiga gratis tanpa API key dari pengguna.

## Penggunaan lokal

Buka `index.html` di browser modern. Pembaca PDF dan DOCX memakai pustaka dari CDN sehingga memerlukan koneksi internet. Alternatifnya jalankan server statis:

```bash
python -m http.server 8000
```

Buka http://localhost:8000.

## Deploy di Vercel

Hubungkan repository ke Vercel. Situs di root dilayani sebagai HTML statis dan endpoint analisis berada di folder api/. Konfigurasi deployment menyediakan runtime Node.js. Jalur AI saat ini memakai endpoint inference anonim tanpa API key; ketersediaan dan batas permintaan bergantung pada penyedia.

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


## Answer-key detection and explanations

The parser recognises per-question labels such as `Kunci: C`, `Jawaban benar: B`, `Kunci jawaban nomor 1: B`, as well as separate `Kunci Jawaban` sections with numbered mappings. Numbered `Pembahasan` sections are attached to their matching question numbers.

For questions with numeric options, automatic solving currently supports percentage calculations, basic arithmetic expressions, and simple linear equations in one variable. When the result uniquely matches one option, the app fills the answer index and generates a step-based explanation. If the source's answer key disagrees with the calculation, it displays a conflict warning rather than silently replacing the source key.

For verbal, reading-comprehension, logic, geometry, or other question types outside these rules, the browser-only app cannot reliably infer a correct answer without a supplied key or a capable reasoning model. If a source key is known but no supported method can produce a real explanation, the app creates an explicitly marked draft. Draft explanations are blocked by validation until the user adds a specific, verified rationale. The app calls a third-party anonymous AI inference endpoint for supported question types and does not require the user to create an API key. Availability and rate limits are controlled by the provider. The application can produce mistakes; review results before importing.


## AI answer detection and explanations

The Analyze buttons call a Vercel serverless function in `api/analyze.js`. It asks an anonymous, no-key inference endpoint to independently solve the question, return a zero-based answer index, and write a specific Indonesian explanation. The tested provider endpoint is `https://text.pollinations.ai/openai`. The app batches up to five questions per request.

No provider key or credit card is required by this integration. The public anonymous service may apply rate limits, change models, or become unavailable. If the AI endpoint fails, the app tries its local deterministic solver for supported math questions and shows a warning for anything it could not solve.

**Privacy:** the prompt, answer choices, any included text passage, and existing answer/explanation are forwarded to the third-party inference provider. Do not submit personal data, confidential documents, or sensitive material.

AI answers are suggestions, not proof. Results marked uncertain or conflicting with the source key require manual review before JSON export. The local rule-based solver currently supports common percentages, basic arithmetic, and simple linear equations; the AI endpoint extends this to other multiple-choice questions, but accuracy depends on the source formatting and model.
