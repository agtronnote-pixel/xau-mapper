@echo off
title Kantor Pine - Setup KPX_Agent
set "DIR=%~dp0"
if exist "%DIR%KPX_Agent.config" goto run
set "URL=https://agtronnote-pixel.github.io/xau-mapper/kantor-pine/app/"
echo Alamat aplikasi (Enter = %URL%)
set /p URL=Alamat: 
echo.
echo Aset yang EA-nya diunduh, dipisah koma (Enter = XAUUSD)
echo Contoh: XAUUSD,BTCUSD,GBPUSD,USA100,SNP500
set "ASET=XAUUSD"
set /p ASET=Aset: 
> "%DIR%KPX_Agent.config" echo %URL%
>> "%DIR%KPX_Agent.config" echo %ASET%
:run
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KPX_Agent.vbs"
> "%VBS%" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_Agent.ps1""", 0, False
start "" wscript.exe "%VBS%"
echo.
echo  KPX_Agent AKTIF: EA mapping terbaru diunduh tiap 5 menit ke folder Experts.
echo  Ubah daftar aset: edit baris ke-2 KPX_Agent.config lalu jalankan ulang file ini.
echo  Pastikan KPX_Setup_AutoCompile.bat juga sudah dijalankan.
echo.
pause
