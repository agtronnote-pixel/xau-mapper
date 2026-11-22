# Kantor Pine XAUUSD

Tim agent analisis emas (XAUUSD) yang berjalan **sepenuhnya di perangkat trader** — tanpa akun, tanpa API key, tanpa server berbayar. Dibangun di GitHub, diterbitkan sebagai aplikasi mobile (PWA) yang bisa di-install di Android & iPhone.

## Fitur
- **11 agent** — Rina (Chief Strategist), Arka (Trend), Mira (Momentum), Sena (Struktur/SMC), Vega (Volatilitas), Tara (Sesi), Nadi (Kalender), Lukas (Validator/backtest), Maya (Risk), Dimas (EA MQL5), Pina (Pine v6).
- **Proyeksi 5 menit – 24 jam** dengan rentang kemungkinan yang menyesuaikan volatilitas tiap sesi (Asia/London/New York, otomatis mengikuti DST).
- **Rencana entry** (BUY/SELL, zona, SL, TP1/TP2, RR, konfirmasi, manajemen) + **status live tiap menit** dan notifikasi saat harga masuk zona atau melewati SL.
- **Jadwal aksi 24 jam**, level kunci (pivot, PDH/PDL, swing, angka bulat), kalkulator lot.
- **Ekspor**: gambar ringkasan, teks, EA MT5 (.zip), indikator Pine v6 untuk TradingView.
- **Riwayat & ketepatan**: setiap mapping disimpan dan dinilai otomatis terhadap harga aktual.
- **Offline**: aplikasi tetap terbuka tanpa internet dengan mapping terakhir.
- **Agent berita dari server**: *Kabar* (judul berita RSS + skor kata kunci, tiap jam di GitHub Actions, tanpa AI & tanpa key) dan *Clara — Analis Claude* (tugas terjadwal Claude 3x sehari menulis `app/data/analisis-claude.json`). Keduanya tampil di Beranda & Tim, belum ikut menentukan konsensus.

## Struktur
```
kantor-pine/
  app/        Aplikasi PWA (index.html, app.js, engine.js, data.js, exporters.js, sw.js)
  scripts/    test-engine.mjs (uji), run-mapping.mjs (mapping server), run-news.mjs + news.js (agent Kabar)
  mt5/        KPX_Tools: compile otomatis + KPX_Agent (unduh EA terbaru ke MT5)
  docs/       ARSITEKTUR.md
.github/workflows/kantor-pine.yml   Uji → mapping server tiap jam (commit hasil)
```

## Menjalankan
**Aplikasi:** https://agtronnote-pixel.github.io/xau-mapper/kantor-pine/app/ (terbit otomatis oleh GitHub Pages repo ini setelah masuk ke `main`).

1. Buka alamat di atas di HP → menu browser → **Install aplikasi** / **Tambahkan ke Layar Utama**.
2. Workflow *Kantor Pine XAUUSD* menguji mesin di setiap push/PR, dan tiap jam (Minggu–Jumat) menjalankan mapping server lalu meng-commit `app/data/latest.json` dan `app/ea/KPX_Mapping_latest.*`.
3. Uji lokal: `node kantor-pine/scripts/test-engine.mjs` dan `python3 -m http.server -d kantor-pine/app`.

## MT5 (opsional)
Salin folder `mt5/KPX_Tools` ke `MQL5/Experts/` lalu jalankan:
- `KPX_Setup_AutoCompile.bat` — compile otomatis setiap `KPX_*.mq5`.
- `KPX_Setup_Agent.bat` — isi alamat aplikasi (`https://agtronnote-pixel.github.io/xau-mapper/kantor-pine/app/`); EA `KPX_Mapping_latest` diunduh tiap 5 menit. Pasang EA itu sekali di chart XAUUSD; setiap mapping baru, MT5 memuat ulang otomatis.

## Sumber data
Harga dari **xaus.com** (gratis, tanpa key, CORS terbuka): spot (cache 60 detik), intraday tiap 5 menit (48 jam), histori harian. Harga bersifat indikatif mid-market, bukan kuotasi broker — selalu cocokkan dengan MT5. Pemakaian di atas 10.000 permintaan/hari perlu izin penyedia; lapisan `data.js` dirancang agar sumber lain mudah ditambahkan.

## Disclaimer
Semua proyeksi adalah skenario probabilitas, **bukan kepastian dan bukan nasihat keuangan**. Trading emas berisiko tinggi. Gunakan stop loss dan uji di akun demo. Bila aplikasi dibagikan ke trader lain sebagai layanan sinyal, periksa aturan otoritas setempat.
