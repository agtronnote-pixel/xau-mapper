# Arsitektur Kantor Pine XAUUSD

## Prinsip
1. **Mandiri** — tidak bergantung pada Claude atau API AI berbayar. "Agent" adalah modul algoritma kuantitatif yang transparan dan bisa diuji.
2. **Di perangkat** — analisis berjalan di HP trader; GitHub hanya menyimpan kode, menguji, dan menerbitkan.
3. **Bisa diaudit** — setiap agent menjelaskan alasannya; validator mengukur akurasi historis; riwayat mapping dinilai terhadap harga aktual.

## Alur (v3)
```
GitHub Actions (tiap jam, Minggu–Jumat)
  build-market.mjs : Yahoo GC=F H1/M15 (digeser ke spot) · DXY · FRED yield · ForexFactory · xaus
        │            → app/data/market.json (untuk HP) + .cache/market-full.json
  run-news.mjs     : RSS → app/data/berita.json (agent Kabar)
  calibrate.mjs    : backtest walk-forward 60 hari (sekali sehari) → app/data/kalibrasi.json
  run-mapping.mjs  : engine.js → latest.json, EA/Pine terbaru, arsip/YYYY-MM.jsonl
  score-archive.mjs: nilai arsip dengan harga sesudahnya → app/data/kinerja.json
        │
        ▼ commit ke main → GitHub Pages
HP trader (PWA): xaus spot live tiap menit + data server → engine.js di perangkat → UI keputusan
Tugas terjadwal Claude (3x/hari) → app/data/analisis-claude.json (agent Clara)
PC MT5: KPX_Agent unduh EA terbaru → compile → EA (filter kekuatan, offset otomatis)
```

## Mesin analisis (engine.js v3)
- **Candle**: candle server (OHLC asli) digabung dengan titik live; harian versi broker (17.00 NY) untuk PDH/PDL/pivot & ATR harian.
- **Kualitas data**: umur data (tertunda > 20 menit menurunkan keyakinan, > 2 jam = tanpa rencana), konsistensi spot vs candle, agent tanpa data cukup dikeluarkan dari konsensus.
- **Agent berarah**: Trend, Momentum, Struktur, Makro (DXY & yield riil), Kabar, Clara. Bobot awal 0,28/0,20/0,30/0,12/0,05/0,05; empat pertama dikalibrasi ulang tiap hari dari korelasi skor dengan gerak 4 jam berikutnya.
- **Kekuatan sinyal**: keselarasan rencana dengan konsensus, analis searah, RR, dikurangi risiko (rilis, volatilitas, gap, data). **Peluang** = tingkat TP1-sebelum-SL backtest untuk rentang kekuatan yang sama.
- **Keputusan (narasi)**: BUY/SELL hanya bila kekuatan ≥ 55% dan peluang ≥ 50% (bila sampel ≥ 30); selain itu TUNGGU; data basi = JANGAN TRADING.
- **Proyeksi**: bila terkalibrasi, jalur = k_h × skor × ATR H1 dan rentang 80% dari residu backtest; bila belum, heuristik volatilitas sesi.
- **Rencana**: zona di level kunci; SL 0,9 ATR H1; TP1 level dalam 1–2R, TP2 level berikutnya; diurutkan dari terkuat.
- **Evaluasi** (`evaluatePlan`): entry saat zona tersentuh, SL & TP di candle sama = SL, 50% di TP1 lalu SL ke impas.

## Pengembangan berikutnya
- Bungkus PWA menjadi APK (Capacitor / Trusted Web Activity) untuk Play Store.
- Ukur bobot Kabar & Clara dari arsip setelah cukup sampel.
- Backtest lebih panjang bila tersedia sumber candle intraday gratis yang lebih panjang.
