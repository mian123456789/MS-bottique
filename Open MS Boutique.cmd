@echo off
setlocal
title MS Boutique Factory Management System
cd /d "%~dp0"

echo ==========================================================
echo   MS Boutique - Factory Management System
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer.
  echo Install Node.js 22 or newer from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run - installing what the app needs. This can take a few minutes...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the server. Your browser will open by itself when it is ready.
echo.
echo   KEEP THIS WINDOW OPEN while you use the system.
echo   Close it, or press Ctrl+C, to shut the system down.
echo.

rem Wait for the port to answer in the background, then open the browser.
start "MS Boutique launcher" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 150; $i++) { try { $null = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2; Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Seconds 2 } }"

call npm run dev

echo.
echo The server has stopped.
pause
