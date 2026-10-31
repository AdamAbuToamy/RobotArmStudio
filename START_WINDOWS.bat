@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 python -m venv .venv
  if errorlevel 1 (
    echo Install Python 3.10 or newer from https://www.python.org/downloads/ then run again.
    pause
    exit /b 1
  )
)
.venv\Scripts\python.exe -c "import aiohttp, serial, qrcode" >nul 2>&1
if errorlevel 1 (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (pause & exit /b 1)
)
.venv\Scripts\python.exe server.py
pause
