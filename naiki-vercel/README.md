# Naiki AI

Teman karier siswa SMA. Ada 7 fitur dalam satu alur: AI Career Companion, Asesmen Potensi Diri (RIASEC), Career Roadmap Otomatis, Dashboard Guru BK, Mentoring Terintegrasi, Progress Tracker, dan Smart Career Directory.

Chat Naiki dan tombol "Personalisasi dengan Naiki" memakai AI sungguhan lewat server Vercel. API key disimpan di server, jadi tidak terlihat oleh pengunjung.

## Isi folder

| File | Fungsi |
|---|---|
| `index.html` | Seluruh tampilan aplikasi |
| `logo.png` | Logo dan ikon tab browser |
| `api/naiki.mjs` | Backend AI di alamat `/api/naiki` |
| `package.json` | Penanda proyek Node (tanpa library tambahan) |
| `.env.example` | Contoh daftar Environment Variables |

---

## Langkah deploy (sekitar 10 menit, gratis)

### 1. Ambil API key Gemini (gratis)
1. Buka **https://aistudio.google.com/apikey** dan masuk dengan akun Google.
2. Klik **Create API key**, lalu salin key-nya.
3. Simpan key ini baik-baik. **Jangan** ditempel di `index.html` atau di-upload ke GitHub.

### 2. Upload ke GitHub
1. Masuk ke **https://github.com**, lalu klik **New repository**. Contoh nama: `naiki-ai`.
2. Di repository baru, klik **uploading an existing file**.
3. Seret semua isi folder ini ke sana, **termasuk folder `api`**, lalu klik **Commit changes**.
   - Pastikan struktur di GitHub terlihat seperti ini: `index.html`, `logo.png`, `package.json`, `api/naiki.mjs`.

### 3. Deploy di Vercel
1. Buka **https://vercel.com** dan masuk dengan akun GitHub.
2. Klik **Add New… → Project**, lalu pilih repository `naiki-ai` dan klik **Import**.
3. Biarkan **Framework Preset** di "Other". Build command dan output tidak perlu diubah.
4. Buka bagian **Environment Variables**, lalu tambahkan:
   - Name: `GEMINI_API_KEY`
   - Value: *(tempel API key dari langkah 1)*
5. Klik **Deploy**.
6. Setelah selesai, buka link `https://naiki-ai-xxxx.vercel.app`. Di pojok kiri bawah harus muncul **"Naiki aktif"** dengan titik hijau.

Link ini bisa dibuka siapa saja tanpa login.

> Kalau Environment Variable ditambahkan atau diubah **setelah** deploy, perubahan baru berlaku setelah deploy ulang: buka **Deployments**, klik ⋯ pada deployment terakhir, lalu pilih **Redeploy**.

---

## Kalau ada masalah

| Yang terlihat | Artinya | Solusi |
|---|---|---|
| "API key belum diatur" | `GEMINI_API_KEY` belum ada di Vercel | Isi di Settings → Environment Variables, lalu Redeploy |
| "Naiki offline" | Halaman dibuka langsung dari file di komputer, atau folder `api` tidak ikut ter-upload | Buka lewat link Vercel dan pastikan `api/naiki.mjs` ada di GitHub |
| "Kuota AI habis" | Batas kuota gratis Gemini tercapai | Tunggu beberapa saat, atau ganti model (lihat di bawah) |
| Pesan error lainnya | Lihat detailnya di Vercel | Buka proyek di Vercel, lalu tab **Logs** |

---

## Pengaturan opsional (Environment Variables)

| Nama | Contoh | Kegunaan |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Ganti model Gemini. Default `gemini-3.6-flash`. Flash-Lite lebih cepat dan hemat kuota. |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Pakai Claude sebagai pengganti Gemini (berbayar, dari console.anthropic.com) |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Model Claude yang dipakai |
| `AI_PROVIDER` | `gemini` / `anthropic` | Pilih penyedia jika kedua key diisi |
| `ALLOWED_ORIGIN` | `https://naiki-ai.vercel.app` | Supaya backend hanya bisa dipakai dari situsmu sendiri (disarankan) |
| `RATE_LIMIT` | `30` | Batas permintaan per pengunjung per 10 menit |

## Catatan penting

- **Keamanan key.** API key hanya ada di Vercel. File `.env` dan `.env.local` sudah masuk `.gitignore`, jadi tidak ikut ter-upload.
- **Kuota gratis.** Gemini gratis punya batas permintaan per menit dan per hari. Untuk presentasi atau lomba, uji dulu sehari sebelumnya.
- **Privasi.** Data yang dikirim lewat kuota gratis Gemini dapat dipakai Google untuk meningkatkan produknya. Ingatkan pengguna agar tidak menulis data pribadi yang sensitif di chat.
- **Data contoh.** Nama siswa, mentor, statistik Guru BK, dan kisaran gaji di aplikasi ini adalah contoh. Progres setiap pengunjung tersimpan di browser masing-masing.

## Uji coba di komputer sendiri (opsional)

Butuh Node.js 20 atau lebih baru.

```bash
cp .env.example .env.local      # lalu isi GEMINI_API_KEY di .env.local
npx vercel dev                  # buka http://localhost:3000
```
