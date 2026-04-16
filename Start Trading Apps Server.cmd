@echo off
echo ========================================
echo Starting Local Server for Trading Apps
echo ========================================
echo.
echo Server will start at: http://localhost:8000
echo.
echo Open your browser and go to:
echo   http://localhost:8000/apps.html
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

cd standalone
python -m http.server 8000
