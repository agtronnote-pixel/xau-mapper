@echo off
setlocal
title Kantor Pine - pasang Kantor REAL-TIME
set "DIR=%~dp0"
cd /d "%DIR%"
set "SITE=https://agtronnote-pixel.github.io/xau-mapper"
echo ==============================================================
echo   KANTOR PINE REAL-TIME (sekali pasang)
echo   Kantor lokal menganalisa tiap 1-5 detik di PC ini, EA KPX_Bot
echo   membaca sinyal tiap 0,25 detik dan langsung eksekusi.
echo   GUNAKAN AKUN DEMO.
echo ==============================================================
echo.
if not exist "%DIR%..\..\..\origin.txt" (
  echo GAGAL: folder ini bukan di dalam MQL5\Experts milik MT5.
  echo Di MT5: File - Open Data Folder - MQL5 - Experts - KPX_Tools, letakkan file ini di situ.
  pause & exit /b 1
)
if not exist "%DIR%KPX_Agent.config" (
  set "ASET=XAUUSD"
  echo Aset yang dianalisa real-time, dipisah koma. Contoh: XAUUSD,XMRUSD,BTCUSD,GBPUSD
  set /p ASET=Aset ^(Enter = XAUUSD^):
  > "%DIR%KPX_Agent.config" echo %SITE%/kantor-pine/app/
  >> "%DIR%KPX_Agent.config" call echo %%ASET%%
)
echo Aset aktif ^(baris ke-2 KPX_Agent.config^):
more +1 "%DIR%KPX_Agent.config"
echo.

rem ---- 1: Node.js (mesin Kantor). Pakai yang terpasang, atau unduh versi portable ke KPX_Tools\node ----
set "NODE="
for /f "delims=" %%n in ('where node 2^>nul') do if not defined NODE set "NODE=%%n"
if not defined NODE if exist "%DIR%node\node.exe" set "NODE=%DIR%node\node.exe"
if not defined NODE (
  echo [1/4] Mengunduh Node.js portable ^(sekitar 30 MB, sekali saja^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $v='v22.12.0'; $z=Join-Path $env:TEMP 'kpx_node.zip'; Invoke-WebRequest -UseBasicParsing \"https://nodejs.org/dist/$v/node-$v-win-x64.zip\" -OutFile $z; $t=Join-Path $env:TEMP 'kpx_node'; if(Test-Path $t){Remove-Item $t -Recurse -Force}; Expand-Archive $z $t -Force; $d=Join-Path '%DIR%' 'node'; if(Test-Path $d){Remove-Item $d -Recurse -Force}; Move-Item (Join-Path $t \"node-$v-win-x64\") $d; Remove-Item $z"
  if exist "%DIR%node\node.exe" set "NODE=%DIR%node\node.exe"
)
if not defined NODE ( echo GAGAL: Node.js tidak bisa diunduh. Periksa internet lalu jalankan ulang. & pause & exit /b 1 )
echo [1/4] Node.js: %NODE%

rem ---- 2: kode Kantor lokal + EA KPX_Bot ----
echo [2/4] Mengunduh kode Kantor lokal dan EA KPX_Bot...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $s='%SITE%/kantor-pine/'; $k=Join-Path '%DIR%' 'kantor'; foreach($p in 'lokal/kantor.mjs','app/engine.js','app/data.js','app/exporters.js'){ $f=Join-Path $k $p; New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null; Invoke-WebRequest -UseBasicParsing ($s+$p+'?t='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -OutFile $f }; Invoke-WebRequest -UseBasicParsing ($s+'mt5/KPX_Bot.mq5?t='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -OutFile (Join-Path '%DIR%..' 'KPX_Bot.mq5')"
if not exist "%DIR%kantor\lokal\kantor.mjs" ( echo GAGAL mengunduh kode. Periksa internet lalu jalankan ulang. & pause & exit /b 1 )

rem ---- 3: Kantor lokal menyala terus (ikut Windows, hidup lagi bila berhenti) + compile otomatis ----
set "SU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%SU%\KPX_Kantor.vbs" echo Set sh = CreateObject("WScript.Shell")
>> "%SU%\KPX_Kantor.vbs" echo Do
>> "%SU%\KPX_Kantor.vbs" echo   sh.Run """%NODE%"" ""%DIR%kantor\lokal\kantor.mjs""", 0, True
>> "%SU%\KPX_Kantor.vbs" echo   WScript.Sleep 3000
>> "%SU%\KPX_Kantor.vbs" echo Loop
if not exist "%SU%\KPX_AutoCompile.vbs" > "%SU%\KPX_AutoCompile.vbs" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_AutoCompile.ps1""", 0, False
start "" wscript.exe "%SU%\KPX_AutoCompile.vbs"
start "" wscript.exe "%SU%\KPX_Kantor.vbs"
echo [3/4] Kantor lokal AKTIF ^(log: MQL5\Experts\KPX_Kantor_status.txt^).

rem ---- 4: tunggu sinyal pertama & EA ter-compile ----
echo [4/4] Menunggu sinyal pertama dan compile KPX_Bot ^(maks 2 menit^)...
set /a n=0
:tunggu
if exist "%DIR%..\KPX_Bot.ex5" if exist "%DIR%..\..\Files\KPX\*.sig" goto siap
set /a n+=1
if %n% gtr 24 goto lambat
timeout /t 5 /nobreak >nul
goto tunggu
:lambat
echo PERINGATAN: belum lengkap. Cek KPX_Kantor_status.txt dan KPX_AutoCompile_status.txt di folder Experts.
echo Bila KPX_Bot.ex5 belum ada: buka MetaEditor ^(F4^), buka KPX_Bot.mq5, tekan Compile.
goto akhir
:siap
echo       Sinyal real-time mengalir dan KPX_Bot siap.
:akhir
echo.
echo LANGKAH TERAKHIR DI MT5 ^(sekali per chart^):
echo  1. Di chart yang memakai EA lama KPX_..._latest: klik kanan - Expert list - Remove.
echo     ^(WAJIB, supaya tidak ada dua bot di satu chart^)
echo  2. Navigator - Expert Advisors - seret KPX_Bot ke chart itu - centang Allow Algo Trading - OK.
echo  3. Pojok kiri atas chart harus menulis "Kantor Pine REAL-TIME" dan "Sinyal: 1 dtk lalu".
echo.
pause
