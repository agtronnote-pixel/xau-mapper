# Kantor Pine XAUUSD

Tim agent analisis emas (XAUUSD) yang berjalan **sepenuhnya di perangkat trader** — tanpa akun, tanpa API key, tanpa server berbayar. Dibangun di GitHub, diterbitkan sebagai aplikasi mobile (PWA) yang bisa di-install di Android & iPhone.

## Fitur (v3)
- **Beranda = keputusan**: BUY / SELL / TUNGGU / JANGAN TRADING, kalimat aksi, kekuatan sinyal, **peluang historis TP1 sebelum SL**, alasan & penghambat, kapan batal, rilis data yang harus dihindari.
- **14 agent**. Arah: Arka (trend), Mira (momentum), Sena (struktur), **Ravi (makro: DXY & yield riil)**, Kabar (berita RSS), Clara (analisis Claude). Pendukung: Vega, Tara, Nadi (kalender ForexFactory asli), Lukas (backtest & live), Maya, Dimas, Pina. Konsensus oleh Rina.
- **Agent tanpa data cukup tidak ikut konsensus** (tidak lagi dihitung "netral"), dan tercantum di peringatan.
- **Data asli**: candle H1 60 hari & M15 30 hari dengan high/low sungguhan (bukan sampel 5 menit), candle harian versi broker (17.00 NY), cek data basi (> 20 menit tertunda / > 2 jam = tidak ada rencana) dan konsistensi harga.
- **Kalibrasi harian dari backtest walk-forward 60 hari**: bobot agent, peluang per rentang kekuatan, rentang proyeksi 80%, statistik per sesi. Uji jujur di 40% data yang tidak dipakai kalibrasi.
- **Rekam jejak live**: setiap mapping per jam diarsipkan (`app/data/arsip/`) dan dinilai otomatis (TP1/TP2/SL) → `app/data/kinerja.json`.
- **EA MT5**: filter kekuatan minimal (default 55%), selisih harga broker dihitung otomatis dari candle M5 broker.
- Ekspor gambar/teks (dibuka dengan keputusan), EA (.zip), indikator Pine v6. Offline, notifikasi zona.

## Kripto 24/7 (v3.1)
- **5 aset kripto paling volatil** dipilih otomatis setiap hari dari 12 koin likuid yang umum ada di broker MT5 (volatilitas terealisasi 30 hari, dengan histeresis). Daftar & peringkat: `app/data/aset.json`.
- Data per aset di `app/data/aset/<ID>/` (market, kalibrasi, kinerja, latest, berita, arsip). EA: `app/ea/KPX_<ID>_latest.mq5`.
- Harga live di HP: Binance data-api (USDT, CORS terbuka); server: Binance, cadangan Coinbase. Tanpa key.
- Mesin memakai profil aset: jam 24/7 (tanpa mode akhir pekan; sesi "akhir pekan" berlikuiditas tipis), presisi harga per aset, angka bulat ±1% harga, candle harian 00:00 UTC, kamus berita kripto.
- **Aset tanpa keunggulan teruji** (rata-rata R negatif di uji luar sampel) → keputusan TUNGGU dan EA tidak entry (`InpMinStrength = 101`).
- Tautan langsung per aset: `.../kantor-pine/app/?aset=BTCUSD`.

## Aset yang selalu dipantau (v3.2)
- **BTCUSD** (Binance), **XMRUSD** (HTX, cadangan Kraken).
- **GBPUSD**: candle Yahoo GBPUSD=X, harga live Kraken; jam forex (Minggu 17.00 – Jumat 17.00 NY); kalender USD + GBP.
- **USA100** (Nasdaq 100) & **SNP500** (S&P 500): candle futures Yahoo NQ=F & ES=F; jam CME (jeda harian 17.00–18.00 NY). Tidak ada sumber harga live gratis untuk HP, jadi data dari server per jam (ambang data basi 90/180 menit).

## Struktur
```
kantor-pine/
  app/        PWA: index.html, app.js, engine.js (mesin v3), data.js, exporters.js, sw.js
  app/data/   market.json, kalibrasi.json, kinerja.json, latest.json, berita.json, analisis-claude.json, arsip/
  scripts/    build-market.mjs + market.js (data server), calibrate.mjs (backtest), run-mapping.mjs,
              score-archive.mjs, run-news.mjs + news.js, lib-stats.js, test-engine.mjs
  mt5/        KPX_Bot.mq5 (EA real-time) + KPX_Tools: KPX_RealTime.bat, compile otomatis, KPX_Agent
  lokal/      kantor.mjs: Kantor lokal real-time (jalan di PC, sinyal ke MQL5\Files\KPX)
.github/workflows/kantor-pine.yml   Uji → tiap jam: data → berita → kalibrasi (harian) → mapping → penilaian → commit
```

