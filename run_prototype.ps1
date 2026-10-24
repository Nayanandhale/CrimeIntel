# CrimeIntel PowerShell Launcher
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " CRIMEINTEL // AI CRIMINAL NETWORK ANALYSIS PLATFORM" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting CrimeIntel Backend and launching Evidence Constellation..." -ForegroundColor Green

$env:PYTHONIOENCODING = "utf-8"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path "$ScriptDir\backend"

# Launch default browser
Start-Process "http://127.0.0.1:8000"

# Run server with py or python
try {
    & py -m uvicorn main:app --host 127.0.0.1 --port 8000
} catch {
    & python -m uvicorn main:app --host 127.0.0.1 --port 8000
}
