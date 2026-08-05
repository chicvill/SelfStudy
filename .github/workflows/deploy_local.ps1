Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Continue"

Write-Host "======================================================="
Write-Host " [SelfStudy Local Runner Auto-Deploy Process]"
Write-Host "======================================================="

$TargetDir = "d:\Workstation\selfstudy"
$CurrentWorkspace = Resolve-Path "$PSScriptRoot\..\.."

Write-Host "Current Workspace: $CurrentWorkspace"
Write-Host "Target Deployment Dir: $TargetDir"

# 1. Load .env variables
$envFile = "$TargetDir\.env"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env..."
    Get-Content $envFile | ForEach-Object {
        $l = $_.Trim()
        if ($l -and -not $l.StartsWith("#") -and $l.Contains("=")) {
            $kv = $l.Split("=", 2)
            $k = $kv[0].Trim()
            $v = $kv[1].Trim()
            [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
}

# 2. Resolve Executables (Python, NPM)
$PythonExe = "$TargetDir\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $PythonExe) {
        $candidates = @(
            "C:\Users\user\AppData\Local\Programs\Python\Python314\python.exe",
            "C:\Users\user\AppData\Local\Programs\Python\Python313\python.exe",
            "C:\Users\user\AppData\Local\Programs\Python\Python312\python.exe"
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) { $PythonExe = $c; break }
        }
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

# 3. Stop running server on Port 8001 and existing cloudflared
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
} catch {}

Write-Host "Stopping cloudflared process..."
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 4. Build Frontend
Write-Host "Building React Frontend..."
Set-Location "$CurrentWorkspace\frontend"
& $NpmCmd install
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit $LASTEXITCODE }
& $NpmCmd run build
if ($LASTEXITCODE -ne 0) { Write-Error "npm build failed"; exit $LASTEXITCODE }

# 5. Sync dist to Target Directory backend/dist
Write-Host "Syncing dist to backend/dist..."
$distTargets = @("$TargetDir\backend\dist", "$CurrentWorkspace\backend\dist")
foreach ($t in $distTargets) {
    if (-not (Test-Path $t)) {
        New-Item -ItemType Directory -Path $t -Force
    }
    Copy-Item -Path "$CurrentWorkspace\frontend\dist\*" -Destination $t -Recurse -Force
}

# 5.5 Sync Python code to Target Directory
Write-Host "Syncing backend Python code to Target Directory..."
Copy-Item -Path "$CurrentWorkspace\backend\*" -Destination "$TargetDir\backend\" -Recurse -Force -Exclude ".venv", "__pycache__"

# 6. Sync Python dependencies
Write-Host "Updating Python Virtual Environment..."
Set-Location "$TargetDir\backend"
if (-not (Test-Path "$TargetDir\backend\.venv\Scripts\python.exe")) {
    & $PythonExe -m venv "$TargetDir\backend\.venv"
}
$VenvPython = "$TargetDir\backend\.venv\Scripts\python.exe"
& $VenvPython -m pip install -r "$TargetDir\backend\requirements.txt"

# 7. Restart Server and Cloudflare Tunnel in background (detached via CIM/WMI)
Write-Host "Restarting Backend Uvicorn Server on Port 8001..."
$backendCmd = "cmd.exe /c `"cd /d $TargetDir\backend & .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001`""
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $backendCmd } | Out-Null

$token = $env:CLOUDFLARE_TUNNEL_TOKEN
if ($token) {
    Write-Host "Restarting Cloudflare Tunnel..."
    $cfExe = "$TargetDir\cloudflared.exe"
    if (-not (Test-Path $cfExe)) { $cfExe = "cloudflared" }
    $cfCmd = "cmd.exe /c `"cd /d $TargetDir & `"$cfExe`" tunnel --no-autoupdate run --token $token`""
    Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cfCmd } | Out-Null
} else {
    Write-Host "No CLOUDFLARE_TUNNEL_TOKEN found in environment or .env file."
}

Write-Host "======================================================="
Write-Host " [SUCCESS] Deployment completed successfully!"
Write-Host "======================================================="




