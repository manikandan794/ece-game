# GLITCH HUNT - PowerShell Launcher for Windows
$Host.UI.RawUI.WindowTitle = "GLITCH HUNT - RRASE ECE Event Server"

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "       GLITCH HUNT - RRASE ECE TECHNICAL SYMPOSIUM 2026" -ForegroundColor Cyan
Write-Host "================================================================`n" -ForegroundColor Cyan

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found in PATH. Please install Node.js." -ForegroundColor Red
    pause
    exit 1
}

$backendDir = Join-Path $PSScriptRoot "..\backend"
Set-Location $backendDir

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "[INFO] Starting Real-Time Event Server..." -ForegroundColor Green
node src/server.js
