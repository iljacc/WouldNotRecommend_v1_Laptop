@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%setup-windows-kiosk.ps1"

if not exist "%PS_SCRIPT%" (
  echo Could not find "%PS_SCRIPT%".
  pause
  exit /b 1
)

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
echo.
echo Done. Read the summary above, then restart Chrome before the exhibition run.
pause
