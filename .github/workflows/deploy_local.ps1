Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Continue"

Write-Host "======================================================="
Write-Host " [SelfStudy Local Runner Auto-Deploy Process]"
Write-Host "======================================================="

# 1. Resolve Executables (Python, NPM)
$PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonExe) {
    $candidates = @(
        "C:\Users\user\AppData\Local\Programs\Python\Python314\python.exe",
        "C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe",
        "C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe",
        "C:\Python314\python.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $PythonExe = $c; break }
    }
}
Write-Host "Using Python: $PythonExe"

$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NpmCmd) {
    if (Test-Path "C:\Program Files\nodejs\npm.cmd") {
        $NpmCmd = "C:\Program Files\nodejs\npm.cmd"
    }
}
Write-Host "Using NPM: $NpmCmd"

# Target deployment directory
$TargetDir = "d:\Workstation\selfstudy"
$CurrentWorkspace = Resolve-Path "$PSScriptRoot\..\.."

Write-Host "Current Workspace: $CurrentWorkspace"
Write-Host "Target Deployment Dir: $TargetDir"

# 2. Stop running server on Port 8001
Write-Host "Stopping process on Port 8001..."
try {
    $conns = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            if ($c.OwningProcess -gt 0) {
                Write-Host "Stopping process ID: $($c.OwningProcess)"
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        }
    }
} catch {
    Write-Host "Port notice: $_"
}

# 3. Build Frontend
Write-Host "Building React Frontend..."
Set-Location "$CurrentWorkspace\frontend"
& $NpmCmd install
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit $LASTEXITCODE }
& $NpmCmd run build
if ($LASTEXITCODE -ne 0) { Write-Error "npm build failed"; exit $LASTEXITCODE }

# 4. Sync dist to Target Directory backend/dist
Write-Host "Syncing dist to backend/dist..."
if (Test-Path $TargetDir) {
    if (-not (Test-Path "$TargetDir\backend\dist")) {
        New-Item -ItemType Directory -Path "$TargetDir\backend\dist" -Force
    }
    Copy-Item -Path "$CurrentWorkspace\frontend\dist\*" -Destination "$TargetDir\backend\dist\" -Recurse -Force
}
if (-not (Test-Path "$CurrentWorkspace\backend\dist")) {
    New-Item -ItemType Directory -Path "$CurrentWorkspace\backend\dist" -Force
}
Copy-Item -Path "$CurrentWorkspace\frontend\dist\*" -Destination "$CurrentWorkspace\backend\dist\" -Recurse -Force

# 5. Sync Python dependencies
Write-Host "Updating Python Virtual Environment..."
Set-Location "$TargetDir\backend"
if (-not (Test-Path "$TargetDir\backend\.venv\Scripts\python.exe")) {
    & $PythonExe -m venv "$TargetDir\backend\.venv"
}
& "$TargetDir\backend\.venv\Scripts\python.exe" -m pip install -r "$TargetDir\backend\requirements.txt"

Write-Host "======================================================="
Write-Host " [SUCCESS] Deployment completed successfully!"
Write-Host "======================================================="
