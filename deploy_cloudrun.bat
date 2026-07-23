@echo off
echo ========================================================
echo   SelfStudy Platform - Google Cloud Run Deploy Script
echo ========================================================
echo.

where gcloud >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] gcloud CLI is not installed or not in PATH.
    echo Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
    pause
    exit /b 1
)

set SERVICE_NAME=selfstudy
set REGION=asia-northeast3

echo [INFO] Starting Google Cloud Run deployment...
echo Service Name: %SERVICE_NAME%
echo Region: %REGION%
echo.

set ENV_VARS=
if exist .env (
    echo [.env found] Parsing environment variables...
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="GEMINI_API_KEY" set "GEMINI_API_KEY=%%B"
        if "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
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
    gcloud run deploy %SERVICE_NAME% --source . --region %REGION% --allow-unauthenticated --set-env-vars "%ENV_VARS%"
) else (
    echo [WARN] GEMINI_API_KEY or DATABASE_URL not found in .env. Deploying without env vars.
    echo Running gcloud run deploy...
    gcloud run deploy %SERVICE_NAME% --source . --region %REGION% --allow-unauthenticated
)

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Google Cloud Run deployment completed successfully!
) else (
    echo.
    echo [FAIL] Deployment failed. Please check the logs above.
)

pause
