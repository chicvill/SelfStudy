@echo off
chcp 65001 > nul
echo ========================================================
echo   SelfStudy & StudyCafe Joint Production Launcher
echo ========================================================
echo.
echo Starting SelfStudy (http://localhost:8005) and StudyCafe (http://localhost:8001)...
cd /d "%~dp0"

docker compose up -d --build
echo.
echo Container Status:
docker compose ps
echo.
pause
