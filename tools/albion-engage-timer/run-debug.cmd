@echo off
setlocal

echo Starting Albion Engage Timer in debug mode...
echo If the app fails, copy the error text from this window.
echo Log file: %%APPDATA%%\AlbionEngageTimer\app.log
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0AlbionEngageTimer.ps1"

echo.
echo App exited with code %ERRORLEVEL%.
echo Press any key to close this window.
pause >nul
