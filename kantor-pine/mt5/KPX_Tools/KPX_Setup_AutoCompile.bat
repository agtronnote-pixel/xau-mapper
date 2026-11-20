@echo off
title Kantor Pine XAUUSD - Setup compile otomatis
set "DIR=%~dp0"
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KPX_AutoCompile.vbs"
> "%VBS%" echo CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%DIR%KPX_AutoCompile.ps1""", 0, False
start "" wscript.exe "%VBS%"
echo.
echo  Compile otomatis AKTIF.
echo  - Berjalan diam-diam di latar belakang dan ikut menyala setiap Windows dinyalakan.
echo  - Setiap EA KPX_*.mq5 di folder Experts MT5 akan langsung di-compile.
echo  - Untuk mematikan: jalankan KPX_Hapus_AutoCompile.bat
echo.
pause
