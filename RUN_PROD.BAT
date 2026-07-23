@echo off
chcp 65001 > nul
echo ========================================================
echo   SelfStudy Platform - Local Production Start Script
echo ========================================================
echo.

:: Load environment variables from .env
if exist .env (
    echo [.env 발견] 환경 변수를 파싱합니다...
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        set "%%A=%%B"
    )
)

echo 1. Building Frontend React Application...
cd frontend
call npm install
call npm run build
cd ..

echo 2. Syncing frontend dist to backend for Single-Container serving...
if not exist "backend\dist" mkdir "backend\dist"
xcopy /E /Y /Q "frontend\dist\*" "backend\dist\"

echo 3. Starting Unified FastAPI Server (Port 8001)...
start "SelfStudy Unified Server" cmd /k "cd backend && call .venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8001"

if not "%CLOUDFLARE_TUNNEL_TOKEN%"=="" (
    echo 4. Starting Cloudflare Tunnel...
    start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --no-autoupdate run --token %CLOUDFLARE_TUNNEL_TOKEN%"
) else (
    echo Cloudflare Tunnel token not found in .env. Running in local mode.
)

echo.
echo [OK] All production services started!
echo - Unified Server: http://localhost:8001
echo - Custom Domain (Cloudflare Tunnel): https://selfstudy.chicvill.store
echo.
pause
