@echo off
setlocal
cd /d "%~dp0"
title HELMINTH - HyperNEAT Ecology

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js and npm were not found on PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo [SETUP] Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [HELMINTH] Starting local ecology server...
echo [HELMINTH] App URL: http://127.0.0.1:4173/
echo [HELMINTH] Press Ctrl+C to stop.

start "" powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 40; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4173/' -TimeoutSec 1; Start-Process 'http://127.0.0.1:4173/'; break } catch { Start-Sleep -Milliseconds 350 } }"
call npm run dev -- --port 4173 --strictPort

if errorlevel 1 (
  echo.
  echo [ERROR] The local server stopped with an error.
  pause
  exit /b 1
)

endlocal
