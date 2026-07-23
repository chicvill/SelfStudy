@echo off
echo ========================================================
echo   SelfStudy Platform - Google Cloud Run Deploy Script
echo ========================================================
echo.

set GCLOUD_BIN=gcloud
where gcloud >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" (
        set "GCLOUD_BIN=%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    ) else if exist "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" (
        set "GCLOUD_BIN=C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
    ) else (
        echo [ERROR] gcloud CLI is not installed or not in PATH.
        echo Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
        pause
        exit /b 1
    )
)

set SERVICE_NAME=selfstudy
set REGION=asia-northeast3

echo [1/3] Building React Frontend locally...
cd frontend
call npm run build
cd ..

echo [2/3] Syncing dist to backend...
if not exist "backend\dist" mkdir "backend\dist"
xcopy /E /Y /Q "frontend\dist\*" "backend\dist\"

echo [3/3] Deploying to Google Cloud Run...
echo Service Name: %SERVICE_NAME%
echo Region: %REGION%
echo.

set ENV_VARS=
if exist .env (
    echo [.env found] Parsing environment variables...
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="GEMINI_API_KEY" set "GEMINI_API_KEY=%%B"
        if "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
        if "%%A"=="CLOUDFLARE_TUNNEL_TOKEN" set "CLOUDFLARE_TUNNEL_TOKEN=%%B"
    )
)

if not "%GEMINI_API_KEY%"=="" set "ENV_VARS=GEMINI_API_KEY=%GEMINI_API_KEY%"

if not "%DATABASE_URL%"=="" (
    if not "%ENV_VARS%"=="" (
        set "ENV_VARS=%ENV_VARS%,DATABASE_URL=%DATABASE_URL%"
    ) else (
        set "ENV_VARS=DATABASE_URL=%DATABASE_URL%"
    )
)

if not "%ENV_VARS%"=="" (
    echo [ENV] Environment variables configured.
    echo Running gcloud run deploy...
    "%GCLOUD_BIN%" run deploy %SERVICE_NAME% --source . --region %REGION% --allow-unauthenticated --set-env-vars "%ENV_VARS%"
) else (
    echo [WARN] Environment variables not found in .env. Deploying without env vars.
    echo Running gcloud run deploy...
    "%GCLOUD_BIN%" run deploy %SERVICE_NAME% --source . --region %REGION% --allow-unauthenticated
)

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Google Cloud Run Deployment Complete!
    echo ========================================================
    echo.
    "%GCLOUD_BIN%" run services describe %SERVICE_NAME% --region %REGION% --format="value(status.url)"
    echo.
) else (
    echo.
    echo [FAIL] Deployment failed. Please check the logs above.
)

pause
