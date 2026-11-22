# Kantor Pine — tim agent analisis emas, kripto, forex & indeks

**Aplikasi:** https://agtronnote-pixel.github.io/xau-mapper/ (otomatis membuka `/kantor-pine/app/`)

PWA tanpa akun dan tanpa API key. Tim agent kuantitatif menganalisis XAUUSD, aset tetap (BTCUSD, XMRUSD, GBPUSD, USA100, SNP500) dan 5 kripto paling volatil; dikalibrasi tiap hari dengan backtest dan dinilai otomatis dengan rekam jejak live. Dokumentasi lengkap: [`kantor-pine/README.md`](kantor-pine/README.md).

- Kode aplikasi & mesin: `kantor-pine/app/`
- Skrip server (GitHub Actions, tiap jam): `kantor-pine/scripts/`, workflow `.github/workflows/kantor-pine.yml`
- Alat MT5: `kantor-pine/mt5/KPX_Tools`
- Aplikasi XAU Mapper lama (butuh API key Claude & Twelve Data): `lama/` → https://agtronnote-pixel.github.io/xau-mapper/lama/
