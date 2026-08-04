Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$ErrorActionPreference = "Continue"

Write-Host "======================================================="
Write-Host " [1/4] Stopping server process on Port 8001..."
Write-Host "======================================================="
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
    Write-Host "Port check notice: $_"
}

Write-Host "======================================================="
Write-Host " [2/4] Building Frontend (React)..."
Write-Host "======================================================="
$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location "$ProjectRoot\frontend"
& npm.cmd install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "======================================================="
Write-Host " [3/4] Syncing frontend dist to backend/dist..."
Write-Host "======================================================="
Set-Location $ProjectRoot
if (-not (Test-Path "backend\dist")) {
    New-Item -ItemType Directory -Path "backend\dist" -Force
}
Copy-Item -Path "frontend\dist\*" -Destination "backend\dist\" -Recurse -Force

Write-Host "======================================================="
Write-Host " [4/4] Updating Backend Python Dependencies..."
Write-Host "======================================================="
Set-Location "$ProjectRoot\backend"
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    python -m venv .venv
}
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "======================================================="
Write-Host " [SUCCESS] Local Rebuild Completed Successfully!"
Write-Host "======================================================="
