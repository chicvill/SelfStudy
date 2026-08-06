Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Continue"

Write-Host "======================================================="
Write-Host " [SelfStudy & StudyCafe Joint Stack Auto-Deploy Process]"
Write-Host "======================================================="

$WorkspaceDir = Resolve-Path "$PSScriptRoot\..\.."

Write-Host "Working Directory: $WorkspaceDir"
Write-Host "Rebuilding Docker Stack for SelfStudy (8005) & StudyCafe (8001)..."

Set-Location "$WorkspaceDir"
docker compose up -d --build

Write-Host "======================================================="
Write-Host " [SUCCESS] Joint Docker Stack Rebuild Completed!"
Write-Host "======================================================="
