@echo off
setlocal
title Trade1 — pip install + full refresh
cd /d "%~dp0"

echo.
echo  Trade1: pip install Python deps, then full refresh (same as Refresh Trade1 Data.cmd).
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js from https://nodejs.org
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: python not found. Install Python 3 and add it to PATH.
  pause
  exit /b 1
)

call npm run refresh:all
if errorlevel 1 (
  echo.
  echo FAILED — read the messages above.
  pause
  exit /b 1
)

echo.
echo OK — opening dashboard.
start "" "%~dp0output\trial_dashboard.html"
exit /b 0
