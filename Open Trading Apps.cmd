@echo off
echo ========================================
echo Opening Trading Apps
echo ========================================
echo.

echo [1/2] Updating app data...
python scripts\update_chameleon.py
python scripts\update_catchup.py
echo.

echo [2/2] Starting server...
cd standalone
start http://localhost:8000/apps.html
python -m http.server 8000
