@echo off
setlocal
set "APP=%~dp0standalone\index.html"
if not exist "%APP%" (
  echo Standalone app not found yet.
  echo Open Cursor and run the trial/build flow once so the standalone bundle is generated.
  pause
  exit /b 1
)
start "" "%APP%"
