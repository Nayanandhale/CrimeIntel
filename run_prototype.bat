@echo off
title CrimeIntel
color 0B
echo =========================================================================
echo  CRIMEINTEL // AI-POWERED CRIMINAL NETWORK ANALYSIS SYSTEM
echo =========================================================================
echo.
echo Starting FastAPI Core Backend and Serving Evidence Constellation UI...
echo.

set PYTHONIOENCODING=utf-8
cd /d "%~dp0backend"

echo Opening browser at http://127.0.0.1:8000 ...
start http://127.0.0.1:8000

py -m uvicorn main:app --host 127.0.0.1 --port 8000
if %errorlevel% neq 0 (
    echo.
    echo 'py' launcher failed, trying 'python'...
    python -m uvicorn main:app --host 127.0.0.1 --port 8000
)

pause
