@echo off
title Kantor Pine XAUUSD - Matikan compile otomatis
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KPX_AutoCompile.vbs" 2>nul
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*KPX_AutoCompile.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo  Compile otomatis sudah DIMATIKAN.
echo.
pause
