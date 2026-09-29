@echo off
title GLITCH HUNT - RRASE ECE Event Server
color 0b

echo ================================================================
echo       GLITCH HUNT - RRASE ECE TECHNICAL SYMPOSIUM 2026
echo ================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (v18 or higher) from https://nodejs.org/
    pause
    exit /b 1
)

:: Navigate to backend
cd /d "%~dp0\..\backend"

:: Check node_modules
if not exist "node_modules\" (
    echo [INFO] Installing backend dependencies...
    call npm install
)

:: Start the server
echo.
echo [INFO] Launching GLITCH HUNT Real-Time Event Server...
echo.
node src/server.js

pause