## Menjalankan
**Aplikasi:** https://agtronnote-pixel.github.io/xau-mapper/kantor-pine/app/ (terbit otomatis oleh GitHub Pages repo ini setelah masuk ke `main`).

1. Buka alamat di atas di HP → menu browser → **Install aplikasi** / **Tambahkan ke Layar Utama**.
2. Workflow *Kantor Pine XAUUSD* menguji mesin di setiap push/PR, dan tiap jam (Minggu–Jumat) menjalankan mapping server lalu meng-commit `app/data/latest.json` dan `app/ea/KPX_Mapping_latest.*`.
3. Uji lokal: `node kantor-pine/scripts/test-engine.mjs` dan `python3 -m http.server -d kantor-pine/app`.

## MT5 — eksekusi otomatis
1. Di MT5 desktop (Windows): **File → Open Data Folder → MQL5 → Experts**, salin folder `mt5/KPX_Tools` ke situ.
2. Klik dua kali **`KPX_Pasang_Semua.bat`**: memasang compile otomatis + pengunduh EA (ikut menyala saat Windows hidup), menunggu EA terbaru, lalu membuka MT5 dengan chart emas M15, EA `KPX_Mapping_latest` terpasang, dan Algo Trading menyala.
3. Aset lain: tulis di prompt installer (mis. `XAUUSD,BTCUSD`), lalu seret EA `KPX_<ASET>_latest` ke chart simbolnya sekali; MT5 mengingatnya.
- EA **hanya trading di akun demo** kecuali `InpAllowReal = true`. Filter kekuatan minimal 55%, selisih harga broker otomatis, berhenti saat spread lebar / rilis berita besar.
- MT5 di HP tidak bisa menjalankan EA; gunakan PC/VPS yang menyala.

## Sumber data (semua gratis, tanpa key)
- **Spot live**: xaus.com (di HP, tiap menit). Indikatif mid-market — cocokkan dengan MT5.
- **Candle H1/M15**: Yahoo Finance GC=F, digeser ke basis spot dengan selisih median di periode tumpang tindih (server, tiap jam).
- **Makro**: DXY (Yahoo DX-Y.NYB), yield riil 10 thn DFII10 & 10 thn DGS10 (FRED).
- **Kalender**: ForexFactory minggu berjalan (USD, dampak sedang/tinggi). Cadangan: pola rutin.
- **Berita**: Google News & Yahoo Finance RSS (agent Kabar), analisis Claude (tugas terjadwal).

## Batas yang tersisa (jujur)
- Backtest 60 hari = satu rezim pasar; angka peluang bisa berubah saat rezim berganti (karena itu dikalibrasi ulang tiap hari dan dicek dengan rekam jejak live).
- Backtest dan EA sama-sama entry saat harga menyentuh zona (tanpa candle konfirmasi; bisa diaktifkan lewat input EA). Backtest tanpa spread.
- Bobot Kabar & Clara tetap kecil sampai arsip cukup untuk mengukurnya.

## Disclaimer
Semua proyeksi adalah skenario probabilitas, **bukan kepastian dan bukan nasihat keuangan**. Trading emas berisiko tinggi. Gunakan stop loss dan uji di akun demo. Bila aplikasi dibagikan ke trader lain sebagai layanan sinyal, periksa aturan otoritas setempat.

## Real-time di MT5 (Kantor lokal)
1. Salin `mt5/KPX_Tools/KPX_RealTime.bat` ke `MQL5\Experts\KPX_Tools`, klik dua kali (sekali saja).
   Node.js portable diunduh otomatis bila belum ada; Kantor lokal ikut menyala saat Windows hidup.
2. Kantor lokal menganalisa tiap 1 detik (Binance), 2 detik (HTX/XMR), 3 detik (Kraken/GBPUSD), 15 detik (emas);
   indeks memakai data server (tiap jam). Sinyal ditulis ke `MQL5\Files\KPX\<ASET>.sig`.
3. EA `KPX_Bot` (satu EA untuk semua aset) membaca sinyal tiap 0,25 detik dan langsung eksekusi.
   Hapus EA lama `KPX_..._latest` dari chart agar tidak dobel.
4. Server GitHub tetap mengerjakan kalibrasi harian, berita, dan candle H1/M15. Kode Kantor lokal & KPX_Bot diperbarui otomatis tiap 10 menit.
