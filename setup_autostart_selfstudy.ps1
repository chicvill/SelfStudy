# SelfStudy Auto-Start Setup Script (Windows Startup Folder)
$ErrorActionPreference = "Stop"

$StartupFolder = [System.Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder "SelfStudy_Production.lnk"
$TargetPath = "d:\Workstation\selfstudy\RUN_PROD.BAT"
$WorkingDir = "d:\Workstation\selfstudy"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.WindowStyle = 7 # Minimized
$Shortcut.Save()

Write-Host "[OK] SelfStudy auto-start shortcut created successfully at:"
Write-Host "     $ShortcutPath"
