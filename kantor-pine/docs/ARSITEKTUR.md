# Arsitektur Kantor Pine XAUUSD

## Prinsip
1. **Mandiri** — tidak bergantung pada Claude atau API AI berbayar. "Agent" adalah modul algoritma kuantitatif yang transparan dan bisa diuji.
2. **Di perangkat** — analisis berjalan di HP trader; GitHub hanya menyimpan kode, menguji, dan menerbitkan.
3. **Bisa diaudit** — setiap agent menjelaskan alasannya; validator mengukur akurasi historis; riwayat mapping dinilai terhadap harga aktual.

## Alur
```
xaus.com ──(spot 60s, intraday 5m, harian)──► data.js ──► engine.js (11 agent + konsensus)
                                                              │
         ┌──────────────── app.js (PWA) ◄─────────────────────┤
         │  Beranda · Proyeksi · Tim · Rencana · Lainnya       │
         │  notifikasi · offline · ekspor                       │
         ▼                                                      ▼
   Trader (HP)                                  GitHub Actions (tiap jam)
                                                run-mapping.mjs → commit: data/latest.json,
                                                ea/KPX_Mapping_latest.mq5, .pine
                                                              │
                                                              ▼
                                         PC MT5: KPX_Agent unduh → KPX_AutoCompile → EA reload
```

## Mesin analisis (engine.js)
- **Candle**: titik 5 menit diagregasi menjadi M15 dan H1; histori harian untuk trend besar, ATR harian, pivot, dan validasi.
- **Agent berarah** (Trend, Momentum, Struktur) memberi skor −1..+1 dan keyakinan; **Rina** menggabungkan dengan bobot 0,35 / 0,25 / 0,40.
- **Agent konteks** (Volatilitas, Sesi, Kalender, Validator) tidak memberi arah, tetapi menurunkan/menaikkan keyakinan.
- **Proyeksi**: langkah 5 menit; varians bertambah sesuai faktor volatilitas sesi (Asia 0,7, London 1,15, NY 1,3, overlap +0,25, tutup ≈0); drift = skor konsensus × 0,35 ATR/jam × faktor sesi, melemah seiring waktu.
- **Rencana**: zona di level kunci terdekat searah bias (pullback) dan alternatif berlawanan; SL 0,9 ATR H1 di balik zona; TP1 level pertama dalam 1–2R (atau 1,5R), TP2 level berikutnya (atau 3R).
- **Jadwal**: blok 30 menit menurut sesi, pasar tutup, dan jendela ±45 menit rilis data berdampak tinggi.

## Pengembangan berikutnya
- Sumber data berbayar (WebSocket tick) sebagai opsi di `data.js`.
- Narasi AI opsional dengan API key milik trader (tidak wajib).
- Bungkus PWA menjadi APK (Capacitor / Trusted Web Activity) untuk Play Store.
- Backtest intraday yang lebih panjang bila sumber data menyediakan histori menit.
