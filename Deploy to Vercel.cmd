@echo off
echo ========================================
echo Deploy Trade1 to Vercel (static site)
echo ========================================
echo.
echo This uploads the "standalone" folder only.
echo First time: browser will ask you to log in to Vercel.
echo.
cd /d "%~dp0standalone"
call npx vercel --prod
echo.
pause
