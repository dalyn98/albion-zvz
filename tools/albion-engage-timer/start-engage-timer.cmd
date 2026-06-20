@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0AlbionEngageTimer.ps1"
if errorlevel 1 (
  echo.
  echo Albion Engage Timer failed to start.
  echo Log file: %%APPDATA%%\AlbionEngageTimer\app.log
  echo.
  pause
)
