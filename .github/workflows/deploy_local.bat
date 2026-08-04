@echo off
echo ========================================================
echo   SelfStudy Local Runner Auto-Deploy Process (CMD)
echo ========================================================

echo [1/4] Stopping any process running on Port 8001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001 ^| findstr LISTENING') do (
    echo Terminating PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)

echo [2/4] Building Frontend (React)...
cd /d "%~dp0..\..\frontend"
call npm.cmd install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed with exit code %errorlevel%
    exit /b %errorlevel%
)

call npm.cmd run build
if %errorlevel% neq 0 (
    echo [ERROR] npm run build failed with exit code %errorlevel%
    exit /b %errorlevel%
)

echo [3/4] Syncing frontend dist to target backend...
cd /d "%~dp0..\.."
if not exist "backend\dist" mkdir "backend\dist"
xcopy /E /Y /Q "frontend\dist\*" "backend\dist\"

if exist "d:\Workstation\selfstudy\backend" (
    if not exist "d:\Workstation\selfstudy\backend\dist" mkdir "d:\Workstation\selfstudy\backend\dist"
    xcopy /E /Y /Q "frontend\dist\*" "d:\Workstation\selfstudy\backend\dist\"
)

echo [4/4] Updating Backend Python Dependencies...
cd /d "%~dp0..\..\backend"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PY_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
) else (
    set "PY_EXE=python"
)

if not exist ".venv\Scripts\python.exe" (
    "%PY_EXE%" -m venv .venv
)

call .venv\Scripts\activate.bat
"%PY_EXE%" -m pip install -r requirements.txt

echo ========================================================
echo [SUCCESS] Local Rebuild Completed Successfully!
echo ========================================================
