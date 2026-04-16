@echo off
echo ========================================
echo Refreshing Trading Apps
echo ========================================
echo.

echo [1/3] Updating The Chameleon...
python scripts\update_chameleon.py
echo.

echo [2/3] Updating The Catchup Trader...
python scripts\update_catchup.py
echo.

echo [3/3] Opening apps in browser...
start standalone\chameleon.html
timeout /t 1 /nobreak >nul
start standalone\catchup.html
echo.

echo ========================================
echo Done! Both apps are now updated.
echo ========================================
pause
