@echo off
title Kantor Pine XAUUSD - Setup KPX_Agent
set "DIR=%~dp0"
if exist "%DIR%KPX_Agent.config" goto run
echo Masukkan alamat aplikasi Kantor Pine, contoh: https://NAMA.github.io/REPO/
set /p URL=Alamat: 
> "%DIR%KPX_Agent.config" echo %URL%
:run
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KPX_Agent.vbs"
> "%VBS%" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_Agent.ps1""", 0, False
start "" wscript.exe "%VBS%"
echo.
echo  KPX_Agent AKTIF: EA mapping terbaru diunduh tiap 5 menit ke folder Experts.
echo  Pastikan KPX_Setup_AutoCompile.bat juga sudah dijalankan.
echo.
pause
