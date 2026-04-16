@echo off
setlocal
title Trade1 — refresh data and dashboard
cd /d "%~dp0"

echo.
echo  Trade1: fetching data, merging CSVs, Python backtest, trial dashboard…
echo  (Uses .env in this folder for FRED_API_KEY if set.)
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js from https://nodejs.org and reopen this window.
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: python not found. Install Python 3 and add it to PATH, then try again.
  pause
  exit /b 1
)

call npm run refresh:data
if errorlevel 1 (
  echo.
  echo FAILED — read the messages above. Fix errors, then run this file again.
  pause
  exit /b 1
)

echo.
echo OK — opening dashboard in your browser.
start "" "%~dp0output\trial_dashboard.html"
exit /b 0
