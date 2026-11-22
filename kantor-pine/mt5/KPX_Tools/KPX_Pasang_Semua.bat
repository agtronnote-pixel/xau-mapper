@echo off
setlocal
title Kantor Pine - Pasang otomatis ke MT5
set "DIR=%~dp0"
cd /d "%DIR%"
echo ==============================================================
echo   KANTOR PINE - pemasangan otomatis ke MT5 (sekali saja)
echo   Jalankan dari folder MQL5\Experts\KPX_Tools milik MT5 Anda.
echo   GUNAKAN AKUN DEMO. EA menolak akun riil kecuali diizinkan.
echo ==============================================================
echo.
if not exist "%DIR%..\..\..\origin.txt" (
  echo GAGAL: folder ini bukan di dalam MQL5\Experts milik MT5.
  echo Di MT5: File - Open Data Folder - MQL5 - Experts, letakkan KPX_Tools di situ.
  pause & exit /b 1
)
set "ASET=XAUUSD"
echo Aset yang EA-nya diunduh otomatis, dipisah koma.
echo Pilihan: XAUUSD,BTCUSD,XMRUSD,GBPUSD,USA100,SNP500 dan 5 kripto teratas
set /p ASET=Aset (Enter = XAUUSD): 
echo.
set "SYM=XAUUSD"
echo Nama simbol EMAS di broker Anda (lihat Market Watch). Exness biasanya XAUUSDm.
set /p SYM=Simbol emas (Enter = XAUUSD): 

rem ---- 1-4: konfigurasi + compile otomatis + pengunduh EA, ikut menyala saat Windows hidup ----
> "%DIR%KPX_Agent.config" echo https://agtronnote-pixel.github.io/xau-mapper/kantor-pine/app/
>> "%DIR%KPX_Agent.config" echo %ASET%
set "SU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%SU%\KPX_AutoCompile.vbs" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_AutoCompile.ps1""", 0, False
> "%SU%\KPX_Agent.vbs" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_Agent.ps1""", 0, False
start "" wscript.exe "%SU%\KPX_AutoCompile.vbs"
start "" wscript.exe "%SU%\KPX_Agent.vbs"
echo.
echo [1/3] Compile otomatis dan pengunduh EA AKTIF.

rem ---- 5: tunggu EA terbaru terunduh & ter-compile ----
echo [2/3] Menunggu EA mapping terbaru diunduh dan di-compile (maks 6 menit)...
set /a n=0
:tunggu
if exist "%DIR%..\KPX_Mapping_latest.ex5" goto siap
set /a n+=1
if %n% gtr 72 goto gagal
timeout /t 5 /nobreak >nul
goto tunggu
:gagal
echo GAGAL: EA belum muncul. Cek KPX_Agent_status.txt dan KPX_AutoCompile_status.txt di folder Experts.
pause & exit /b 1
:siap
echo       EA siap: KPX_Mapping_latest.ex5

rem ---- 6-7: buka MT5 dengan chart emas, EA terpasang, Algo Trading menyala ----
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-Content -Path '%DIR%..\..\..\origin.txt' -TotalCount 1).Trim()"`) do set "MT5=%%a"
> "%DIR%KPX_Start.ini" echo [Experts]
>> "%DIR%KPX_Start.ini" echo AllowLiveTrading=1
>> "%DIR%KPX_Start.ini" echo AllowDllImport=0
>> "%DIR%KPX_Start.ini" echo Enabled=1
>> "%DIR%KPX_Start.ini" echo [StartUp]
>> "%DIR%KPX_Start.ini" echo Expert=KPX_Mapping_latest
>> "%DIR%KPX_Start.ini" echo Symbol=%SYM%
>> "%DIR%KPX_Start.ini" echo Period=M15
tasklist /fi "imagename eq terminal64.exe" | find /i "terminal64.exe" >nul
if not errorlevel 1 (
  echo.
  echo MT5 sedang terbuka. TUTUP MT5 dulu ^(File - Exit^), lalu tekan tombol apa saja.
  pause >nul
)
echo [3/3] Membuka MT5: chart %SYM% M15 + EA KPX_Mapping_latest + Algo Trading menyala...
start "" "%MT5%\terminal64.exe" /config:"%DIR%KPX_Start.ini"
echo.
echo SELESAI. Di MT5 periksa pojok kiri atas chart: status EA dan "Selisih harga".
echo - MT5 mengingat chart ^& EA ini; buka MT5 seperti biasa selanjutnya.
echo - Aset lain ^(BTCUSD, dst.^): seret EA KPX_^<ASET^>_latest dari Navigator ke chart simbolnya sekali saja.
echo - Mematikan semua: jalankan KPX_Hapus_AutoCompile.bat dan hapus KPX_Agent.vbs dari folder Startup.
echo.
pause
